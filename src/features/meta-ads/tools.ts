export class ReadOnlyViolation extends Error {}

export const META_ADS_TOOLS = { listAdAccounts: 'METAADS_GET_AD_ACCOUNTS', insights: 'METAADS_GET_INSIGHTS' } as const

export const META_ADS_TOOLKIT_VERSION = '20261116_00'

export const META_ADS_ALLOWED_TOOLS: readonly string[] = [META_ADS_TOOLS.listAdAccounts, META_ADS_TOOLS.insights]

const FORBIDDEN = /CREATE|UPDATE|DELETE|SET_|PAUSE|UPLOAD|ARCHIVE|COPY/

export function assertAllowedTool(slug: string): void {
  if (!META_ADS_ALLOWED_TOOLS.includes(slug) || FORBIDDEN.test(slug)) {
    throw new ReadOnlyViolation(slug)
  }
}