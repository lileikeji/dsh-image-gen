// dsh-image-gen: multi-provider image generation for text-only agents.
//
// image_generate(prompt, size?, model?): walks the configured provider chain
// (SiliconFlow / CogView / Wanx / any OpenAI-compatible endpoint), each row
// with its own API key, generating via POST {base}/images/generations.
// Failures are classified (quota / rate-limit / network / other) and fall to
// the next provider; a per-turn failure budget caps the chain walk.
//
// Verification: after a successful generation the image bytes are sniffed for
// a real media type and decoded with sharp (rejects blank/truncated/corrupt
// images), and when verifyProviders is configured each produced image is also
// sent to a vision model chain to check it rendered correctly. A verification
// failure marks the row as unusable for the turn and the chain retries.
//
// Pure-text safe: generated images are persisted via ctx.attachments and the
// tool output carries { text, image } — the conversation renders the image
// block and text-only models keep working.

import z from '@deepseek-ai/schemastery'
import sharp from 'sharp'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

export const name = 'image-gen'
export const inject = ['tools', 'attachments', 'webServer']

/** Provider presets shipped with the plugin (name -> base settings). */
export const PRESETS = {
  siliconflow: {
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Kwai-Kolors/Kolors',
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'cogview-3-flash',
  },
  wanx: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'wanx2.1-t2i-flash',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'stabilityai/stable-diffusion-xl',
  },
}

export const DEFAULT_PROVIDERS = [
  {
    name: 'siliconflow',
    baseURL: PRESETS.siliconflow.baseURL,
    model: PRESETS.siliconflow.defaultModel,
    apiKeyEnv: 'SILICONFLOW_API_KEY',
  },
  {
    name: 'zhipu',
    baseURL: PRESETS.zhipu.baseURL,
    model: PRESETS.zhipu.defaultModel,
    apiKeyEnv: 'ZHIPU_API_KEY',
  },
  {
    name: 'wanx',
    baseURL: PRESETS.wanx.baseURL,
    model: PRESETS.wanx.defaultModel,
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
]

export const Config = z.object({
  providers: z
    .array(
      z.object({
        name: z.string(),
        baseURL: z.string(),
        model: z.string(),
        apiKey: z.string().default(''),
        apiKeyEnv: z.string().default(''),
        size: z.string().default('1024x1024'),
      }),
    )
    .default(DEFAULT_PROVIDERS),
  maxAttempts: z.number().step(1).min(1).max(10).default(3),
  verify: z.boolean().default(true),
  verifyProviders: z
    .array(
      z.object({
        name: z.string(),
        baseURL: z.string(),
        model: z.string(),
        apiKeyEnv: z.string().default(''),
      }),
    )
    .default([]),
  minWidth: z.number().step(1).min(16).default(256),
  minHeight: z.number().step(1).min(16).default(256),
  timeoutMs: z.number().step(1).min(1000).max(600000).default(120000),
  artifactsDir: z.string().default('.dsh-image-gen/artifacts'),
  tool: z.boolean().default(true),
})

const FAILURE_ADVICE = {
  quota: 'provider reported insufficient credits (402); top up or switch provider',
  'rate-limit': 'rate limited (429); retry later or switch provider',
  network: 'network failure; check connectivity or the endpoint',
  invalid: 'provider rejected the request (400/422); check model name / prompt / size',
  other: 'unexpected error',
}

export function classifyFailure(message) {
  const text = String(message ?? '')
  if (/insufficient|balance|credits|\b402\b/i.test(text)) return 'quota'
  if (/\b429\b|rate.?limit/i.test(text)) return 'rate-limit'
  if (/ECONN|ETIMEDOUT|ENOTFOUND|timed? ?out|network|fetch failed|socket|EHOSTUNREACH/i.test(text)) return 'network'
  if (/\b400\b|\b422\b|invalid|unsupported|unknown model|does not exist/i.test(text)) return 'invalid'
  return 'other'
}

export function failureAdvice(message) {
  return FAILURE_ADVICE[classifyFailure(message)]
}

/** Sniff image media type from magic bytes (extension-less attachments too). */
export function sniffMediaType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  return undefined
}

