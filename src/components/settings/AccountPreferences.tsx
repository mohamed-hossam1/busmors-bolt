'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe2, UserRound } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import { useCopy } from '../../hooks/useCopy'
import { supabase } from '../../lib/supabase'
import { formatWorkspaceTime, supportedTimezones } from '../../lib/region'

const timezones = supportedTimezones()

export default function AccountPreferences() {
  const { t } = useCopy()
  const { session, settings, refreshSettings } = useAuth()
  const [country, setCountry] = useState(settings?.country ?? '')
  const [currency, setCurrency] = useState(settings?.currency ?? '')
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'UTC')
  const [market, setMarket] = useState(settings?.target_market ?? '')
  const [version, setVersion] = useState(settings?.updated_at ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [previewTime] = useState(()=>new Date())
  const dirty = useRef(false)
  useEffect(() => {
    if (!settings) return
    if (!dirty.current) {
      setCountry(settings.country ?? ''); setCurrency(settings.currency ?? '')
      setTimezone(settings.timezone ?? 'UTC'); setMarket(settings.target_market ?? '')
    }
    setVersion(settings.updated_at)
  }, [settings])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      const { data, error } = await supabase.rpc('save_workspace_preferences', {
        p_country: country, p_currency: currency, p_timezone: timezone,
        p_target_market: market, p_expected_updated_at: version,
      })
      if (error) throw error
      dirty.current = false
      setVersion(data.updated_at); setSaved(true); await refreshSettings()
    } catch (cause) {
      const message = (cause as { message?: string }).message ?? ''
      setError(message.includes('STALE_VERSION') ? t('settingsStaleVersion') : t('settingsSaveError'))
    } finally { setBusy(false) }
  }
  const providers = [...new Set(session?.user.identities?.map(identity => identity.provider) ?? [])]
  return <>
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound size={20} className="text-primary-600"/>{t('yourAccount')}</h2>
      <p className="mt-4 break-all text-sm font-medium">{session?.user.email ?? t('noEmailAvailable')}</p>
      <div className="mt-3 flex flex-wrap gap-2">{providers.map(provider => <span key={provider} className="badge capitalize">{provider === 'email' ? t('emailAndPassword') : provider}</span>)}</div>
      <p className="mt-3 text-xs text-ink-500">{t('providerDetailsHelp')}</p>
    </section>
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Globe2 size={20} className="text-primary-600"/>{t('regionAndMarket')}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">{t('regionAndMarketHelp')}</p>
      <form noValidate onSubmit={save} onChange={()=>{ dirty.current=true; setSaved(false) }} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t('businessCountry')}<input className="input-field mt-2" maxLength={100} value={country} onChange={e=>{ dirty.current=true; setCountry(e.target.value) }}/></label>
          <label className="block text-sm font-medium">{t('currencyCode')}<input className="input-field mt-2" placeholder="EGP" pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e=>{ dirty.current=true; setCurrency(e.target.value.toUpperCase()) }}/></label>
        </div>
        <label className="block text-sm font-medium">{t('targetMarket')}<input className="input-field mt-2" maxLength={300} placeholder={t('targetMarketPlaceholder')} value={market} onChange={e=>{ dirty.current=true; setMarket(e.target.value) }}/></label>
        <label className="block text-sm font-medium">{t('timezoneLabel')}<select className="input-field mt-2" value={timezone} onChange={e=>{ dirty.current=true; setTimezone(e.target.value) }}>{[...new Set([timezone,...timezones])].map(zone=><option key={zone} value={zone}>{zone}</option>)}</select></label>
        <p className="text-xs text-ink-500">{t('timezonePreview')}<span suppressHydrationWarning>{formatWorkspaceTime(previewTime,timezone)}</span></p>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{error}</p><button type="button" className="mt-2 underline" onClick={()=>void refreshSettings()}>{t('reloadSavedSettings')}</button></div>}
        {saved && <p role="status" className="text-sm text-emerald-700">{t('regionPreferencesSaved')}</p>}
        <button type="submit" onClick={save} className="btn-primary" disabled={busy || !version}>{busy && <Spinner size={16} />}{t('savePreferences')}</button>
      </form>
    </section>
  </>
}
