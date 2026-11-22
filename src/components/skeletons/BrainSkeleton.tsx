'use client'

import React from 'react'
import { Network, Scan, RotateCcw, GitBranch, Search } from 'lucide-react'
import { SkeletonBox } from './SkeletonPrimitives'
import { useCopy } from '../../hooks/useCopy'

export default function BrainSkeleton() {
  const { t } = useCopy()
  return (
    <div className="workspace-page animate-fade-in" aria-label={t('loadingKnowledgeBrain')}>
      <div className="mx-auto max-w-none">
        {/* Header with Buttons */}
        <header className="brain-page-header">
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-11 w-11 rounded-2xl" />
            <div className="space-y-2">
              <SkeletonBox className="h-6 w-40 rounded-md" />
              <SkeletonBox className="h-4 w-64 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <SkeletonBox className="h-9 w-28 rounded-lg" />
            <SkeletonBox className="h-9 w-28 rounded-lg" />
            <SkeletonBox className="h-9 w-32 rounded-lg" />
            <SkeletonBox className="h-9 w-32 rounded-lg" />
          </div>
        </header>

        {/* Filter and Search Bar (list view controls) */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-ink-200/80 shadow-2xs">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-8 w-20 rounded-lg" />
            <SkeletonBox className="h-8 w-24 rounded-lg" />
            <SkeletonBox className="h-8 w-24 rounded-lg" />
          </div>
          <SkeletonBox className="h-8 w-full md:w-56 rounded-lg" />
        </div>

        {/* Knowledge Map */}
        <div className="brain-map">
          {/* Toolbar */}
          <div className="brain-map-toolbar">
            <div className="flex shrink-0 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Network size={18} /></span>
              <div className="space-y-1.5">
                <SkeletonBox className="h-3.5 w-32 rounded-md" />
                <SkeletonBox className="h-3 w-40 rounded-md" />
              </div>
            </div>

            <div className="flex items-center rounded-lg border border-ink-200 bg-ink-50/70 p-0.5">
              <SkeletonBox className="h-7 w-20 rounded-md" />
              <SkeletonBox className="h-7 w-20 rounded-md" />
              <SkeletonBox className="h-7 w-12 rounded-md" />
            </div>

            <div className="brain-map-tools">
              <div className="brain-map-search">
                <Search size={15} className="shrink-0 text-ink-400" />
                <SkeletonBox className="h-3.5 w-28 rounded-md" />
              </div>
              <div className="brain-map-tool"><GitBranch size={15} className="text-ink-400" /></div>
              <div className="brain-map-tool"><Scan size={16} className="text-ink-400" /></div>
              <div className="brain-map-tool"><RotateCcw size={15} className="text-ink-400" /></div>
            </div>
          </div>

          {/* Category pills */}
          <div className="brain-map-categories">
            {[64, 88, 72, 96, 80, 72, 88, 68].map((w, i) => (
              <SkeletonBox key={i} className="h-7 rounded-full shrink-0" style={{ width: w }} />
            ))}
          </div>

          {/* Canvas */}
          <div className="brain-map-body">
            <div className="brain-map-canvas relative overflow-hidden">
              {/* Central hub */}
              <div className="absolute left-1/2 top-1/2 z-10 w-44 -translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-hub">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20"><SkeletonBox className="h-4 w-4 rounded-md bg-white/40" /></span>
                  <div className="min-w-0 flex-1 space-y-1.5 ps-2.5">
                    <SkeletonBox className="h-3 w-full rounded-md bg-white/40" />
                    <SkeletonBox className="h-2.5 w-2/3 rounded-md bg-white/30" />
                  </div>
                </div>
              </div>

              {/* Category nodes around hub */}
              <div className="absolute left-[16%] top-[26%] w-28 -translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-category-node"><SkeletonBox className="h-3 w-20 rounded-full" /></div>
              </div>
              <div className="absolute right-[16%] top-[24%] w-28 translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-category-node"><SkeletonBox className="h-3 w-20 rounded-full" /></div>
              </div>
              <div className="absolute left-[13%] bottom-[24%] w-28 -translate-x-1/2 translate-y-1/2">
                <div className="brain-map-category-node"><SkeletonBox className="h-3 w-20 rounded-full" /></div>
              </div>
              <div className="absolute right-[13%] bottom-[26%] w-28 translate-x-1/2 translate-y-1/2">
                <div className="brain-map-category-node"><SkeletonBox className="h-3 w-20 rounded-full" /></div>
              </div>

              {/* Knowledge cards scattered */}
              <div className="absolute left-[20%] top-[52%] h-[68px] w-[150px] -translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-node flex-col items-stretch justify-center gap-2">
                  <SkeletonBox className="h-3 w-full rounded-md" />
                  <SkeletonBox className="h-2.5 w-2/3 rounded-md" />
                </div>
              </div>
              <div className="absolute left-[30%] top-[74%] h-[68px] w-[150px] -translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-node flex-col items-stretch justify-center gap-2">
                  <SkeletonBox className="h-3 w-full rounded-md" />
                  <SkeletonBox className="h-2.5 w-3/4 rounded-md" />
                </div>
              </div>
              <div className="absolute right-[22%] top-[54%] h-[68px] w-[150px] translate-x-1/2 -translate-y-1/2">
                <div className="brain-map-node flex-col items-stretch justify-center gap-2">
                  <SkeletonBox className="h-3 w-full rounded-md" />
                  <SkeletonBox className="h-2.5 w-1/2 rounded-md" />
                </div>
              </div>
              <div className="absolute right-[30%] bottom-[20%] h-[68px] w-[150px] translate-x-1/2 translate-y-1/2">
                <div className="brain-map-node flex-col items-stretch justify-center gap-2">
                  <SkeletonBox className="h-3 w-full rounded-md" />
                  <SkeletonBox className="h-2.5 w-2/3 rounded-md" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="brain-map-footer">
            <SkeletonBox className="h-3 w-48 rounded-md" />
            <SkeletonBox className="hidden sm:block h-3 w-40 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}