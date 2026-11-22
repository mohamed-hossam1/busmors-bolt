'use client'

import React from 'react'

export function SkeletonBox({
  className = '',
  style,
  dark = false,
}: {
  className?: string
  style?: React.CSSProperties
  dark?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      className={`${dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} rounded-lg ${className}`}
      style={style}
    />
  )
}

export function SkeletonCircle({
  size = 40,
  className = '',
  dark = false,
}: {
  size?: number
  className?: string
  dark?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      className={`${dark ? 'skeleton-shimmer-dark' : 'skeleton-shimmer'} shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export function SkeletonHeader({
  actions,
}: {
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <SkeletonBox className="h-11 w-11 rounded-2xl" />
        <div className="space-y-2">
          <SkeletonBox className="h-6 w-36 sm:w-48 rounded-md" />
          <SkeletonBox className="h-4 w-60 sm:w-80 rounded-md" />
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
