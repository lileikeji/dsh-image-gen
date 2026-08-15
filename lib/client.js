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
      keyEnvHint: '填环境变量名（如 SILICONFLOW_API_KEY），密钥从 ~/.dsh/.env 读取；也可以直接在上面填密钥，两者任一即可。',
      apiKeyLabel: 'API Key（可选）',
      fetchModels: '获取模型',
      needBaseUrl: '请先填接口地址再获取模型',
      addProvider: '添加供应商',
      provider: '供应商',
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
      keyEnvHint: 'Env var name (e.g. SILICONFLOW_API_KEY) read from ~/.dsh/.env; or paste the key above directly — either works.',
      apiKeyLabel: 'API Key (optional)',
      fetchModels: 'Fetch models',
      needBaseUrl: 'Enter the base URL first',
      addProvider: 'Add provider',
      provider: 'Provider',
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
        '.dsh-image-gen-card { border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35)); background: var(--dsw-alias-bg-layer-3, transparent); border-radius: 12px; list-style: none; transition: border-color .16s, background .16s; }',
        '.dsh-image-gen-card:hover { border-color: var(--dsw-alias-label-dimmed, rgba(128,128,128,0.55)); }',
        '.dsh-image-gen-card-open { background: var(--dsw-alias-bg-layer-2, transparent); border-color: var(--dsw-alias-label-dimmed, rgba(128,128,128,0.55)); }',
        '.dsh-image-gen-header { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: 0 0; border: 0; border-radius: 12px; align-items: center; gap: 12px; padding: 14px 16px; display: flex; }',
        '.dsh-image-gen-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff); outline-offset: -2px; }',
        '.dsh-image-gen-headText { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }',
        '.dsh-image-gen-name { color: var(--dsw-alias-label-primary, inherit); font-size: 15px; font-weight: 600; line-height: 1.4; }',
        '.dsh-image-gen-desc { color: var(--dsw-alias-label-tertiary, inherit); font-size: 13px; line-height: 1.5; }',
        '.dsh-image-gen-pending { white-space: nowrap; background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,0.12)); color: var(--dsw-alias-label-secondary, inherit); border-radius: 999px; flex: none; padding: 1px 8px; font-size: 11px; font-weight: 500; line-height: 17px; }',
        '.dsh-image-gen-chevron { color: var(--dsw-alias-label-tertiary, inherit); flex: none; transition: transform .16s; font-size: 12px; line-height: 1; }',
        '.dsh-image-gen-chevronOpen { transform: rotate(180deg); }',
        '.dsh-image-gen-body { border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35)); margin: 0 16px; padding: 14px 0 8px; display: flex; flex-direction: column; gap: 12px; }',
        '.dsh-image-gen-card textarea { width: 100%; min-height: 90px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; box-sizing: border-box; }',
        '.dsh-image-gen-row { display: flex; gap: 6px; align-items: center; }',
        '.dsh-image-gen-row input { flex: 1; min-width: 0; }',
        '.dsh-image-gen-hint { opacity: 0.65; font-size: 12px; line-height: 1.5; }',
        '.dsh-image-gen-actions { display: flex; gap: 8px; align-items: center; }',
        '.dsh-image-gen-presets { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }',
      ].join('\n')
      document.head.appendChild(style)
    }



    // ── card component ─────────────────────────────────────────────────────
    // 结构化供应商表单：像模型配置一样，每个供应商一行：名称 / 接口地址 /
    // API Key（可直接填明文，或填环境变量名）/ 模型（可下拉自动获取）/ 尺寸。
    function ProviderForm({ row, index, onChange, onRemove, t }) {
      const [models, setModels] = React.useState(null)
      const [fetching, setFetching] = React.useState(false)
      const [fetchErr, setFetchErr] = React.useState('')
      const set = (key, v) => onChange(index, { ...row, [key]: v })
      const fetchModels = async () => {
        if (!row.baseURL) { setFetchErr(t('needBaseUrl')); return }
        setFetching(true)
        setFetchErr('')
        try {
          const resp = await fetch('/dsh-image-gen/models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: row.name, baseURL: row.baseURL, apiKey: row.apiKey || '', apiKeyEnv: row.apiKeyEnv || '' }),
          })
          const data = await resp.json().catch(() => ({}))
          if (!resp.ok || !data.ok) { setFetchErr(data.error || 'HTTP ' + resp.status); return }
          setModels(data.models || [])
          if (data.models && data.models.length > 0 && !row.model) set('model', data.models[0])
        } catch (e) { setFetchErr(String(e && e.message || e)) }
        finally { setFetching(false) }
      }
      const label = (text) => React.createElement('span', { style: { fontSize: 12, fontWeight: 600 } }, text)
      const input = (key, ph, type) => React.createElement('input', {
        type: type || 'text',
        value: row[key] || '',
        placeholder: ph,
        onChange: (e) => set(key, e.target.value),
        style: { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '4px 8px' },
      })
      return React.createElement('div', { style: { border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('span', { style: { fontWeight: 600, fontSize: 13 } }, row.name || (index + 1) + '. ' + t('provider')),
          React.createElement('button', { type: 'button', onClick: () => onRemove(index), style: { marginLeft: 'auto', fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer' } }, t('remove')),
        ),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, label(t('nameLabel')), input('name', 'siliconflow')),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, label(t('baseUrlLabel')), input('baseURL', 'https://api.siliconflow.cn/v1')),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          label(t('apiKeyLabel')),
          input('apiKey', 'sk-...（直接填密钥，或留空用下面环境变量）', 'password'),
        ),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          label(t('keyEnvLabel')),
          input('apiKeyEnv', 'SILICONFLOW_API_KEY'),
          React.createElement('span', { className: 'dsh-image-gen-hint' }, t('keyEnvHint')),
        ),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          label(t('modelLabel')),
          React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            React.createElement('input', {
              list: 'dsh-image-gen-model-list-' + index,
              value: row.model || '',
              placeholder: 'Kwai-Kolors/Kolors',
              onChange: (e) => set('model', e.target.value),
              style: { flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' },
            }),
            React.createElement('button', { type: 'button', onClick: fetchModels, disabled: fetching, style: { fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' } },
              fetching ? '...' : t('fetchModels')),
          ),
          models && models.length > 0
            ? React.createElement('datalist', { id: 'dsh-image-gen-model-list-' + index },
                models.map((m) => React.createElement('option', { key: m, value: m })))
            : null,
          fetchErr ? React.createElement('span', { style: { fontSize: 12, color: '#c0392b' } }, fetchErr) : null,
        ),
        React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, label(t('sizeLabel')), input('size', '1024x1024')),
      )
    }

    function ImageGenCard(props) {
      const { scope, t } = props
      const [open, setOpen] = React.useState(false)
      const [drafts, setDrafts] = React.useState({})
      const [saving, setSaving] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const subscribe = React.useMemo(() => scope.subscribe.bind(scope), [scope])
      const getSnapshot = React.useMemo(() => scope.getSnapshot.bind(scope), [scope])
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot)
      const value = snapshot && snapshot.value
      const pending = Object.keys(drafts).length > 0

      const providers = () => (drafts.providers !== undefined ? drafts.providers : (Array.isArray(value?.providers) ? value.providers : []))
      const maxAttemptsVal = () => String(drafts.maxAttempts !== undefined ? drafts.maxAttempts : (value?.maxAttempts ?? 3))

      const setField = (key, val) => { setFailed(false); setDrafts((prev) => ({ ...prev, [key]: val })) }
      const setProvider = (index, row) => {
        const list = providers().slice()
        list[index] = row
        setField('providers', list)
      }
      const addProvider = () => setField('providers', [...providers(), { name: '', baseURL: '', model: '', apiKey: '', apiKeyEnv: '', size: '1024x1024' }])
      const removeProvider = (index) => {
        const list = providers().slice()
        list.splice(index, 1)
        setField('providers', list)
      }
      const save = async () => {
        if (pending || saving) return
        setSaving(true); setFailed(false)
        let landed = true
        for (const key of Object.keys(drafts)) {
          const val = drafts[key]
          if (val === undefined || val === null || val === '') { const ok = await scope.unset(key).then(() => true, () => false); landed = ok && landed }
          else { const ok = await scope.set(key, val).then(() => true, () => false); landed = ok && landed }
        }
        if (landed) setDrafts({})
        setSaving(false); setFailed(!landed)
      }
      const reset = () => { setFailed(false); for (const key of Object.keys(value ?? {})) scope.unset(key); setDrafts({}) }
      const applyPreset = (name) => {
        const presets = {
          siliconflow: { name: 'siliconflow', baseURL: 'https://api.siliconflow.cn/v1', model: 'Kwai-Kolors/Kolors', apiKey: '', apiKeyEnv: 'SILICONFLOW_API_KEY', size: '1024x1024' },
          zhipu: { name: 'zhipu', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-3-flash', apiKey: '', apiKeyEnv: 'ZHIPU_API_KEY', size: '1024x1024' },
          wanx: { name: 'wanx', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'wanx2.1-t2i-flash', apiKey: '', apiKeyEnv: 'DASHSCOPE_API_KEY', size: '1024x1024' },
          openai: { name: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-image-1', apiKey: '', apiKeyEnv: 'OPENAI_API_KEY', size: '1024x1024' },
          openrouter: { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1', model: 'stabilityai/stable-diffusion-xl', apiKey: '', apiKeyEnv: 'OPENROUTER_API_KEY', size: '1024x1024' },
        }
        const p = presets[name]
        const list = providers().slice()
        const existing = list.findIndex((r) => r.name === name)
        if (existing >= 0) list[existing] = p; else list.push(p)
        setField('providers', list)
      }

      return React.createElement('li', { className: 'dsh-image-gen-card' + (open ? ' dsh-image-gen-card-open' : '') },
        React.createElement('button', { type: 'button', className: 'dsh-image-gen-header', 'aria-expanded': open, onClick: () => setOpen(!open) },
          React.createElement('span', { className: 'dsh-image-gen-headText' },
            React.createElement('span', { className: 'dsh-image-gen-name' }, t('nav')),
            React.createElement('span', { className: 'dsh-image-gen-desc' }, t('desc')),
          ),
          pending ? React.createElement('span', { className: 'dsh-image-gen-pending' }, t('pending')) : null,
          React.createElement('span', { className: 'dsh-image-gen-chevron' + (open ? ' dsh-image-gen-chevronOpen' : '') }, '▾'),
        ),
        open ? React.createElement('div', { className: 'dsh-image-gen-body' },
          React.createElement('div', { className: 'dsh-image-gen-presets' },
            React.createElement('span', { style: { fontSize: 12 } }, t('preset')),
            Object.keys({ siliconflow: 1, zhipu: 1, wanx: 1, openai: 1, openrouter: 1 }).map((name) =>
              React.createElement('button', { key: name, onClick: () => applyPreset(name), style: { fontSize: 12, padding: '2px 8px' } }, name)),
          ),
          (providers().length === 0
            ? React.createElement('div', { className: 'dsh-image-gen-hint' }, t('chainHint'))
            : providers().map((row, index) => React.createElement(ProviderForm, { key: index, row: row || {}, index, onChange: setProvider, onRemove: removeProvider, t }))),
          React.createElement('button', { type: 'button', onClick: addProvider, style: { alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' } }, '+ ' + t('addProvider')),
          React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            React.createElement('span', { style: { fontSize: 12, fontWeight: 600 } }, t('maxAttemptsLabel')),
            React.createElement('input', { value: maxAttemptsVal(), onChange: (e) => setField('maxAttempts', Number(e.target.value) || 3), type: 'number', min: 1, max: 10, style: { width: 80, fontSize: 13, padding: '4px 8px' } }),
          ),
          React.createElement('label', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            React.createElement('input', { type: 'checkbox', checked: drafts.verify !== undefined ? drafts.verify : value?.verify !== false, onChange: (e) => setField('verify', e.target.checked) }),
            React.createElement('span', { style: { fontSize: 12 } }, t('verifyLabel')),
          ),
          React.createElement('div', { className: 'dsh-image-gen-hint' }, t('verifyHint')),
          React.createElement('div', { className: 'dsh-image-gen-actions' },
            pending ? React.createElement('span', { style: { fontSize: 12, color: 'var(--dsh-warn, #c98a00)' } }, t('pending')) : null,
            failed ? React.createElement('span', { style: { fontSize: 12, color: '#c0392b' } }, 'save failed') : null,
            React.createElement('button', { onClick: save, disabled: !pending || saving }, saving ? '...' : 'Save'),
            React.createElement('button', { onClick: reset }, t('reset')),
          ),
          React.createElement('div', { style: { fontSize: 12, opacity: 0.5 } }, 'v3 · 可填密钥或环境变量，模型可自动获取'),
        ) : null,
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
