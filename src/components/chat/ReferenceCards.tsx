'use client'

import { FileText, ExternalLink } from 'lucide-react'
import { Link } from '@/shared/i18n'
import { useCopy } from '../../hooks/useCopy'
import type { DeliverableRefData, DraftRefData } from './employeeCards'
import PostDraftApprovalCard from './PostDraftApprovalCard'

function DeliverableCard({ item }: { item: DeliverableRefData }) {
  const { t } = useCopy()
  return (
    <Link
      href="/deliverables"
      className="mt-2 flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-900">{item.title || t('deliverableFallbackTitle')}</span>
        <span className="block text-[11px] text-ink-500">{t('versionLabel', { version: item.version })}</span>
      </span>
      <ExternalLink size={14} className="shrink-0 text-ink-400" />
    </Link>
  )
}

export default function ReferenceCards({
  deliverables,
  drafts,
}: {
  deliverables?: DeliverableRefData[]
  drafts?: DraftRefData[]
}) {
  if ((!deliverables || deliverables.length === 0) && (!drafts || drafts.length === 0)) return null
  return (
    <>
      {deliverables?.map((item) => <DeliverableCard key={item.deliverableId} item={item} />)}
      {drafts?.map((item) => <PostDraftApprovalCard key={item.postId} item={item} />)}
    </>
  )
}