function readableApiError(body) {
  try {
    const parsed = JSON.parse(String(body))
    if (parsed.error?.message) return String(parsed.error.message).slice(0, 400)
    if (parsed.message) return String(parsed.message).slice(0, 400)
  } catch {
    /* fall through */
  }
  return String(body ?? '').slice(0, 400)
}

/**
 * Call one OpenAI-compatible images/generations endpoint; returns raw bytes.
 * Handles both { url } and { b64_json } response shapes.
 */
export async function generateImage(provider, prompt, size, signal) {
  const apiKey = provider.apiKey
  const baseUrl = String(provider.baseURL ?? '').replace(/\/+$/, '')
  if (!apiKey) throw new Error('no API key configured for provider ' + provider.name)
  const timeout = AbortSignal.timeout(provider.timeoutMs ?? 120000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(baseUrl + '/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      prompt,
      n: 1,
      size: size || provider.size || '1024x1024',
    }),
    signal: combined,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error('image API ' + response.status + ' ' + response.statusText + ': ' + readableApiError(body))
  }
  const data = await response.json().catch(() => undefined)
  const item = data?.data?.[0]
  if (!item) throw new Error('image API returned no data')
  let bytes
  if (item.b64_json) {
    bytes = Uint8Array.from(Buffer.from(item.b64_json, 'base64'))
  } else if (item.url) {
    const imgResp = await fetch(item.url, { signal: combined })
    if (!imgResp.ok) throw new Error('download generated image failed ' + imgResp.status)
    bytes = new Uint8Array(await imgResp.arrayBuffer())
  } else {
    throw new Error('image API response lacks url / b64_json')
  }
  const mediaType = sniffMediaType(bytes)
  if (!mediaType) throw new Error('generated bytes are not a recognizable image (png/jpeg/webp/gif)')
  return { bytes, mediaType }
}

/**
 * Decode with sharp and sanity-check the render: real dimensions and not a
 * blank/black single-color image. Returns { ok, width, height, reason }.
 */
export async function verifyImageBytes(bytes, config) {
  try {
    const meta = await sharp(Buffer.from(bytes)).metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    const minW = Number.isFinite(config.minWidth) ? config.minWidth : 256
    const minH = Number.isFinite(config.minHeight) ? config.minHeight : 256
    if (width < minW || height < minH) {
      return { ok: false, width, height, reason: 'image too small (' + width + 'x' + height + ')' }
    }
    const stats = await sharp(Buffer.from(bytes)).resize({ width: 16, height: 16 }).stats()
    const channels = stats.channels
    const mean = ((channels[0]?.mean ?? 0) + (channels[1]?.mean ?? 0) + (channels[2]?.mean ?? 0)) / 3
    if (mean < 1) {
      return { ok: false, width, height, reason: 'image is blank/black (mean luminance ' + mean.toFixed(1) + ')' }
    }
    return { ok: true, width, height }
  } catch (error) {
    return { ok: false, width: 0, height: 0, reason: 'decode failed: ' + String(error?.message ?? error) }
  }
}

/** Resolve an API key from the credentials service (env reference) or env. */
async function resolveApiKey(ctx, provider) {
  // 优先使用配置里直接填写的密钥，其次按 apiKeyEnv 从 credentials/.env 解析。
  if (typeof provider === 'string') provider = { apiKeyEnv: provider }
  if (provider.apiKey && String(provider.apiKey).trim() !== '') return String(provider.apiKey).trim()
  const apiKeyEnv = provider.apiKeyEnv
  if (!apiKeyEnv) return undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const ref = { type: 'env', name: apiKeyEnv }
      const resolved = await credentials.resolve(ref)
      if (resolved?.value) return resolved.value
    } catch {
      /* fall back to process.env */
    }
  }
  return process.env[apiKeyEnv]
}

