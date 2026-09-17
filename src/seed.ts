// Seeded content and friend links need no server or account.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}
export function currentSeed() {
  const asked = new URLSearchParams(location.search).get('seed')
  const parsed = Number.parseInt(asked ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : dailySeed()
}
export function isDaily(seed: number) { return seed === dailySeed() }
export function seedUrl(seed: number) {
  const url = new URL(location.href)
  url.search = ''
  url.searchParams.set('seed', String(seed))
  return url.toString()
}
export function shuffle<T>(random: () => number, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export async function shareSeed(seed: number, title: string) {
  const url = seedUrl(seed)
  const payload = { title, text: `play this exact ${title} board with me`, url }
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      await navigator.share(payload)
      return 'shared'
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled'
  }
  try { await navigator.clipboard.writeText(url); return 'copied' }
  catch { return 'failed' }
}
