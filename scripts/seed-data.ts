// ─────────────────────────────────────────────────────────────
//  Seed podaci. SVI učenici su IZMIŠLJENI (samo nikovi).
//  Nakon izmjene: npm run gen:seed
// ─────────────────────────────────────────────────────────────
import { CLASSES } from '../src/config/school'
import type { TagKind } from '../src/lib/matching'

export interface SeedProfile { id: string; nick: string; class_id: string; tags: { tag: string; kind: TagKind }[] }
export interface SeedProject {
  id: string; title: string; goal: string; icon: string; spots: number; status: 'open' | 'done'
  leader_id: string; tags: string[]; created: number; approved: number; completed?: number
  deadline: number; result_text?: string
}
export type OpportunityKind = 'takmicenje' | 'hakaton' | 'radionica' | 'predavanje' | 'konkurs' | 'volontiranje'
export interface SeedOpportunity {
  id: string; title: string; kind: OpportunityKind; organizer: string; deadline: number
  place: string; audience: string; description: string; tags: string[]; posted_by_label: string; created: number
}
export interface SeedData {
  codes: { code: string; role: 'student' | 'mentor' | 'pedagog'; class_id: string | null }[]
  profiles: SeedProfile[]
  projects: SeedProject[]
  members: { project_id: string; profile_id: string; joined: number }[]
  wall: { project_id: string; author_id: string | null; kind: 'post' | 'system'; body: string; ago: number }[]
  firstGroupEvents: { profile_id: string; ago: number }[]
  opportunities: SeedOpportunity[]
}
// Vrijeme: `created`, `approved`, `completed`, `joined`, `ago` = prije koliko DANA; `deadline` = za koliko dana.

const pid = (n: number) => `a0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const prj = (n: number) => `b0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

// [nik, odjeljenje, oznake "slug:vrsta,…"]   vrsta: z = znam, v = volim, u = želim da naučim
const RAW: [string, string, string][] = [
  ['luna.k', '1-1', 'crtanje:z,video:v'],
  ['marko_99', '1-1', 'sport:z'],
  ['tea.art', '1-2', 'crtanje:z,muzika:v'],
  ['nikola7', '1-2', 'turizam:v,jezici:z'],
  ['sara.slatko', '1-3', 'poslasticarstvo:z,kuvanje:v'],
  ['vuk', '1-3', 'kuvanje:z,sport:v'],
  ['mia_mix', '1-4', 'barmen:z,muzika:v'],
  ['dejo', '1-4', 'barmen:v,sport:z'],
  ['ana.vodi', '2-2', 'turizam:z,jezici:z,video:v'],
  ['bojan.b', '2-1', 'preduzetnistvo:z'],
  ['lena', '2-1', 'jezici:z,video:v'],
  ['stefan.ritam', '2-2', 'muzika:z'],
  ['jana_torte', '2-3', 'poslasticarstvo:z,crtanje:v'],
  ['petar.chef', '2-3', 'kuvanje:z,preduzetnistvo:u'],
  ['iva.shake', '2-4', 'barmen:z,muzika:v'],
  ['milos', '2-4', 'sport:z,muzika:u'],
  ['kaća', '3-1', 'preduzetnistvo:z,jezici:v'],
  ['dusan.foto', '3-1', 'video:z,turizam:v'],
  ['eli.ples', '3-2', 'muzika:z'],
  ['andrej.gg', '3-2', 'sport:z,crtanje:v'],
  ['maja.mural', '3-3', 'crtanje:z,poslasticarstvo:v'],
  ['ognjen', '3-3', 'kuvanje:v,muzika:u'],
  ['tamara', '3-4', 'barmen:z,jezici:v'],
  ['luka.bas', '3-4', 'muzika:z,sport:v'],
  ['mina.pise', '4-1', 'jezici:z,preduzetnistvo:v'],
  ['filip.cut', '4-1', 'video:z'],
  ['nina', '4-2', 'turizam:z,muzika:v'],
  ['relja', '4-2', 'sport:z,turizam:u'],
  ['zara', '4-3', 'poslasticarstvo:v,kuvanje:z'],
  ['bane.drums', '4-4', 'muzika:z,preduzetnistvo:v'],
  // ↓ trenutno nisu ni u jednoj grupi (~1/4)
  ['ena.crta', '1-1', 'crtanje:v'],
  ['igor', '1-3', 'kuvanje:v,sport:u'],
  ['sofija.en', '1-2', 'jezici:z,turizam:u'],
  ['dario', '2-4', 'barmen:v,sport:v'],
  ['kiki', '2-3', 'poslasticarstvo:v,video:u'],
  ['lazar.beat', '3-4', 'muzika:v'],
  ['hana', '3-2', 'muzika:v,barmen:u'],
  ['teo', '4-3', 'preduzetnistvo:u,sport:v'],
  ['mila.m', '4-1', 'crtanje:u,jezici:v'],
  ['pavle', '4-4', 'sport:v,kuvanje:u'],
]

