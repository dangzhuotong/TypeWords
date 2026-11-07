import { get, update } from 'idb-keyval'
import md5 from 'md5'

interface Attempt {
  client_event_id: string
  word: string
  mode: 'typewords'
  correct: boolean
  duration_ms: number
  answered_at: string
  interval_days: number
  next_review_on: string
}

export function wordPracticeAttempts(
  sessionId: string,
  answeredAt: number,
  words: string[],
  wrongWords: string[],
  cards: Record<string, { scheduled_days: number }>,
): Attempt[] {
  const day = 86_400_000
  const mistakes = new Set(wrongWords)
  return words.flatMap(word => {
    if (!word.trim() || word.length > 128) return []
    const days = cards[word]?.scheduled_days ?? 1
    const interval = [1, 3, 7, 14, 30].reduce((best, candidate) =>
      Math.abs(days - candidate) < Math.abs(days - best) ? candidate : best
    )
    return [{
      client_event_id: md5(JSON.stringify([sessionId, word])),
      word,
      mode: 'typewords' as const,
      correct: !mistakes.has(word),
      duration_ms: 0,
      answered_at: new Date(answeredAt).toISOString(),
      interval_days: interval,
      next_review_on: new Date(answeredAt + (interval + 8 / 24) * day).toISOString().slice(0, 10),
    }]
  })
}

async function signedInUser(api: string): Promise<string | null> {
  const response = await fetch(`${api}/auth/me`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (response.status === 401 || response.status === 403) return null
  if (!response.ok) throw new Error('学习服务暂不可用')
  const { user } = await response.json()
  if (typeof user?.user_id !== 'string' || !user.user_id) throw new Error('学习服务返回了无效会话')
  return user.user_id
}

export async function syncWordPractice(apiPath: string, events: Attempt[] = []) {
  if (!apiPath) return 'disabled'
  const api = new URL(apiPath, location.origin)
  if (api.origin !== location.origin || api.search || api.hash) throw new Error('学习服务必须使用同源地址')
  const base = api.pathname.replace(/\/$/, '')
  const user = await signedInUser(base)
  if (!user) return 'signed-out'

  const key = `typewords.learning.pending:${base}:${user}`
  if (events.length) {
    await update<Attempt[]>(key, pending => {
      const merged = new Map((pending ?? []).map(event => [event.client_event_id, event]))
      for (const event of events) merged.set(event.client_event_id, event)
      return Array.from(merged.values())
    })
  }

  const pending = await get<Attempt[]>(key) ?? []
  for (let offset = 0; offset < pending.length; offset += 200) {
    if (await signedInUser(base) !== user) return 'signed-out'
    const batch = pending.slice(offset, offset + 200)
    const response = await fetch(`${base}/attempts`, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ events: batch }),
    })
    if (response.status === 401 || response.status === 403) return 'signed-out'
    if (!response.ok) throw new Error('学习记录提交失败')
    const result = await response.json()
    if (!Number.isInteger(result.accepted) || !Number.isInteger(result.duplicate) ||
        result.accepted + result.duplicate !== batch.length || result.rejected?.length !== 0) {
      throw new Error('学习服务未确认整批记录')
    }
    const ids = new Set(batch.map(event => event.client_event_id))
    await update<Attempt[]>(key, stored => (stored ?? []).filter(event => !ids.has(event.client_event_id)))
  }
  return 'synced'
}
