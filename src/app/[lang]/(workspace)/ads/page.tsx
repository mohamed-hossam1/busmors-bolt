import { notFound } from 'next/navigation'
import AdsReportPage from '@/screens/AdsReportPage'
import { loadAdsReportView } from '@/server/meta-ads/view'
import { rangeFromParam } from '@/features/meta-ads/view-model'

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const { range } = await searchParams
  const preset = rangeFromParam(range)
  const view = await loadAdsReportView(preset)
  if (view.state === 'disabled') notFound()
  return <AdsReportPage key={preset} view={view} />
}