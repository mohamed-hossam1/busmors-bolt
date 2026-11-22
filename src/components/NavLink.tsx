'use client'
import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { Link } from '@/shared/i18n'
import { stripLocale } from '@/lib/i18n'
type Props = Omit<ComponentProps<typeof Link>, 'className'> & { className?: string | ((state: { isActive: boolean }) => string) }
export default function NavLink({ href, className, ...props }: Props) {
 const target = typeof href === 'string' ? stripLocale(href) : href
 const isActive = stripLocale(usePathname() || '/') === target
 return <Link href={href} aria-current={isActive ? 'page' : undefined} className={typeof className === 'function' ? className({ isActive }) : (className ?? '') + (isActive ? ' active' : '')} {...props} />
}