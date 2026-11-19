'use client'

import React from 'react'
import { SkeletonBox, SkeletonCircle } from './SkeletonPrimitives'

export default function EmployeeSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-ink-50/50 animate-fade-in" aria-label="Loading chat and canvas…">
      {/* Left Chat Column */}
      <div className="flex flex-1 flex-col border-e border-ink-100 bg-white">
        {/* Chat Top Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <SkeletonCircle size={40} />
            <div className="space-y-1.5">
              <SkeletonBox className="h-4 w-36 rounded-md" />
              <div className="flex items-center gap-1.5">
                <SkeletonBox className="h-2 w-2 rounded-full" />
                <SkeletonBox className="h-3 w-16 rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-8 w-24 rounded-lg" />
            <SkeletonBox className="h-8 w-8 rounded-lg" />
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Agent Message */}
          <div className="flex items-start gap-3 max-w-xl">
            <SkeletonCircle size={32} />
            <div className="space-y-2 rounded-2xl rounded-tl-sm bg-ink-50 p-4 border border-ink-100/70 w-full">
              <SkeletonBox className="h-4 w-full rounded-md" />
              <SkeletonBox className="h-4 w-5/6 rounded-md" />
              <SkeletonBox className="h-4 w-2/3 rounded-md" />
            </div>
          </div>

          {/* User Message */}
          <div className="flex items-start justify-end gap-3 ms-auto max-w-md">
            <div className="space-y-2 rounded-2xl rounded-tr-sm bg-primary-600/20 p-4 border border-primary-200/50 w-full">
              <SkeletonBox className="h-4 w-full rounded-md" />
              <SkeletonBox className="h-4 w-3/4 rounded-md" />
            </div>
            <SkeletonCircle size={32} />
          </div>

          {/* Agent Reply with Deliverable Preview */}
          <div className="flex items-start gap-3 max-w-xl">
            <SkeletonCircle size={32} />
            <div className="space-y-3 rounded-2xl rounded-tl-sm bg-ink-50 p-4 border border-ink-100/70 w-full">
              <SkeletonBox className="h-4 w-full rounded-md" />
              <SkeletonBox className="h-4 w-4/5 rounded-md" />

              {/* Preview Card */}
              <div className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <SkeletonBox className="h-4 w-32 rounded-md" />
                  <SkeletonBox className="h-4 w-16 rounded-full" />
                </div>
                <SkeletonBox className="h-3 w-full rounded-md" />
                <SkeletonBox className="h-3 w-2/3 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Input Area */}
        <div className="border-t border-ink-100 p-4 bg-white">
          <div className="rounded-2xl border border-ink-200 p-3 space-y-2">
            <SkeletonBox className="h-10 w-full rounded-lg" />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5">
                <SkeletonBox className="h-7 w-20 rounded-lg" />
                <SkeletonBox className="h-7 w-20 rounded-lg" />
              </div>
              <SkeletonBox className="h-8 w-20 rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Right Canvas Column (Desktop) */}
      <div className="hidden lg:flex flex-1 flex-col bg-ink-50/40">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 bg-white">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-5 w-5 rounded-md" />
            <SkeletonBox className="h-4 w-32 rounded-md" />
          </div>
          <SkeletonBox className="h-7 w-20 rounded-lg" />
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="relative flex flex-col items-center gap-6 w-full max-w-md">
            <SkeletonBox className="h-12 w-48 rounded-2xl" />
            <div className="flex items-center justify-between w-full gap-4">
              <SkeletonBox className="h-10 w-36 rounded-xl" />
              <SkeletonBox className="h-10 w-36 rounded-xl" />
            </div>
            <div className="flex items-center justify-between w-full gap-4">
              <SkeletonBox className="h-10 w-36 rounded-xl" />
              <SkeletonBox className="h-10 w-36 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
