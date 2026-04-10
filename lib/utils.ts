// ─── 日付ユーティリティ ────────────────────────────────────────

/** 今日の日付を YYYY-MM-DD 形式で返す */
export function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

/** YYYY-MM-DD → YYYY/MM/DD */
export function toDisplayDate(iso: string): string {
  return iso.replace(/-/g, '/')
}

/** 今日の日付を日本語ロケールで返す (例: 2024/01/15) */
export function todayDisplay(): string {
  return new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
