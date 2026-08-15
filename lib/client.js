// dsh-image-gen browser half: the 设置 > 插件 > 插件配置 card that edits
// the `image-gen` settings section owned by the host half. Self-contained
// by hand (no bundler): the client module system wraps it in a CJS factory.
window.__ModuleLoader__.load({
  id: 'dsh-image-gen',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const { useState, useMemo } = React

    const NS = 'image-gen'
    const zh = {
      nav: '生图模型（image-gen）',
      desc: '多供应商生图链：每行一个「供应商/模型」，独立 API Key，失败自动按链回退；生成后自动校验图片是否正常 · 面板 v1',
      pending: '未保存',
      readOnly: '当前设置提供方只读。',
      overridden: '已覆盖',
      reset: '恢复默认',
      chainLabel: '生成模型链（按顺序失败回退）',
      chainHint: '第一行是主生图供应商，后面的行在其失败时依次回退。每行独立 Key（环境变量名）。',
      addFallback: '+ 添加供应商',
      remove: '移除',
      removeTitle: '移除这一行',
      nameLabel: '名称',
      baseUrlLabel: '接口地址',
      modelLabel: '模型',
      keyEnvLabel: 'Key 环境变量',
      sizeLabel: '尺寸',
      preset: '预设：',
      verifyLabel: '生成后自动校验',
      verifyHint: '校验图片是否正常（黑图/截断/尺寸过小自动换下一个供应商）。',
      verifyProvidersLabel: '校验视觉模型链',
      verifyProvidersHint: '用视觉模型检查生成结果；留空则复用生成链的供应商（同一 Key/端点走 /chat/completions）。',
      maxAttemptsLabel: '每轮最多尝试供应商数',
      advanced: '高级设置',
      invalidRows: '每行需填写 名称/接口地址/模型',
      invalidKeyEnv: 'Key 环境变量名不能包含空格',
    }
    const en = {
      nav: 'Image generation',
      desc: 'Multi-provider generation chain: one provider/model per row with its own API key; failures fall through the chain; generated images are auto-verified.',
      pending: 'Unsaved',
      readOnly: 'The active settings provider is read-only.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      chainLabel: 'Generation chain (fall back in order)',
      chainHint: 'First row is the primary provider; later rows are fallbacks. Each row has its own API key (env var name).',
      addFallback: '+ Add provider',
      remove: 'Remove',
      removeTitle: 'Remove this row',
      nameLabel: 'Name',
      baseUrlLabel: 'Base URL',
      modelLabel: 'Model',
      keyEnvLabel: 'Key env var',
      sizeLabel: 'Size',
      preset: 'Preset:',
      verifyLabel: 'Auto-verify after generation',
      verifyHint: 'Check the image is sane (blank/truncated/too small → next provider).',
      verifyProvidersLabel: 'Verify vision chain',
      verifyProvidersHint: 'Use a vision model to check results; leave empty to reuse the generation providers.',
      maxAttemptsLabel: 'Max providers per turn',
      advanced: 'Advanced settings',
      invalidRows: 'Each row needs name / base URL / model',
      invalidKeyEnv: 'Key env var name must not contain spaces',
    }

    // ── helpers ─────────────────────────────────────────────────────────────
    function providersToText(value) {
      if (!Array.isArray(value)) return ''
      return value
        .map((row) => row && row.name ? row.name + '/' + row.model + ' ' + row.baseURL + ' ' + (row.apiKeyEnv || '') + ' ' + (row.size || '1024x1024') : '')
        .join('\n')
    }
    function parseProviders(text) {
      const list = []
      for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim()
        if (line === '') continue
        const parts = line.split(/\s+/)
        const nameModel = parts[0] || ''
        const idx = nameModel.indexOf('/')
        if (idx <= 0 || idx === nameModel.length - 1) return undefined
        const name = nameModel.slice(0, idx).trim()
        const model = nameModel.slice(idx + 1).trim()
        const baseURL = parts[1] || ''
        const apiKeyEnv = parts[2] || ''
        const size = parts[3] || '1024x1024'
        if (name === '' || model === '' || baseURL === '') return undefined
        if (/\s/.test(apiKeyEnv)) return undefined
        list.push({ name, model, baseURL, apiKeyEnv, size })
      }
      return list
    }
    function verifyProvidersToText(value) {
      if (!Array.isArray(value)) return ''
      return value
        .map((row) => row && row.name ? row.name + '/' + row.model + ' ' + row.baseURL + ' ' + (row.apiKeyEnv || '') : '')
        .join('\n')
    }
    function parseVerifyProviders(text) {
      const list = []
      for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim()
        if (line === '') continue
        const parts = line.split(/\s+/)
        const nameModel = parts[0] || ''
        const idx = nameModel.indexOf('/')
        if (idx <= 0 || idx === nameModel.length - 1) return undefined
        const name = nameModel.slice(0, idx).trim()
        const model = nameModel.slice(idx + 1).trim()
        const baseURL = parts[1] || ''
        const apiKeyEnv = parts[2] || ''
        if (name === '' || model === '' || baseURL === '') return undefined
        if (/\s/.test(apiKeyEnv)) return undefined
        list.push({ name, model, baseURL, apiKeyEnv })
      }
      return list
    }
    function parseNumber(text, min) {
      const trimmed = String(text ?? '').trim()
      if (trimmed === '') return { clear: true }
      const parsed = Number(trimmed)
      return Number.isInteger(parsed) && parsed >= min ? { value: parsed } : undefined
    }
    function installStyles() {
      const id = 'dsh-image-gen-card-styles'
      if (document.getElementById(id)) return
      const style = document.createElement('style')
      style.id = id
      style.textContent = [
        '.dsh-image-gen-card { display: flex; flex-direction: column; gap: 10px; }',
        '.dsh-image-gen-card textarea { width: 100%; min-height: 90px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }',
        '.dsh-image-gen-row { display: flex; gap: 6px; align-items: center; }',
        '.dsh-image-gen-row input { flex: 1; min-width: 0; }',
        '.dsh-image-gen-hint { opacity: 0.65; font-size: 12px; line-height: 1.5; }',
        '.dsh-image-gen-actions { display: flex; gap: 8px; align-items: center; }',
      ].join('\n')
      document.head.appendChild(style)
    }

    // ── card component ──────────────────────────────────────────────────────
    function ImageGenCard(props) {
      const { scope, t } = props
      const [snapshot, setSnapshot] = useState(scope.get())
      const [draft, setDraft] = useState(null)
      useMemo(() => {
        const off = scope.watch(() => {
          setSnapshot(scope.get())
          setDraft(null)
        })
        return off
      }, [scope])

      const value = draft ?? snapshot
      const hasUser = !!value && typeof value === 'object' && Object.keys(value).length > 0
      const pending = draft !== null

      const format = (key) => {
        if (key === 'providers') return providersToText(value?.providers)
        if (key === 'verifyProviders') return verifyProvidersToText(value?.verifyProviders)
        if (key === 'maxAttempts') return String(value?.maxAttempts ?? 3)
        return ''
      }
      const setField = (key, raw) => {
        const next = { ...(value ?? {}) }
        if (key === 'providers') {
          const parsed = parseProviders(raw)
          if (!parsed) return
          next.providers = parsed
        } else if (key === 'verifyProviders') {
          const parsed = parseVerifyProviders(raw)
          if (!parsed) return
          next.verifyProviders = parsed
        } else if (key === 'maxAttempts') {
          const parsed = parseNumber(raw, 1)
          if (!parsed) return
          if (parsed.clear) delete next.maxAttempts
          else next.maxAttempts = parsed.value
        } else {
          next[key] = raw
        }
        setDraft(next)
      }
      const save = async () => {
        if (draft === null) return
        try {
          await scope.set(draft)
          setSnapshot(draft)
          setDraft(null)
        } catch (error) {
          alert('save failed: ' + (error?.message ?? error))
        }
      }
      const reset = () => {
        scope.reset()
        setDraft(null)
      }

      const field = (key, label, hint, textarea) => (
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          React.createElement('span', { style: { fontSize: 12, fontWeight: 600 } }, label),
          textarea
            ? React.createElement('textarea', { value: format(key) ?? '', onChange: (e) => setField(key, e.target.value), placeholder: hint })
            : React.createElement('input', { value: String(value?.[key] ?? ''), onChange: (e) => setField(key, e.target.value), placeholder: hint }),
          React.createElement('span', { className: 'dsh-image-gen-hint' }, hint),
        )
      )
      const rowsField = (key, label, hint, toText, parse, rowHint) => {
        const rows = toText(value?.[key] ?? [])
        const onChange = (raw) => {
          const parsed = parse(raw)
          if (!parsed) {
            const next = { ...(value ?? {}) }
            next[key] = Array.isArray(value?.[key]) ? value[key] : []
            setDraft(next)
            return
          }
          setField(key, raw)
        }
        return React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          React.createElement('span', { style: { fontSize: 12, fontWeight: 600 } }, label),
          React.createElement('textarea', {
            value: rows,
            onChange: (e) => onChange(e.target.value),
            placeholder: rowHint,
          }),
          React.createElement('span', { className: 'dsh-image-gen-hint' }, hint),
        )
      }

      const presetButtons = Object.keys({ siliconflow: 1, zhipu: 1, wanx: 1, openai: 1, openrouter: 1 }).map((name) =>
        React.createElement('button', {
          key: name,
          onClick: () => {
            const presets = {
              siliconflow: ['siliconflow/Kwai-Kolors/Kolors https://api.siliconflow.cn/v1 SILICONFLOW_API_KEY'],
              zhipu: ['zhipu/cogview-3-flash https://open.bigmodel.cn/api/paas/v4 ZHIPU_API_KEY'],
              wanx: ['wanx/wanx2.1-t2i-flash https://dashscope.aliyuncs.com/compatible-mode/v1 DASHSCOPE_API_KEY'],
              openai: ['openai/gpt-image-1 https://api.openai.com/v1 OPENAI_API_KEY'],
              openrouter: ['openrouter/stabilityai/stable-diffusion-xl https://openrouter.ai/api/v1 OPENROUTER_API_KEY'],
            }
            const next = { ...(value ?? {}) }
            next.providers = parseProviders(presets[name].join('\n'))
            setDraft(next)
          },
          style: { fontSize: 12, padding: '2px 8px' },
        }, name),
      )

      return React.createElement('div', { className: 'dsh-image-gen-card' },
        React.createElement('div', { className: 'dsh-image-gen-hint' }, t('desc')),
        React.createElement('div', { className: 'dsh-image-gen-actions' },
          React.createElement('span', { style: { fontSize: 12 } }, t('preset')),
          ...presetButtons,
          React.createElement('span', { style: { flex: 1 } }),
          pending ? React.createElement('span', { style: { fontSize: 12, color: 'var(--dsh-warn, #c98a00)' } }, t('pending')) : null,
          React.createElement('button', { onClick: save, disabled: !pending }, 'Save'),
          React.createElement('button', { onClick: reset }, t('reset')),
        ),
        rowsField('providers', t('chainLabel'), t('chainHint'), providersToText, parseProviders,
          'siliconflow/Kwai-Kolors/Kolors https://api.siliconflow.cn/v1 SILICONFLOW_API_KEY 1024x1024'),
        field('maxAttempts', t('maxAttemptsLabel'), '1-10', false),
        React.createElement('label', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: value?.verify !== false,
            onChange: (e) => setField('verify', e.target.checked),
          }),
          React.createElement('span', { style: { fontSize: 12 } }, t('verifyLabel')),
        ),
        React.createElement('div', { className: 'dsh-image-gen-hint' }, t('verifyHint')),
        rowsField('verifyProviders', t('verifyProvidersLabel'), t('verifyProvidersHint'), verifyProvidersToText, parseVerifyProviders,
          'zhipu/glm-4v-flash https://open.bigmodel.cn/api/paas/v4 ZHIPU_API_KEY'),
        React.createElement('div', { style: { fontSize: 12, opacity: 0.5, marginTop: 4 } }, 'v1 · keys read from env / credentials'),
      )
    }

    // ── apply: register the settings card ───────────────────────────────────
    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: 'image-gen' })
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'image-gen: card locale')
      const t = ctx.locale.bind(NS)
      ctx.effect(installStyles, 'image-gen: card styles')
      ctx.effect(
        () =>
          ctx.slots.inject('settings.plugin.item', function* () {
            yield ctx.slots.register(
              {
                name: 'settings.plugin.item',
                id: 'image-gen',
                order: 32,
                label: () => t('nav'),
                inject: () => ({ scope, t }),
              },
              ImageGenCard,
            )
          }),
        'image-gen: settings card',
      )
    }

    exports.apply = apply
    exports.inject = ['settingsScope', 'slots', 'locale']
    return module.exports
  },
})