const KIND: Record<string, TagKind> = { z: 'znam', v: 'volim', u: 'ucim' }
const profiles: SeedProfile[] = RAW.map(([nick, class_id, tags], i) => ({
  id: pid(i + 1),
  nick,
  class_id,
  tags: tags.split(',').map((t) => {
    const [tag, k] = t.split(':')
    return { tag, kind: KIND[k] }
  }),
}))
const P = (nick: string) => {
  const p = profiles.find((x) => x.nick === nick)
  if (!p) throw new Error('Nema nika ' + nick)
  return p.id
}

// Projekti u toku (nijedan ne traži „Foto i video“: taj poziv u demonstraciji dolazi od projekta koji A pokreće uživo).
const projects: SeedProject[] = [
  { id: prj(1), icon: '🧁', title: 'Ketering za školsku proslavu traži poslastičara', goal: 'Slatki sto za 150 gostiju na proslavi Dana škole.', spots: 3, status: 'open', leader_id: P('petar.chef'), tags: ['poslasticarstvo', 'kuvanje'], created: 9, approved: 8, deadline: 18 },
  { id: prj(2), icon: '🧭', title: 'Tura kroz Stari Bar traži vodiča na engleskom', goal: 'Šetnja za goste iz partnerske škole iz Italije.', spots: 3, status: 'open', leader_id: P('ana.vodi'), tags: ['turizam', 'jezici'], created: 8, approved: 7, deadline: 21 },
  { id: prj(3), icon: '🎨', title: 'Školski mural traži nekoga ko crta', goal: 'Mural na zidu kod sale: „Naša škola, naš sto“.', spots: 3, status: 'open', leader_id: P('maja.mural'), tags: ['crtanje'], created: 14, approved: 13, deadline: 14 },
  { id: prj(5), icon: '🍹', title: 'Bezalkoholni kokteli za Dan škole traže barmena', goal: 'Meni od pet mocktaila i posluženje za goste.', spots: 2, status: 'open', leader_id: P('tamara'), tags: ['barmen'], created: 5, approved: 4, deadline: 18 },
  { id: prj(6), icon: '🏐', title: 'Turnir u odbojci traži organizatore', goal: 'Međuodjeljenski turnir: raspored, sudije, medalje.', spots: 4, status: 'open', leader_id: P('relja'), tags: ['sport', 'preduzetnistvo'], created: 10, approved: 9, deadline: 25 },
  { id: prj(7), icon: '💼', title: 'Mini sajam učeničke zadruge traži prodavce', goal: 'Štand sa domaćim proizvodima i cjenovnikom na dva jezika.', spots: 3, status: 'open', leader_id: P('kaća'), tags: ['preduzetnistvo', 'jezici'], created: 7, approved: 6, deadline: 20 },
  { id: prj(9), icon: '💃', title: 'Muzički program za maturu traži izvođače', goal: 'Ples i dvije pjesme za maturski program.', spots: 4, status: 'open', leader_id: P('eli.ples'), tags: ['muzika'], created: 3, approved: 2, deadline: 40 },
  // Završeni
  { id: prj(12), icon: '👩‍🍳', title: 'Kuvar za jedan dan: radionica za osnovce', goal: 'Radionica pravljenja palačinki za 30 osnovaca.', spots: 3, status: 'done', leader_id: P('zara'), tags: ['kuvanje', 'poslasticarstvo'], created: 35, approved: 34, completed: 10, deadline: -9, result_text: '30 osnovaca, 200 palačinki i nijedna izgorjela. Recepte smo podijelili roditeljima.' },
  { id: prj(14), icon: '🎄', title: 'Novogodišnji štand učeničke zadruge', goal: 'Prodaja kolača i čestitki za humanitarnu akciju.', spots: 3, status: 'done', leader_id: P('bojan.b'), tags: ['preduzetnistvo', 'poslasticarstvo', 'crtanje'], created: 60, approved: 59, completed: 20, deadline: -19, result_text: 'Prikupili smo 640 € za opremu dječjeg odjeljenja bolnice.' },
  { id: prj(15), icon: '🎬', title: 'Video vodič kroz Stari grad', goal: 'Kratki video na tri jezika za goste škole.', spots: 3, status: 'done', leader_id: P('filip.cut'), tags: ['video', 'turizam', 'jezici'], created: 40, approved: 39, completed: 6, deadline: -5, result_text: 'Snimili smo vodič od 4 minuta na crnogorskom, engleskom i italijanskom. Pušta se na Danu otvorenih vrata.' },
]

