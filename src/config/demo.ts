// ─────────────────────────────────────────────────────────────
//  Konfiguracija demo verzije. Oznake ovdje MORAJU biti iste kao
//  u supabase/setup.sql (tabela public.tags). Test to provjerava.
// ─────────────────────────────────────────────────────────────

export const APP = {
  name: 'ConnectEd',
  slogan: 'Pronađi svoje ljude.',
  club: 'STEM klub',
}

export const TAGS = [
  { slug: 'robotika', label: 'Robotika', icon: '🤖' },
  { slug: 'programiranje', label: 'Programiranje', icon: '💻' },
  { slug: 'dizajn', label: 'Dizajn i crtanje', icon: '🎨' },
  { slug: 'video', label: 'Foto i video', icon: '📸' },
  { slug: 'nauka', label: 'Nauka i eksperimenti', icon: '🔬' },
  { slug: 'ekologija', label: 'Ekologija', icon: '🌱' },
  { slug: 'muzika', label: 'Muzika', icon: '🎵' },
  { slug: 'ideje', label: 'Ideje i preduzetništvo', icon: '💡' },
] as const

export type TagSlug = (typeof TAGS)[number]['slug']
export const TAG_BY_SLUG: Record<string, (typeof TAGS)[number]> = Object.fromEntries(TAGS.map((t) => [t.slug, t]))
export const tagLabel = (slug: string | null | undefined) => (slug && TAG_BY_SLUG[slug]?.label) || ''
export const tagIcon = (slug: string | null | undefined) => (slug && TAG_BY_SLUG[slug]?.icon) || '🚀'

export const MIN_TAGS = 1
export const MAX_TAGS = 4

/** Izvor prijave iz linka: /#/?izvor=stand. Bez parametra → finale. */
export const SOURCES = ['stand', 'finale'] as const
export type Source = (typeof SOURCES)[number]
export const parseSource = (v: string | null | undefined): Source => (v === 'stand' ? 'stand' : 'finale')
