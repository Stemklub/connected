<p align="center"><img src="public/logo.png" alt="ConnectEd" width="360"></p>

<p align="center"><b>Pronađi svoje ljude.</b><br>
Publika skenira QR kod, izabere ime i interesovanja i za 30 sekundi dobije poziv u tim. Platno u sali prikazuje uživo kako se timovi pune.</p>

> **Demo.** Bez imena, emaila i lozinki za učesnike: samo izabrano ime („Zelena Sova“) i 1–4 interesovanja. Demo se poslije prezentacije resetuje.

| | Link |
|---|---|
| Aplikacija (telefoni) | https://stemklub.github.io/ConnectEd/ |
| Štand (bilježi izvor) | https://stemklub.github.io/ConnectEd/#/?izvor=stand |
| Platno (1920×1080) | https://stemklub.github.io/ConnectEd/#/platno |
| Platno za štand (QR vodi na `?izvor=stand`) | https://stemklub.github.io/ConnectEd/#/platno?izvor=stand |
| Mentor | https://stemklub.github.io/ConnectEd/#/admin (`prof.e2e` / `demo1234`) |

Stara verzija (odjeljenja, offline režim, prilike van škole) je sačuvana pod tagom [`v1-demo`](https://github.com/STEMklub/ConnectEd/tree/v1-demo).

---

## Tok

1. **Ulaz** (`/#/`): dugme **Uđi**. Bez kucanja: `signInAnonymously()` + jedan kod iz bazena (`claim_demo_code`). Sesija ostaje u pregledaču, pa osvježavanje ne pravi novi nalog.
2. **Ime:** šest slobodnih imena „pridjev + životinja“ sa slaganjem roda (Zelena Sova, Brzi Delfin) i dugme „Druga imena“. Slobodan unos ne postoji.
3. **Interesovanja:** 1–4 od 8 oznaka → **Gotovo**.
4. **Poziv** stiže u odgovoru na „Gotovo“ (ne preko Realtime-a): „**Trebaš nam u robotičkom timu.**“ + „Zašto ti: Robotika“. Dugmad su **Pridružujem se** / **Ne sada**. „Ne sada“ nema posljedica. Ako nema poklapanja, stiže rezervni poziv „STEM klub traži ljude sa idejama“.
5. **Donja navigacija:** Za tebe · Moji timovi · Profil.
   - *Za tebe*: poziv na čekanju, timovi po interesovanjima (dugme „Pridruži se“) i ostali timovi.
   - *Moji timovi*: moji timovi sa članovima; sekundarni link „Imaš ideju? Predloži projekat“ (ide mentoru na odobrenje).
   - *Profil*: ime, interesovanja, **moj kod** i link **Imam kod** (nastavak istog naloga na drugom telefonu).
6. **Platno** (`/#/platno`): QR kod, broj učesnika i broj u timovima, trake po timovima i zid „Zelena Sova se pridružuje robotičkom timu“. Samo zbirni brojevi i nikovi.
7. **Mentor** (`/#/admin`, nik + lozinka): prijave otvorene/zatvorene, moderacija predloga, dodavanje kodova, CSV za štand (broj prijava i pridruživanja po izvoru, bez nikova) i **Resetuj demo**.

**Spajanje** (na serveru, `private.match_invite`): poklapanje oznake projekta sa oznakama učesnika; od više poklapanja bira tim sa manje članova. Kad mentor odobri predlog, pozivi idu prvo onima koji nisu ni u jednom timu (skrivena prednost, ne vidi se u interfejsu ni u API odgovorima). Rezervni poziv dobija samo onaj ko nije u timu.

## Arhitektura

| Dio | Tehnologija |
|---|---|
| Frontend | Vite + React + TypeScript, `HashRouter`, GitHub Pages |
| Podaci | Supabase (Free): Postgres + anonimni Auth + Realtime; RLS na **svim** tabelama |
| Pisanje | Isključivo RPC funkcije (`security definer`), pomoćne funkcije u šemi `private` |
| Realtime | Samo platno i admin (tabela `demo_events`). Telefoni ne otvaraju websocket. Platno i admin se osvježavaju i sami ako websocket padne. |

```
supabase/setup.sql              čista instalacija (cijela baza, seed, 300 kodova)
supabase/nadogradnja-v1-v2.sql  postojeća v1 baza → v2 (GENERISANO: npm run gen:upgrade)
src/config/demo.ts              8 oznaka (iste kao u setup.sql; test provjerava)
src/lib/api.ts                  Supabase klijent, sesija, RPC
src/screens/                    Entry (ulaz/ime/interesovanja/poziv), ForYou, Teams, Profile, Platno, Admin
tests/*.test.ts                 SQL testovi nad pravim setup.sql (PGlite + Postgres 16)
tests/e2e/                      Playwright: telefon 390 px, platno 1920×1080, admin
tests/server/fake-supabase.ts   lažni Supabase (Auth + RPC nad PGlite) za e2e i lokalni rad
scripts/load-test.ts            100 klijenata nad pravim Supabase-om
```

**Baza:** `demo_settings`, `demo_codes`, `profiles` (nik, uloga, izvor), `tags`, `profile_tags`, `projects` (naslov, jedna rečenica, rok, oznaka, `join_text`, neograničena mjesta), `memberships`, `invites` (razlog = oznaka, bez skora), `demo_events` (nik + tekst, za zid).

**RPC:** `claim_demo_code`, `get_me`, `redeem_code`, `suggest_nicks`, `set_nick`, `save_interests`, `respond_invite`, `join_project`, `get_for_you`, `get_my_teams`, `propose_project`, `get_screen` (javno); mentor: `get_admin`, `set_registrations`, `approve_project`, `reset_demo`, `generate_codes`, `export_stand_stats`.

---

## Postavljanje

### 1. Baza
U Supabase projektu: **SQL Editor → New query**, zalijepite **cijeli** fajl i kliknite **Run**:
- baza postavljena starom verzijom (v1): [`supabase/nadogradnja-v1-v2.sql`](supabase/nadogradnja-v1-v2.sql). Briše sve v1 tabele i naloge učenika, a čuva mentorske naloge (npr. `prof.e2e`). Radi u jednoj transakciji.
- prazan projekat: [`supabase/setup.sql`](supabase/setup.sql).

Provjera: **Table Editor** prikazuje `projects` (9 redova) i `demo_codes` (300 redova).

### 2. Supabase podešavanja (obavezno prije nastupa)
1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: UKLJUČITI.** Bez ovoga dugme „Uđi“ ne radi.
2. **Authentication → Rate Limits → anonimne prijave** (*Anonymous users*): podići na npr. **300 na sat**. Cijela sala dijeli jednu IP adresu, a podrazumijevana granica je niska. **Ovo je najveći rizik za nastup.**
3. Besplatni projekat se **pauzira nakon 7 dana neaktivnosti**. Dan prije finala otvorite aplikaciju ili uradite reset.

### 3. Mentorski nalog
Nadogradnja čuva postojeći `prof.e2e`. Na novom projektu: **Authentication → Users → Add user → Create new user**: email `prof.e2e@connected.test`, lozinka `demo1234`, uključite **Auto Confirm User**. Zatim u SQL Editoru:
```sql
select private.make_mentor('prof.e2e');
```

### 4. GitHub
- **Settings → Secrets and variables → Actions:** `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` (Publishable/anon ključ; javan je po dizajnu, podatke štiti RLS. **Nikad** `service_role`).
- **Settings → Pages → Source: GitHub Actions.** Svaki push na `main` pokreće testove, build i deploy. Workflow sam podesi putanju iz imena repoa (`VITE_BASE`).

### Lokalno
```bash
npm install
npm run fake-supabase          # lažni Supabase na :54321 (PGlite, isti setup.sql)
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=fake npm run dev
```
Ili sa pravim projektom: `cp .env.example .env.local`, upišite URL i ključ, pa `npm run dev`.

---

## Na dan finala

1. **Dan prije:** otvorite aplikaciju (da se projekat ne pauzira) i provjerite podešavanja iz koraka 2.
2. **Prije nastupa:** `/#/admin` → **Resetuj demo**. Na projektor otvorite `/#/platno` (F11 za cijeli ekran).
3. **Nastup:** publika skenira QR sa platna. Brojevi, trake i zid se mijenjaju uživo.
4. **Štand:** QR sa `/#/platno?izvor=stand`. CSV u adminu daje broj prijava i pridruživanja po izvoru.
5. Ako treba zaustaviti nove prijave: prekidač **Prijave** u adminu. Ko je već unutra, nastavlja.

---

## Testovi

```bash
npm test                 # SQL nad pravim setup.sql (PGlite): svih 162 kombinacija 1–4 oznake dobija poziv,
                         # kodovi, „Imam kod“, RLS i prava, reset, moderacija, nadogradnja v1→v2
PG_TEST_URL=postgres://postgres@localhost:5432/postgres npm test
                         # + 100 istovremenih claim_demo_code nad pravim Postgres-om (atomičnost kodova)
npm run test:e2e         # Playwright nad lažnim Supabase-om: telefon 390 px, platno 1920×1080,
                         # admin (prijave, moderacija, CSV, reset), izvor stand
E2E_BASE_URL=https://stemklub.github.io/ConnectEd/ npm run test:e2e
                         # isto nad objavljenom aplikacijom i pravim Supabase-om (RESETUJE demo!)
```

**Load test** (pravi Supabase; na početku i na kraju resetuje demo):
```bash
SUPABASE_URL=https://<projekat>.supabase.co SUPABASE_ANON_KEY=<publishable ključ> npm run load-test
```
100 klijenata istovremeno: anonimna prijava → kod → nik → oznake → poziv → prihvati. Prolazi ako nema grešaka i ako je p95 vremena do poziva (odgovor na „Gotovo“) ispod 3 s. Opcije: `N`, `RAMP_MS`, `RESET`, `P95_LIMIT_MS`, `MENTOR_NICK`, `MENTOR_PASS`. Ako padne na `signInAnonymously` sa „rate limit“, podignite granicu iz koraka 2.

## Prilagođavanje
- **Oznake:** `src/config/demo.ts` **i** `private.load_seed()` u `supabase/setup.sql` (test pada ako se razlikuju). Zatim `npm run gen:upgrade`.
- **Projekti:** `private.load_seed()` u `setup.sql`. Svaka oznaka treba bar jedan otvoren projekat; `join_text` dopunjuje „Trebaš nam u …“.
- **Broj kodova:** dugme „Dodaj kodove“ u adminu (300 na početku).

Licenca: MIT