/** 生图模型关键词：/models 列表里据此智能挑选图像生成模型。 */
const IMAGE_MODEL_HINTS = [
  /image/i, /kolors/i, /flux/i, /t2i/i, /txt2img/i, /draw/i, /seedream/i, /stable-diffusion/i,
  /dall-e/i, /cogview/i, /wanx/i, /z-image/i, /pixart/i, /sdxl/i, /midjourney/i, /gpt-image/i,
]

/** 从一个模型 id 列表里挑一个生图模型；挑不到返回 undefined。 */
export function pickImageModel(models) {
  if (!Array.isArray(models) || models.length === 0) return undefined
  const hint = (id) => IMAGE_MODEL_HINTS.some((re) => re.test(String(id)))
  return models.find(hint) || models.find((id) => /^[^/]+\/[^/]+$/.test(String(id)) && !/embed|rerank|audio|tts|asr|vision|chat|llm/i.test(String(id)))
}

/** GET {base}/models and return the model id list (OpenAI-compatible). */
export async function listModels(provider) {
  const baseUrl = String(provider.baseURL ?? '').replace(/\/+$/, '')
  const apiKey = provider.apiKey && String(provider.apiKey).trim() !== '' ? String(provider.apiKey).trim() : provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined
  if (!apiKey) throw new Error('no API key configured for ' + provider.name)
  const response = await fetch(baseUrl + '/models', {
    headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error('GET /models ' + response.status + ': ' + readableApiError(body))
  }
  const data = await response.json().catch(() => undefined)
  const list = Array.isArray(data?.data)
    ? data.data.map((row) => typeof row === 'string' ? row : row?.id).filter(Boolean)
    : Array.isArray(data?.models)
      ? data.models.map((row) => typeof row === 'string' ? row : row?.id).filter(Boolean)
      : []
  return [...new Set(list)]
}

/** Ask one OpenAI-compatible vision endpoint whether the image rendered correctly. */
export async function verifyWithVision(provider, bytes, mediaType, prompt, signal) {
  const apiKey = provider.apiKey
  const baseUrl = String(provider.baseURL ?? '').replace(/\/+$/, '')
  if (!apiKey) throw new Error('no API key for verification provider ' + provider.name)
  const timeout = AbortSignal.timeout(provider.timeoutMs ?? 120000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const dataUrl = 'data:' + mediaType + ';base64,' + Buffer.from(bytes).toString('base64')
  const response = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '这是一张刚生成的图片。请只判断它是否渲染正常（无黑屏、无截断、无乱码、主体可见）。正常回答：OK。异常请说明问题。绘制要求：' + prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 200,
    }),
    signal: combined,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error('verify API ' + response.status + ': ' + readableApiError(body))
  }
  const data = await response.json().catch(() => undefined)
  const text = data?.choices?.[0]?.message?.content ?? ''
  const verdict = /\bOK\b/i.test(String(text).slice(0, 200))
  return { ok: verdict, detail: String(text).slice(0, 300) }
}
export function apply(ctx, config = {}) {
  // Live configuration: composition entry at boot, then the settings section.
  let current = () => config

  const providersOf = () => {
    const list = current().providers ?? DEFAULT_PROVIDERS
    return Array.isArray(list) && list.length > 0 ? list : DEFAULT_PROVIDERS
  }
  const verifyProvidersOf = async () => {
    const explicit = current().verifyProviders ?? []
    if (Array.isArray(explicit) && explicit.length > 0) return explicit
    return providersOf()
  }
  const maxAttempts = () => {
    const value = current().maxAttempts
    return Number.isFinite(value) && value > 0 ? value : 3
  }
  const verifyEnabled = () => current().verify !== false
  const timeoutMs = () => {
    const value = current().timeoutMs
    return Number.isFinite(value) && value > 0 ? value : 120000
  }

  installSettingsSection(ctx, settingsNamespace('image-gen'), Config, config, {
    setSource: (source) => { current = source },
    onChange: () => {},
  })

  if (config.tool !== false) {
    ctx.tools.register({
      name: 'image_generate',
      description:
        '根据文字描述生成图片。走配置的生成模型链（默认 SiliconFlow，可配 CogView/万相/OpenAI 兼容），' +
        '每个供应商独立 Key，失败自动按链回退；生成后自动校验图片是否正常（黑图/截断/尺寸过小会自动换下一个供应商重试）。',
      parameters: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            description: '图片描述，越详细越好（主体、风格、构图、光线、色彩）',
          },
          size: {
            type: 'string',
            description: '可选生成尺寸，默认 1024x1024（如 512x512、1024x1792）',
          },
          model: {
            type: 'string',
            description: '可选：指定供应商/模型（如 siliconflow/Kwai-Kolors/Kolors），不填则走默认链',
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string' },
            path: { type: 'string' },
            image: { type: 'object' },
            verified: { type: 'string' },
          },
          additionalProperties: true,
        },
        render: (_args, value) => {
          const blocks = []
          if (value.image) blocks.push({ type: 'image', attachment: value.image })
          blocks.push({ type: 'text', text: value.text })
          return blocks
        },
      },
      presentCall(args) {
        return {
          card: 'generic',
          title: '生成图片：' + String(args.prompt || '').slice(0, 40),
          kind: 'execute',
        }
      },
      presentResult(_args, result) {
        return { card: 'generic', title: '图片已生成', content: result.content }
      },
      async execute(args, exec) {
        const providers = providersOf()
        const attempts = maxAttempts()
        const errors = []
        const size = args.size || undefined

        const overrideName = String(args.model ?? '').split('/')[0] || undefined
        const overrideModel = String(args.model ?? '').includes('/')
          ? String(args.model).split('/').slice(1).join('/')
          : undefined

        let chain = providers
        if (overrideName) {
          const matches = providers.filter((p) => p.name === overrideName)
          if (matches.length === 0) {
            const preset = PRESETS[overrideName]
            if (!preset) {
              throw new Error('未知供应商 ' + overrideName + '，可用：' + providers.map((p) => p.name).join(', '))
            }
            chain = [{
              name: overrideName,
              baseURL: preset.baseURL,
              model: overrideModel || preset.defaultModel,
              apiKeyEnv: (overrideName + '_API_KEY').toUpperCase(),
            }]
          } else {
            chain = matches.map((p) => ({ ...p, model: overrideModel || p.model }))
          }
        }

        for (let i = 0; i < Math.min(chain.length, attempts); i++) {
          const provider = chain[i]
          try {
            const apiKey = await resolveApiKey(ctx, provider)
            // 未显式指定模型：自动拉取该供应商模型列表并挑选生图模型；
            // 拉取失败或挑不到时回退到默认模型（或保留已配置的 model）。
            let model = provider.model
            if (!model) {
              try {
                const models = await listModels({ ...provider, apiKey })
                model = pickImageModel(models)
              } catch {
                model = undefined
              }
              if (!model) {
                const preset = PRESETS[provider.name]
                model = preset ? preset.defaultModel : undefined
              }
            }
            if (!model) throw new Error('未配置模型，且无法自动选择：请为 ' + provider.name + ' 设置 model 或用「获取模型」选择')
            const providerFull = { ...provider, model, apiKey, timeoutMs: timeoutMs() }
            const img = await generateImage(providerFull, args.prompt, size, exec.signal)

            const check = await verifyImageBytes(img.bytes, current())
            if (!check.ok) {
              errors.push(provider.name + ': ' + check.reason)
              continue
            }

            let verified = 'size:' + check.width + 'x' + check.height
            if (verifyEnabled()) {
              const vProviders = await verifyProvidersOf()
              for (const vp of vProviders) {
                try {
                  const vKey = await resolveApiKey(ctx, vp)
                  if (!vKey) continue
                  const verdict = await verifyWithVision(
                    { ...vp, apiKey: vKey, timeoutMs: timeoutMs() },
                    img.bytes,
                    img.mediaType,
                    String(args.prompt || '').slice(0, 300),
                    exec.signal,
                  )
                  verified += ' | vision:' + (verdict.ok ? 'OK' : verdict.detail)
                  if (!verdict.ok) {
                    errors.push(provider.name + ': vision verification failed: ' + verdict.detail)
                    throw new Error('verify-failed')
                  }
                  break
                } catch (error) {
                  if (String(error?.message ?? '').includes('verify-failed')) throw error
                }
              }
            }
            try {
              const ref = await ctx.attachments.saveImage({
                data: img.bytes,
                mediaType: img.mediaType,
                name: 'image-gen-' + Date.now(),
              })
              return {
                text: '图片已生成（' + img.mediaType + '，' + check.width + 'x' + check.height + '，' + img.bytes.length + ' 字节）' +
                  (verified ? '；校验：' + verified : ''),
                image: ref,
              }
            } catch {
              const { writeFile, mkdir } = await import('node:fs/promises')
              const { join } = await import('node:path')
              const dir = join(process.cwd(), current().artifactsDir ?? '.dsh-image-gen/artifacts')
              await mkdir(dir, { recursive: true })
              const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[img.mediaType] || 'png'
              const file = join(dir, 'image-gen-' + Date.now() + '.' + ext)
              await writeFile(file, img.bytes)
              return {
                text: '图片已生成并保存到 ' + file + '（' + img.mediaType + '，' + check.width + 'x' + check.height + '）' +
                  (verified ? '；校验：' + verified : ''),
                path: file,
              }
            }
          } catch (error) {
            if (String(error?.message ?? '').includes('verify-failed')) {
              continue
            }
            const cls = classifyFailure(String(error?.message ?? error))
            errors.push(provider.name + ': ' + (error?.message ?? String(error)) + ' (' + cls + ')')
          }
        }
        throw new Error('所有生成供应商均失败。' + errors.join(' | '))
      },
    })
  }

  // /dsh-image-gen/models: 前端「获取模型列表」按钮的后端。
  // body: { name, baseURL, apiKey, apiKeyEnv } —— apiKey 明文优先，apiKeyEnv 兜底。
  ctx.inject(['webServer'], (wctx) => {
    const disposers = [
      wctx.webServer.register({
        kind: 'exact',
        path: '/dsh-image-gen/models',
        handler: async (request, response) => {
          const send = (status, body) => {
            response.writeHead(status, { 'content-type': 'application/json' })
            response.end(JSON.stringify(body))
          }
          if (request.method !== 'POST') { send(405, { error: 'POST only' }); return }
          let body = {}
          try {
            let raw = ''
            for await (const chunk of request) raw += chunk
            body = JSON.parse(raw || '{}')
          } catch { send(400, { error: 'invalid JSON body' }); return }
          const name = String(body.name ?? '')
          const baseURL = String(body.baseURL ?? '')
          const apiKey = String(body.apiKey ?? '')
          const apiKeyEnv = String(body.apiKeyEnv ?? '')
          if (!baseURL) { send(400, { error: 'baseURL required' }); return }
          try {
            const models = await listModels({ name: name || 'custom', baseURL, apiKey, apiKeyEnv })
            send(200, { ok: true, models })
          } catch (error) {
            send(502, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  })
}

// 默认导出：兼容 ESM/CJS 互操作。
// vite/esbuild 对"只有命名导出、没有 default"的 ESM 模块做默认导入互操作时，
// 会解析出 undefined，导致 loader 报 "invalid plugin ... received undefined"。
export default { name, apply, Config, inject }
