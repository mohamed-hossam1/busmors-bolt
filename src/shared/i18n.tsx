import NextLink from 'next/link'
import type { ComponentProps } from 'react'
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  return typeof href === 'string' && href.startsWith('#') ? <a href={href} {...props} /> : <NextLink href={href} {...props} />
}
