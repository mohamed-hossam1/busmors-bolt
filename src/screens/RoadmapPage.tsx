'use client'

import { useCallback, useEffect, useState } from 'react'
import DiscoveryWizard from '../features/roadmap/DiscoveryWizard'
import RoadmapPlan from '../features/roadmap/RoadmapPlan'
import { loadActiveRoadmap } from '../features/roadmap/api'
import { useCopy } from '../hooks/useCopy'
import { Loader2 } from 'lucide-react'

type View = 'loading' | 'roadmap' | 'discovery'

export default function RoadmapPage() {
  const { t } = useCopy()
  const [view, setView] = useState<View>('loading')

  const resolve = useCallback(async () => {
    try {
      const loaded = await loadActiveRoadmap()
      setView(loaded.roadmap ? 'roadmap' : 'discovery')
    } catch {
      // If the roadmap cannot be read, fall back to Discovery rather than a dead end.
      setView('discovery')
    }
  }, [])

  useEffect(() => {
    void resolve()
  }, [resolve])

  if (view === 'loading') {
    return (
      <div className="workspace-page flex items-center gap-2 text-sm text-ink-600">
        <Loader2 size={16} className="animate-spin" /> {t('loadingRoadmap')}
      </div>
    )
  }

  if (view === 'roadmap') {
    return (
      <div className="workspace-page">
        <RoadmapPlan onEditDiscovery={() => setView('discovery')} />
      </div>
    )
  }

  return (
    <div className="workspace-page">
      <DiscoveryWizard onGenerated={() => setView('roadmap')} />
    </div>
  )
}