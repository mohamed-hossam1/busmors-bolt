const TRACKING = /^(utm_.+|fbclid|gclid|msclkid|ref|cta)$/i

export function normalizeSiteUrl(raw: string, relativeTo?: string): string {
  const input = raw.trim()
  const url = relativeTo ? new URL(input, relativeTo) : new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a public HTTP or HTTPS website URL.')
  // Reading uses the fixed external reader endpoint, never a browser-side target fetch.
  // Reject IP literals, local names, unusual ports and credential-bearing URLs first.
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)
    || /(?:^|\.)(?:localhost|local|internal|lan|home|onion)$/.test(host) || url.port
    || [...url.searchParams.keys()].some(key=>/^(?:access_token|api[_-]?key|token|password|secret|authorization)$/i.test(key))) {
    throw new Error('Use a public website address without credentials or internal-network targets.')
  }
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

