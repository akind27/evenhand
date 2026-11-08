const NOT_CHECKED_PREFIXES = ['AI limit reached', 'AI check unavailable', 'Demo mode'];

/** True when the photo was accepted without a real AI check (limit reached, AI down, or demo mode). */
export function isNotChecked(reason: string): boolean {
  return NOT_CHECKED_PREFIXES.some((prefix) => reason.startsWith(prefix));
}
