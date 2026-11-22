export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return {
      url: 'data:text/javascript,export default {}',
      shortCircuit: true,
    }
  }
  if (specifier === 'next/headers') {
    return {
      url: 'data:text/javascript,export const cookies = async () => ({ get: () => undefined, getAll: () => [], set: () => {}, has: () => false })',
      shortCircuit: true,
    }
  }
  try {
    return await next(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error
    const candidates = []
    if (/\.js$/.test(specifier)) candidates.push(specifier.replace(/\.js$/, '.ts'))
    if (!/\.[a-z0-9]+$/i.test(specifier)) candidates.push(specifier + '.ts', specifier + '/index.ts')
    for (const candidate of candidates) {
      try { return await next(candidate, context) } catch { /* try the next candidate */ }
    }
    throw error
  }
}