// Članovi (vođa se dodaje automatski).
const extra: [number, string[]][] = [
  [1, ['sara.slatko', 'jana_torte']],
  [2, ['nikola7', 'nina']],
  [3, ['tea.art', 'luna.k']],
  [5, ['mia_mix']],
  [6, ['marko_99', 'milos', 'andrej.gg']],
  [7, ['dejo', 'mina.pise']],
  [9, ['iva.shake', 'luka.bas', 'stefan.ritam']],
  [12, ['vuk', 'ognjen']],
  [14, ['jana_torte', 'kaća', 'bane.drums']],
  [15, ['dusan.foto', 'lena']],
]
const members: SeedData['members'] = []
for (const p of projects) members.push({ project_id: p.id, profile_id: p.leader_id, joined: p.approved })
for (const [n, nicks] of extra) {
  const p = projects.find((x) => x.id === prj(n))!
  for (const nick of nicks) {
    const id = P(nick)
    if (!members.some((m) => m.project_id === p.id && m.profile_id === id))
      members.push({ project_id: p.id, profile_id: id, joined: Math.max(p.approved - 1, 0) })
  }
}

const wall: SeedData['wall'] = [
  { project_id: prj(3), author_id: null, kind: 'system', body: 'Projekat je odobren. Srećno, tim! 🚀', ago: 13 },
  { project_id: prj(3), author_id: P('maja.mural'), kind: 'post', body: 'Skica je odobrena! Boje stižu u petak.', ago: 6 },
  { project_id: prj(3), author_id: P('tea.art'), kind: 'post', body: 'Ja donosim šablone za sunce 🌞', ago: 2 },
  { project_id: prj(1), author_id: null, kind: 'system', body: 'Projekat je odobren. Srećno, tim! 🚀', ago: 8 },
  { project_id: prj(1), author_id: P('petar.chef'), kind: 'post', body: 'Probni dan u kuhinji: srijeda, 7. čas.', ago: 3 },
  { project_id: prj(2), author_id: P('ana.vodi'), kind: 'post', body: 'Ruta: Kapija → Akvadukt → Sahat-kula. Treba nam još neko za engleski!', ago: 4 },
  { project_id: prj(9), author_id: P('eli.ples'), kind: 'post', body: 'Proba u fiskulturnoj sali, petak poslije škole.', ago: 2 },
  { project_id: prj(15), author_id: null, kind: 'system', body: 'Projekat je završen! Rezultat je sada u feedu škole. 🎉', ago: 6 },
]

const firstGroupEvents = [
  { profile_id: P('tea.art'), ago: 12 },
  { profile_id: P('nikola7'), ago: 6 },
  { profile_id: P('dejo'), ago: 5 },
  { profile_id: P('dusan.foto'), ago: 2 },
  { profile_id: P('nina'), ago: 1 },
]

// ─── Pristupni kodovi ───────────────────────────────────────
// Četiri cifre: razred · smjer · redni broj (01–10).  3201 = III-2, kod br. 1.
// Mentori 9001–9005, pedagog 8001–8002. Svaki kod važi jednom.
export const CODES_PER_CLASS = 10
const codes: SeedData['codes'] = []
for (const c of CLASSES)
  for (let k = 1; k <= CODES_PER_CLASS; k++)
    codes.push({ code: `${c.razred}${c.id.split('-')[1]}${String(k).padStart(2, '0')}`, role: 'student', class_id: c.id })
for (let k = 1; k <= 5; k++) codes.push({ code: `900${k}`, role: 'mentor', class_id: null })
for (let k = 1; k <= 2; k++) codes.push({ code: `800${k}`, role: 'pedagog', class_id: null })

