'use client'

import React from 'react'
import { SkeletonBox, SkeletonCircle } from './SkeletonPrimitives'
import { useCopy } from '../../hooks/useCopy'

export default function AuthSkeleton() {
  const { t } = useCopy()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-50 p-6 animate-fade-in" aria-label={t('loadingAuthentication')}>
      <div className="card w-full max-w-md p-8 bg-white border border-ink-100 rounded-3xl shadow-card space-y-6">
        {/* Brand Logo & Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <SkeletonCircle size={52} />
          <SkeletonBox className="h-6 w-36 rounded-md" />
          <SkeletonBox className="h-4 w-52 rounded-md" />
        </div>

        {/* Form Inputs */}
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <SkeletonBox className="h-3.5 w-16 rounded-md" />
            <SkeletonBox className="h-11 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <SkeletonBox className="h-3.5 w-20 rounded-md" />
            <SkeletonBox className="h-11 w-full rounded-xl" />
          </div>
        </div>

        {/* Submit Button */}
        <SkeletonBox className="h-11 w-full rounded-xl" />

        {/* Footer Link */}
        <div className="flex justify-center pt-2">
          <SkeletonBox className="h-3.5 w-44 rounded-md" />
        </div>
      </div>
    </div>
  )
}
