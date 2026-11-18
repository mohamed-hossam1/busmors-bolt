import { useEffect, useState } from 'react'
import { KeyRound, Trash2, Check, Loader2, Sparkles, ShieldCheck, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ErrorBoundary from '../components/ErrorBoundary'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], needsBaseUrl: false },
  { id: 'groq', label: 'Groq', models: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'], needsBaseUrl: false },
  { id: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'], needsBaseUrl: false },
  { id: 'google', label: 'Google Gemini', models: ['gemini-1.5-flash', 'gemini-2.0-flash'], needsBaseUrl: false },
  { id: 'openrouter', label: 'OpenRouter', models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'], needsBaseUrl: false },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', models: [], needsBaseUrl: true },
] as const

interface AiKeyInfo {
  provider: string
  model: string
  key_hint: string
  status: string
  custom_base_url: string | null
}

function SettingsContent() {
  const [aiKey, setAiKey] = useState<AiKeyInfo | null>(null)
  const [provider, setProvider] = useState<string>('groq')
  const [model, setModel] = useState<string>('openai/gpt-oss-120b')
  const [baseUrl, setBaseUrl] = useState('')
  const [rawKey, setRawKey] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keySaved, setKeySaved] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)

  const load = async () => {
    try {
      setLoadingInitial(true)
      const { data: key, error } = await supabase
        .from('ai_keys')
        .select('provider, model, key_hint, status, custom_base_url')
        .maybeSingle()

      if (error) {
        console.warn('ai_keys fetch notice:', error)
      }

      if (key) {
        setAiKey(key)
        if (key.provider) {
          setProvider(key.provider)
        }
        if (key.model) {
          setModel(key.model)
        }
        if (key.custom_base_url) {
          setBaseUrl(key.custom_base_url)
        }
      }
    } catch (err) {
      console.error('Failed to load AI key settings:', err)
    } finally {
      setLoadingInitial(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const removeAiKey = async () => {
    try {
      setKeyBusy(true)
      setKeyError(null)
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (userId) {
        await supabase.from('ai_keys').delete().eq('workspace_id', userId)
      } else {
        await supabase.from('ai_keys').delete().not('id', 'is', null)
      }
      setAiKey(null)
      setKeySaved(false)
      setRawKey('')
    } catch (err) {
      console.error('Error removing AI key:', err)
      setKeyError('An error occurred while removing the key.')
    } finally {
      setKeyBusy(false)
    }
  }

  const saveAiKey = async () => {
    setKeyBusy(true)
    setKeyError(null)
    setKeySaved(false)
    try {
      const { error } = await supabase.rpc('save_ai_key', {
        p_provider: provider,
        p_model: model.trim(),
        p_key: rawKey.trim(),
        p_base_url: provider === 'custom' ? baseUrl.trim() || null : null,
      })
      if (error) {
        setKeyError(
          error.message.includes('Invalid key')
            ? 'API key looks too short. Please verify your key.'
            : `Could not save key: ${error.message || 'Check your inputs'}`
        )
        return
      }
      setRawKey('')
      setKeySaved(true)
      await load()
    } catch (err: unknown) {
      setKeyError(err instanceof Error ? err.message : 'An error occurred while saving the key.')
    } finally {
      setKeyBusy(false)
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0]

  return (
    <div className="workspace-page">
      <div className="mx-auto max-w-3xl space-y-6">
        <header><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-primary-600">Your workspace</p><h1 className="workspace-heading">Settings</h1><p className="workspace-description">Connect the intelligence behind your Marketing Director.</p></header>
        <section className="card p-4 sm:p-6 border border-ink-200/80 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h2 className="flex items-center gap-2 font-bold text-lg text-ink-900">
              <KeyRound size={20} className="text-primary-600 shrink-0" />
              AI Key
            </h2>
            <span className="badge bg-primary-50 text-primary-700 text-xs self-start sm:self-auto">
              <ShieldCheck size={13} className="me-1 inline" />
              Server-side Encrypted
            </span>
          </div>

          <p className="mb-5 text-sm text-ink-600 leading-relaxed">
            Paste your own API key (Groq, OpenAI, Anthropic, Gemini, etc.). It is encrypted server-side and never leaves the backend — the browser never sees it again.
          </p>

          {loadingInitial ? (
            <div className="flex items-center justify-center p-6 text-ink-400 text-sm gap-2">
              <Loader2 size={16} className="animate-spin" />
              Loading settings...
            </div>
          ) : (
            <>
              {aiKey && (
                <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/70 p-3.5 sm:px-4 sm:py-3.5 shadow-sm">
                  <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Sparkles size={16} className="text-primary-600 shrink-0" />
                      <span className="font-bold text-primary-900" dir="ltr">
                        {(aiKey.provider || '').toUpperCase()} · {aiKey.model || ''}
                      </span>
                      {aiKey.status === 'invalid' ? (
                        <span className="badge bg-red-100 text-red-700">Invalid</span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-800">Active</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 mt-1" dir="ltr">
                      ••••••••{aiKey.key_hint || ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={removeAiKey}
                    disabled={keyBusy}
                    title="Remove current key"
                    className="btn-danger px-3 py-2 text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-red-50 self-start sm:self-auto"
                  >
                    {keyBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>Remove key</span>
                  </button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">
                    Provider
                  </span>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const newP = e.target.value
                      setProvider(newP)
                      const found = PROVIDERS.find((x) => x.id === newP)
                      if (found && found.models.length > 0) {
                        setModel(found.models[0] || '')
                      } else {
                        setModel('')
                      }
                    }}
                    className="input-field"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">
                    Model
                  </span>
                  {selectedProvider.models.length > 0 ? (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="input-field"
                    >
                      {selectedProvider.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. your-model-name"
                      className="input-field"
                      dir="ltr"
                    />
                  )}
                </label>

                {selectedProvider.needsBaseUrl && (
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-ink-700">Base URL</span>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://your-endpoint.com/v1"
                      className="input-field"
                      dir="ltr"
                    />
                  </label>
                )}

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">
                    API Key {provider === 'groq' ? '(Groq API Key)' : ''}
                  </span>
                  <input
                    type="password"
                    value={rawKey}
                    onChange={(e) => setRawKey(e.target.value)}
                    placeholder={provider === 'groq' ? 'gsk_...' : 'sk-...'}
                    className="input-field"
                    dir="ltr"
                    autoComplete="off"
                  />
                  {provider === 'groq' && (
                    <span className="text-[11px] text-ink-400 mt-1 block">
                      Groq keys start with <code className="bg-ink-100 px-1 rounded">gsk_...</code>
                    </span>
                  )}
                </label>
              </div>

              {keyError && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{keyError}</span>
                </div>
              )}

              {keySaved && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200">
                  <Check size={16} className="shrink-0 text-emerald-600" />
                  <span>Key saved & encrypted successfully! Ready for use.</span>
                </div>
              )}

              <button
                type="button"
                onClick={saveAiKey}
                disabled={
                  keyBusy ||
                  !rawKey.trim() ||
                  (provider === 'custom' && !baseUrl.trim()) ||
                  !model.trim()
                }
                className="btn-primary mt-5 flex items-center justify-center gap-2 shadow-lift w-full sm:w-auto"
              >
                {keyBusy && <Loader2 size={16} className="animate-spin" />}
                <span>{aiKey ? 'Update key' : 'Save key'}</span>
                {keySaved && <Check size={16} />}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ErrorBoundary fallbackTitle="Could not load settings">
      <SettingsContent />
    </ErrorBoundary>
  )
}
