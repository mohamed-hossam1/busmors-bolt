'use client'

import React from 'react'
import { SkeletonBox } from './SkeletonPrimitives'
import { useCopy } from '../../hooks/useCopy'

export default function AuthSkeleton() {
  const { t } = useCopy()
  return (
    <div className="grid min-h-[100dvh] bg-ink-50 lg:grid-cols-2 animate-fade-in" aria-label={t('loadingAuthentication')}>
      {/* Form Column */}
      <div className="flex min-w-0 flex-col px-6 py-6 sm:px-10 lg:px-14">
        {/* Header: Brand & Language Switcher */}
        <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-2.5">
            <SkeletonBox className="h-10 w-10 rounded-xl" />
            <SkeletonBox className="h-6 w-24 rounded-md" />
          </div>
          <SkeletonBox className="h-7 w-20 rounded-full" />
        </header>

        {/* Center Content: Title, Google Button, Inputs, Submit */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6 sm:py-10">
          {/* Title & Subtitle */}
          <SkeletonBox className="h-8 sm:h-9 w-48 rounded-xl" />
          <SkeletonBox className="mt-2 h-4 w-64 rounded-md" />

          {/* Form Area */}
          <div className="mt-6 sm:mt-8 space-y-4">
            {/* Google OAuth Button */}
            <SkeletonBox className="h-10 w-full rounded-full" />

            {/* Divider */}
            <div className="my-2 flex items-center gap-3">
              <span className="h-px flex-1 bg-ink-200" />
              <SkeletonBox className="h-3 w-20 rounded-md" />
              <span className="h-px flex-1 bg-ink-200" />
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <SkeletonBox className="h-3.5 w-24 rounded-md" />
              <SkeletonBox className="h-11 w-full rounded-xl" />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <SkeletonBox className="h-3.5 w-20 rounded-md" />
              <SkeletonBox className="h-11 w-full rounded-xl" />
            </div>

            {/* Forgot Password Link */}
            <div className="pt-0.5">
              <SkeletonBox className="h-3.5 w-28 rounded-md" />
            </div>

            {/* Submit Button */}
            <SkeletonBox className="h-10 w-full rounded-full" />

            {/* Switch Mode Link (Sign up / Sign in) */}
            <div className="mt-6 flex justify-center pt-2">
              <SkeletonBox className="h-4 w-56 rounded-md" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mx-auto mt-auto w-full max-w-md pt-4">
          <SkeletonBox className="h-3 w-48 rounded-md" />
        </footer>
      </div>

      {/* Brand Panel (aside) on Desktop */}
      <aside className="auth-brand-panel relative mx-6 my-6 hidden w-full min-w-0 max-w-2xl flex-col justify-between self-center justify-self-center overflow-hidden rounded-[32px] border border-white/10 bg-cosmic-card p-8 text-white lg:flex lg:w-[calc(100%_-_3rem)] xl:p-12">
        <div className="relative z-10 space-y-6">
          {/* Eyebrow badge */}
          <SkeletonBox dark className="h-8 w-44 rounded-full" />

          {/* Headline */}
          <div className="space-y-3 pt-2">
            <SkeletonBox dark className="h-11 sm:h-12 w-4/5 rounded-2xl" />
            <SkeletonBox dark className="h-11 sm:h-12 w-3/5 rounded-2xl" />
          </div>

          {/* Description */}
          <div className="space-y-2 pt-2">
            <SkeletonBox dark className="h-4 w-5/6 rounded-md" />
            <SkeletonBox dark className="h-4 w-2/3 rounded-md" />
          </div>
        </div>

        {/* Aside Footer */}
        <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
          <SkeletonBox dark className="h-4 w-40 rounded-md" />
          <SkeletonBox dark className="h-5 w-5 rounded-md" />
        </div>
      </aside>
    </div>
  )
}

