export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true'
}

export function isBetaInviteOnly(): boolean {
  return process.env.BETA_INVITE_ONLY !== 'false'
}