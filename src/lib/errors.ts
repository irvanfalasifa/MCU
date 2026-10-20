export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    const cleaned = err.message.replace(/\s*\[\d+\]\s*$/, '').trim()
    if (cleaned && cleaned.toLowerCase() !== 'internal') return cleaned
  }
  return fallback
}