'use client'

import React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { SkeletonBox } from './SkeletonPrimitives'
import { useCopy } from '../../hooks/useCopy'

export default function CalendarSkeleton() {
  const { t } = useCopy()
  return (
    <div className="workspace-page animate-fade-in" aria-label={t('loadingPostingSchedule')}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-200/80 bg-primary-50 text-primary-500 shadow-2xs">
              <CalendarDays size={20} className="text-primary-400 opacity-80" />
            </div>
            <div className="space-y-1.5">
              <SkeletonBox className="h-6 w-48 rounded-md" />
              <SkeletonBox className="h-3.5 w-72 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-8 w-24 rounded-lg" />
          </div>
        </header>

        {/* 3 Stat Cards */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: t('allPosts'), width: 'w-16' },
            { label: t('calendarToReview'), width: 'w-18' },
            { label: t('status_approved'), width: 'w-16' },
          ].map((stat, i) => (
            <div key={i} className="stat-card p-4 rounded-2xl bg-white border border-ink-100 shadow-2xs">
              <SkeletonBox className={`h-3 ${stat.width} rounded`} />
              <SkeletonBox className="mt-2.5 h-6 w-10 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white shadow-2xs text-ink-300">
              <ChevronLeft size={16} />
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white shadow-2xs text-ink-300">
              <ChevronRight size={16} />
            </div>
            <div className="flex h-9 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 shadow-2xs">
              <SkeletonBox className="h-3.5 w-10 rounded" />
            </div>
            <SkeletonBox className="ms-2 h-5 w-32 rounded-md" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-ink-200 bg-white p-1 shadow-2xs">
              <div className="rounded-full bg-primary-500/90 px-3 py-1">
                <div className="h-3.5 w-12 rounded bg-white/40" />
              </div>
              <div className="px-3 py-1">
                <SkeletonBox className="h-3.5 w-10 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid + Day Plan Sidebar */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Calendar Grid */}
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xs">
            <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/70">
              {[t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')].map((day, index) => (
                <div key={index} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-ink-100">
              {Array.from({ length: 35 }, (_, index) => {
                const dayNum = index < 3 ? 29 + index : index < 34 ? index - 2 : 1
                const outside = index < 3 || index >= 34
                const isSelected = index === 9
                const hasPost = [4, 7, 9, 14, 18, 22].includes(index)

                return (
                  <div
                    key={index}
                    className={`min-h-[82px] sm:min-h-[92px] p-1.5 transition-colors ${
                      outside ? 'bg-ink-50/40' : isSelected ? 'bg-primary-50/50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isSelected
                            ? 'bg-primary-600 text-white shadow-2xs'
                            : outside
                            ? 'text-ink-300'
                            : 'text-ink-600'
                        }`}
                      >
                        {dayNum}
                      </span>
                    </div>

                    {hasPost && (
                      <div className="mt-1.5 space-y-1">
                        <div
                          className={`rounded-lg px-2 py-1 text-[11px] border shadow-2xs flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-primary-100/90 border-primary-200 text-primary-800'
                              : 'bg-white border-ink-200 text-ink-700'
                          }`}
                        >
                          <div
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isSelected ? 'bg-primary-600' : 'bg-primary-400'
                            }`}
                          />
                          <SkeletonBox className="h-2.5 w-full rounded" />
                        </div>
                        {index === 9 && (
                          <div className="rounded-lg bg-white border border-ink-200 px-2 py-1 text-[11px] shadow-2xs flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full shrink-0 bg-accent-400" />
                            <SkeletonBox className="h-2.5 w-3/4 rounded" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Day Plan Sidebar */}
          <aside className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-2 border-b border-ink-100 pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t('calendarDayPlan')}</p>
                <SkeletonBox className="mt-1 h-4 w-32 rounded" />
              </div>
              <span className="badge bg-ink-100 text-ink-600 font-semibold px-2 py-0.5 rounded-full text-xs">2</span>
            </div>

            <div className="space-y-3 pt-1">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-ink-100 bg-ink-50/30 p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-primary-400/70" />
                      <SkeletonBox className="h-3.5 w-20 rounded" />
                    </div>
                    <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{t('review')}</span>
                  </div>
                  <div className="space-y-1.5">
                    <SkeletonBox className="h-3 w-full rounded" />
                    <SkeletonBox className="h-3 w-4/5 rounded" />
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-ink-100/60">
                    <SkeletonBox className="h-7 w-16 rounded-lg bg-primary-600/20" />
                    <SkeletonBox className="h-7 w-14 rounded-lg bg-ink-200/50" />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}