// ─── Prilike van škole (izmišljene; organizatori su generički) ───
const opp = (n: number) => `d0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const opportunities: SeedOpportunity[] = [
  { id: opp(1), kind: 'hakaton', title: 'Hakaton „Turizam sjutra“ za srednjoškolce', organizer: 'Inovacioni centar za mlade', deadline: 18, place: 'Podgorica', audience: 'II–IV razred, timovi od 3 do 5', description: 'Dva dana smišljanja digitalnih rješenja za lokalni turizam. Mentori iz IT firmi i hotela, hrana i majice obezbijeđeni. Trebaju ljudi za ideju, dizajn, jezike i prezentaciju.', tags: ['turizam', 'preduzetnistvo', 'crtanje'], posted_by_label: 'Mentorka sekcije', created: 3 },
  { id: opp(2), kind: 'takmicenje', title: 'Regionalno takmičenje mladih kuvara i poslastičara', organizer: 'Udruženje kuvara primorja', deadline: 14, place: 'Budva', audience: 'III i IV razred, smjer kuvar', description: 'Takmičenje u pripremi predjela i deserta od lokalnih namirnica. Najbolji dobijaju praksu u hotelima sa pet zvjezdica.', tags: ['kuvanje', 'poslasticarstvo'], posted_by_label: 'Profesor praktične nastave', created: 5 },
  { id: opp(3), kind: 'radionica', title: 'Radionica: barmenstvo i latte art', organizer: 'Akademija za ugostiteljstvo', deadline: 7, place: 'Bar, školska kuhinja', audience: 'Svi razredi, 12 mjesta', description: 'Tri sata prakse: klasični mocktaili, aparat za espresso i crtanje u mlijeku. Dobijaš potvrdu o učešću.', tags: ['barmen'], posted_by_label: 'Mentorka sekcije', created: 2 },
  { id: opp(4), kind: 'predavanje', title: 'Predavanje: kako do prvog posla u turizmu', organizer: 'Klub mladih turističkih radnika', deadline: 5, place: 'Online', audience: 'Svi razredi', description: 'Mladi recepcioneri, vodiči i menadžeri pričaju kako su počeli, šta poslodavci traže i kako se piše prva radna biografija.', tags: ['turizam', 'jezici', 'preduzetnistvo'], posted_by_label: 'Školski pedagog', created: 1 },
  { id: opp(5), kind: 'konkurs', title: 'Foto i video konkurs „Moj grad u kadru“', organizer: 'Opštinski centar za kulturu', deadline: 25, place: 'Online prijava', audience: 'Učenici srednjih škola', description: 'Pošalji do tri fotografije ili video do 60 sekundi o mjestu u kojem živiš. Najbolji radovi idu na izložbu u gradskoj galeriji.', tags: ['video', 'crtanje'], posted_by_label: 'Učenički parlament', created: 4 },
  { id: opp(6), kind: 'volontiranje', title: 'Volonteri za ljetnji festival na Primorju', organizer: 'Festivalski odbor', deadline: 30, place: 'Bar', audience: 'Od 16 godina', description: 'Doček gostiju, info-pult na engleskom i pomoć bendovima iza bine. Volonterska potvrda i festivalska majica.', tags: ['jezici', 'turizam', 'muzika'], posted_by_label: 'Učenički parlament', created: 6 },
  { id: opp(7), kind: 'konkurs', title: 'Konkurs za najbolju biznis ideju mladih', organizer: 'Fond za podršku mladim preduzetnicima', deadline: 40, place: 'Online prijava', audience: 'Učenici i timovi do 4 člana', description: 'Opiši ideju na dvije strane: problem, rješenje, kupci i troškovi. Finalisti dobijaju mentorstvo i novčanu nagradu za početak.', tags: ['preduzetnistvo'], posted_by_label: 'Profesorka ekonomije', created: 8 },
  { id: opp(8), kind: 'radionica', title: 'Radionica: snimanje i montaža telefonom', organizer: 'Medijski centar za mlade', deadline: 12, place: 'Podgorica', audience: 'Svi razredi', description: 'Kako snimiti dobar kadar telefonom, popraviti svjetlo i montirati kratak video za društvene mreže. Ponesi telefon.', tags: ['video'], posted_by_label: 'Mentorka sekcije', created: 2 },
]

export const SEED: SeedData = { codes, profiles, projects, members, wall, firstGroupEvents, opportunities }
