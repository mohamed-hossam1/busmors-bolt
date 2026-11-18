import { Link as RouterLink, type LinkProps } from 'react-router-dom'

export function Link({ href, ...props }: Omit<LinkProps, 'to'> & { href: string }) {
  return href.startsWith('#') ? <a href={href} {...props} /> : <RouterLink to={href} {...props} />
}
