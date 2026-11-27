// Tekstovi na crnogorskom (latinica, ijekavica). Tople, kratke rečenice.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']

export function fmtDate(d: string | null): string {
  if (!d) return 'bez roka'
  const x = new Date(d.length === 10 ? d + 'T12:00:00' : d)
  return `${x.getDate()}. ${MONTHS[x.getMonth()]}`
}

export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'upravo'
  if (s < 3600) return `prije ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `prije ${Math.floor(s / 3600)} h`
  return `prije ${Math.floor(s / 86400)} d`
}

/** 1 član, 2–4 člana, 5+ članova (i 11–14 članova). */
export function members(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return `${n} član`
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} člana`
  return `${n} članova`
}

/** „Trebaš nam u robotičkom timu.“ */
export const needYou = (joinText: string) => `Trebaš nam u ${joinText}.`
