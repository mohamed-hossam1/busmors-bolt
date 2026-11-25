'use client'

import { BarChart3 } from 'lucide-react'
import { SkeletonBox } from './SkeletonPrimitives'
import { useCopy } from '../../hooks/useCopy'

function AdCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <SkeletonBox className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonBox className="h-4 w-2/3 rounded" />
          <SkeletonBox className="h-3 w-1/2 rounded" />
        </div>
        <SkeletonBox className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-ink-50 p-3">
            <SkeletonBox className="h-3 w-16 rounded" />
            <SkeletonBox className="mt-1.5 h-5 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdsSkeleton() {
  const { t } = useCopy()
  return (
    <div className="workspace-page animate-fade-in" aria-label={t('adsTitle')}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-ink-200 bg-white text-primary-400 shadow-2xs">
            <BarChart3 size={20} className="opacity-70" />
          </span>
          <div className="space-y-1.5">
            <SkeletonBox className="h-6 w-48 rounded-md" />
            <SkeletonBox className="h-3.5 w-72 rounded-md" />
          </div>
        </header>

        <div className="space-y-5">
          <SkeletonBox className="h-4 w-full max-w-xl rounded" />

          <section className="space-y-3">
            <SkeletonBox className="h-3 w-24 rounded" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`card p-4 ${i === 0 ? 'col-span-2 md:col-span-1' : ''}`}>
                  <SkeletonBox className="h-3 w-16 rounded" />
                  <SkeletonBox className="mt-2.5 h-7 w-28 rounded-lg" />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SkeletonBox className="h-3 w-24 rounded" />
            <div className="card p-4">
              <SkeletonBox className="h-[248px] w-full rounded-xl" />
            </div>
          </section>

          <section className="space-y-3">
            <SkeletonBox className="h-3 w-28 rounded" />
            <div className="card space-y-3 p-3">
              <SkeletonBox className="h-9 w-full rounded-xl" />
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonBox key={i} className="h-7 w-16 rounded-full" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <AdCardSkeleton key={i} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}