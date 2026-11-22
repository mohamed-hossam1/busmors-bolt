'use client'

import NextLink from 'next/link'
import type { ComponentProps } from 'react'
import { useI18n } from '@/context/I18nContext'

// Locale-aware Link: internal absolute hrefs are prefixed with the active locale
// (e.g. /employee -> /en/employee). Hash links and external URLs are left untouched.
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const { localizePath } = useI18n()
  const resolved = typeof href === 'string' ? localizePath(href) : href
  if (typeof resolved === 'string' && resolved.startsWith('#')) {
    return <a href={resolved} {...(props as ComponentProps<'a'>)} />
  }
  return <NextLink href={resolved} {...props} />
}