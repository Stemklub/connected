// ─────────────────────────────────────────────────────────────
//  Konfiguracija škole. Ovdje mijenjajte smjerove, odjeljenja
//  i oznake. Nakon izmjene pokrenite:  npm run gen:seed
//  (regeneriše supabase/seed.sql i offline seed).
// ─────────────────────────────────────────────────────────────

export const SCHOOL = {
  name: 'JU Srednja ekonomsko-ugostiteljska škola',
  app: 'ConnectEd',
  slogan: 'Pronađi svoje ljude.',
}

/** Smjerovi. `index` ide u oznaku odjeljenja (III-2) i u pristupni kod (3201 = III-2, kod br. 1). */
export const SMJEROVI = [
  { id: 'et', letter: 'A', index: 1, naziv: 'Ekonomski tehničar' },
  { id: 'tt', letter: 'B', index: 2, naziv: 'Turistički tehničar' },
  { id: 'ku', letter: 'C', index: 3, naziv: 'Kuvar' },
  { id: 'ko', letter: 'D', index: 4, naziv: 'Konobar' },
] as const

export const RAZREDI = [1, 2, 3, 4] as const

const RIMSKI = ['', 'I', 'II', 'III', 'IV']

export interface SchoolClass {
  id: string // npr. "3-2"
  razred: number
  smjer: string
  label: string // npr. "III-2"
  codePrefix: string // npr. "3B"
}

export const CLASSES: SchoolClass[] = RAZREDI.flatMap((r) =>
  SMJEROVI.map((s) => ({
    id: `${r}-${s.index}`,
    razred: r,
    smjer: s.naziv,
    label: `${RIMSKI[r]}-${s.index}`,
    codePrefix: `${r}${s.letter}`,
  })),
)

export const TAGS = [
  { slug: 'kuvanje', label: 'Kuvanje', icon: '🍳' },
  { slug: 'poslasticarstvo', label: 'Poslastičarstvo', icon: '🧁' },
  { slug: 'barmen', label: 'Barmen i posluženje', icon: '🍹' },
  { slug: 'turizam', label: 'Turizam i ture', icon: '🧭' },
  { slug: 'jezici', label: 'Strani jezici', icon: '🗣️' },
  { slug: 'preduzetnistvo', label: 'Preduzetništvo', icon: '💼' },
  { slug: 'crtanje', label: 'Crtanje i dizajn', icon: '🎨' },
  { slug: 'video', label: 'Foto i video', icon: '📸' },
  { slug: 'muzika', label: 'Muzika i ples', icon: '🎵' },
  { slug: 'sport', label: 'Sport', icon: '⚽' },
] as const

export type TagSlug = (typeof TAGS)[number]['slug']
export const TAG_BY_SLUG: Record<string, (typeof TAGS)[number]> = Object.fromEntries(
  TAGS.map((t) => [t.slug, t]),
)

export const classLabel = (id: string | null | undefined) =>
  CLASSES.find((c) => c.id === id)?.label ?? ''
