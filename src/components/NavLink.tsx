'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
type Props = Omit<ComponentProps<typeof Link>, 'className'> & { className?: string | ((state: { isActive: boolean }) => string) }
export default function NavLink({ href, className, ...props }: Props) {
 const isActive = usePathname() === href
 return <Link href={href} aria-current={isActive ? 'page' : undefined} className={typeof className === 'function' ? className({ isActive }) : (className ?? '') + (isActive ? ' active' : '')} {...props} />
}
