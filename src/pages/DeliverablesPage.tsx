import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, X, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import type { Deliverable } from '../lib/types'
import MarkdownContent from '../components/chat/MarkdownContent'

export default function DeliverablesPage() {
  const { t } = useLang()
  const [items, setItems] = useState<Deliverable[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [viewing, setViewing] = useState<Deliverable | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false })
      setItems((data ?? []) as Deliverable[])
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.type === filter)),
    [items, filter]
  )

  const download = (item: Deliverable) => {
    const blob = new Blob([item.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.title.replace(/\s+/g, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const types = ['all', 'research_report', 'competitor_analysis', 'content_posts', 'content_calendar', 'performance_diagnosis', 'general']

  return (
    <div className="h-full overflow-y-auto p-3.5 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-3">
          <FolderOpen className="text-primary-700 shrink-0" size={24} />
          <h1 className="text-xl font-bold text-ink-900">{t('deliverablesTitle')}</h1>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar sm:flex-wrap">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium shrink-0 transition-colors ${
                filter === type
                  ? 'border-primary-600 bg-primary-50 text-primary-800'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {type === 'all' ? t('navDeliverables') : t(`type_${type}` as never)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-ink-400">{t('loading')}</p>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-500">{t('noDeliverables')}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((item) => (
              <div key={item.id} className="card animate-fade-up p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{item.title}</h3>
                  <span className="badge shrink-0 bg-primary-50 text-primary-700">{t(`type_${item.type}` as never)}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-ink-600">{item.content}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-ink-100/60">
                  <span className="text-xs text-ink-400">{new Date(item.created_at).toLocaleDateString()}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setViewing(item)} className="btn-secondary px-3 py-1.5 text-xs">
                      {t('viewDeliverable')}
                    </button>
                    <button onClick={() => download(item)} className="btn-secondary px-3 py-1.5 text-xs">
                      <Download size={13} /> {t('download')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setViewing(null)}>
          <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-base sm:text-lg">{viewing.title}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => download(viewing)} className="btn-secondary px-3 py-1.5 text-xs">
                  <Download size={13} />
                </button>
                <button onClick={() => setViewing(null)} className="text-ink-400 hover:text-ink-700 p-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[70vh] p-2">
              <MarkdownContent content={viewing.content} className="text-sm leading-relaxed text-ink-800" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
