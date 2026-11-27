-- ═════════════════════════════════════════════════════════════
--  ConnectEd v2 · čista instalacija
--  Supabase → SQL Editor → zalijepite CIJELI fajl → Run.
--  Postojeća v1 baza: pokrenite nadogradnja-v1-v2.sql (ne ovaj fajl).
--
--  Pravila:
--   • RLS je uključen na SVIM tabelama. Klijent ne čita tabele direktno
--     (osim public.demo_events, za zid platna i Realtime).
--   • Sve izmjene idu kroz RPC funkcije (security definer) koje provjeravaju prava.
--   • Spajanje radi na serveru: poklapanje oznaka + skrivena prednost za one bez tima.
-- ═════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public;

-- ── Tabele ───────────────────────────────────────────────────

create table public.demo_settings (
  id                 int primary key default 1 check (id = 1),
  registrations_open boolean not null default true,
  reset_at           timestamptz not null default now()
);

-- Oznake: iste kao src/config/demo.ts (test provjerava).
create table public.tags (
  slug  text primary key,
  label text not null,
  icon  text not null,
  sort  int  not null
);

-- Profil: samo nik iz ponuđenog skupa, uloga i izvor prijave. Bez imena i emaila.
create table public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete cascade,
  nick       text unique,
  role       text not null default 'student' check (role in ('student', 'mentor')),
  source     text check (source in ('stand', 'finale')),
  created_at timestamptz not null default now()
);

-- Kodovi: svaki nalog dobija jedan (claim_demo_code). Kodom se nalog nastavlja na drugom uređaju.
create table public.demo_codes (
  code    text primary key,
  used_at timestamptz,
  used_by uuid unique references public.profiles (id) on delete set null
);
create index demo_codes_free on public.demo_codes (code) where used_at is null;

create table public.profile_tags (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag        text not null references public.tags (slug),
  primary key (profile_id, tag)
);
create index on public.profile_tags (tag);

-- Projekti: naslov, jedna rečenica, rok, jedna oznaka. Mjesta su neograničena.
-- join_text dopunjuje „Trebaš nam u …“ / „… se pridružuje …“ (npr. „robotičkom timu“).
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 60),
  sentence    text not null check (char_length(sentence) between 3 and 140),
  deadline    date,
  tag         text references public.tags (slug),
  join_text   text not null check (char_length(join_text) between 3 and 80),
  status      text not null default 'pending' check (status in ('pending', 'open', 'rejected')),
  is_fallback boolean not null default false,
  is_seed     boolean not null default false,
  proposed_by uuid references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);
create index on public.projects (status, tag);

create table public.memberships (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index on public.memberships (profile_id);

-- Poziv: razlog je oznaka (null = rezervni poziv). Bez skora.
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  reason_tag   text references public.tags (slug),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (project_id, profile_id)
);
create index on public.invites (profile_id, status);

-- Zid platna: samo nik i tekst. Javno čitljivo (Realtime za platno i admin).
create table public.demo_events (
  id         bigint generated always as identity primary key,
  nick       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

-- Mentor tima (ime nastavnika, upisuje admin). Odvojeno od projects da bi ostalo i poslije reseta.
create table if not exists public.team_mentors (
  project_id uuid primary key,
  mentor     text not null check (char_length(mentor) between 2 and 60)
);
alter table public.team_mentors enable row level security;
revoke all on public.team_mentors from anon, authenticated;

-- Neuspjeli pokušaji „Imam kod“ (zaštita od pogađanja).
create table private.code_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index on private.code_attempts (user_id, at);

-- ── RLS: uključen svuda; čitanje dozvoljeno samo za zid platna ──

alter table public.demo_settings enable row level security;
alter table public.tags          enable row level security;
alter table public.profiles      enable row level security;
alter table public.demo_codes    enable row level security;
alter table public.profile_tags  enable row level security;
alter table public.projects      enable row level security;
alter table public.memberships   enable row level security;
alter table public.invites       enable row level security;
alter table public.demo_events   enable row level security;

revoke all on public.demo_settings, public.tags, public.profiles, public.demo_codes, public.profile_tags,
  public.projects, public.memberships, public.invites, public.demo_events from anon, authenticated;
grant select on public.demo_events to anon, authenticated;
create policy "zid platna je javan" on public.demo_events for select to anon, authenticated using (true);

-- Realtime: samo zid (platno i admin; telefoni ne otvaraju websocket).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.demo_events;

-- ── Pomoćne funkcije (šema private, nije izložena API-ju) ─────

-- Nikovi: kratke riječi kao u Kahootu (Komet, Laser, Turbo). Kad se potroše: Komet2 … Komet9.
create or replace function private.nick_pool()
returns table (nick text) language sql immutable set search_path = '' as $$
  select w from (values
    ('Atom'), ('Bajt'), ('Kvark'), ('Laser'), ('Radar'), ('Sonar'), ('Turbo'), ('Neon'), ('Komet'),
    ('Orbit'), ('Raketa'), ('Nova'), ('Kosmos'), ('Foton'), ('Proton'), ('Neutron'), ('Magnet'), ('Volt'),
    ('Ion'), ('Robot'), ('Dron'), ('Modem'), ('Senzor'), ('Alfa'), ('Beta'), ('Gama'), ('Delta'), ('Sigma'),
    ('Omega'), ('Lambda'), ('Munja'), ('Grom'), ('Vulkan'), ('Tornado'), ('Kristal'), ('Meteor'), ('Zmaj'),
    ('Feniks'), ('Titan'), ('Lava'), ('Plazma'), ('Fuzija'), ('Kvazar'), ('Pulsar'), ('Spektar'), ('Vektor'),
    ('Prizma'), ('Kompas'), ('Piksel'), ('Kursor'), ('Klik'), ('Turbina'), ('Motor'), ('Jupiter'), ('Mars'),
    ('Saturn'), ('Venera'), ('Merkur'), ('Pluton'), ('Luna'), ('Sirius'), ('Vega'), ('Orion'), ('Zenit'),
    ('Polaris'), ('Aurora'), ('Eho'), ('Kobalt'), ('Argon'), ('Helij'), ('Radon'), ('Ksenon'), ('Litij'),
    ('Cink'), ('Bakar'), ('Nikl'), ('Gejzir'), ('Lavina'), ('Oluja'), ('Vihor'), ('Ciklon'), ('Talas'),
    ('Blic'), ('Zoom'), ('Bum'), ('Fleš'), ('Hiper'), ('Mega'), ('Giga'), ('Tera'), ('Nano'), ('Mikro'),
    ('Robo'), ('Kiber'), ('Disk'), ('Čip'), ('Kod'), ('Bit')
  ) v(w)
$$;

-- Dozvoljen nik: iz skupa, ili iz skupa + jedna cifra 2–9 (kad se osnovni skup potroši).
create or replace function private.is_pool_nick(n text)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from private.nick_pool() p where p.nick = regexp_replace(n, '[2-9]$', ''))
$$;

create or replace function private.fail(msg text, code text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using message = msg, hint = 'ce:' || code;
end $$;

-- Profil prijavljenog korisnika (ili greška).
create or replace function private.me()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then perform private.fail('Nema sesije. Osvježi stranicu.', 'no_session'); end if;
  select * into p from public.profiles where user_id = auth.uid();
  if not found then perform private.fail('Nalog više ne postoji. Osvježi stranicu.', 'no_profile'); end if;
  return p;
end $$;

create or replace function private.me_student()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := private.me();
begin
  if p.role <> 'student' then perform private.fail('Ovo je za učesnike. Mentor koristi /admin.', 'not_student'); end if;
  if p.nick is null then perform private.fail('Prvo izaberi ime.', 'no_nick'); end if;
  return p;
end $$;

create or replace function private.require_mentor()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := private.me();
begin
  if p.role <> 'mentor' then perform private.fail('Samo za mentore.', 'not_mentor'); end if;
  return p;
end $$;

create or replace function private.me_json(p public.profiles)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', p.id,
    'nick', p.nick,
    'role', p.role,
    'code', (select c.code from public.demo_codes c where c.used_by = p.id),
    'tags', coalesce((select json_agg(t.tag order by g.sort) from public.profile_tags t join public.tags g on g.slug = t.tag where t.profile_id = p.id), '[]'::json)
  )
$$;

create or replace function private.project_json(pr public.projects, viewer uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', pr.id,
    'title', pr.title,
    'sentence', pr.sentence,
    'deadline', pr.deadline,
    'tag', pr.tag,
    'join_text', pr.join_text,
    'status', pr.status,
    'is_fallback', pr.is_fallback,
    'member_count', (select count(*) from public.memberships m where m.project_id = pr.id),
    'members', coalesce((
      select json_agg(x.nick) from (
        select p.nick from public.memberships m join public.profiles p on p.id = m.profile_id
        where m.project_id = pr.id order by m.joined_at desc limit 12
      ) x), '[]'::json),
    'is_member', exists (select 1 from public.memberships m where m.project_id = pr.id and m.profile_id = viewer),
    'mentor', (select t.mentor from public.team_mentors t where t.project_id = pr.id)
  )
$$;

create or replace function private.invite_json(i public.invites)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', i.id,
    'reason_tag', i.reason_tag,
    'status', i.status,
    'project', private.project_json(pr, i.profile_id)
  ) from public.projects pr where pr.id = i.project_id
$$;

create or replace function private.add_event(p_nick text, p_text text)
returns void language sql security definer set search_path = '' as $$
  insert into public.demo_events (nick, text) values (p_nick, p_text);
$$;

-- Ulazak u tim (mjesta su neograničena). Vraća true ako je učesnik upravo ušao.
create or replace function private.join_internal(p public.profiles, p_project uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare pr public.projects; n int;
begin
  select * into pr from public.projects where id = p_project;
  if not found or pr.status <> 'open' then perform private.fail('Ovaj tim trenutno ne prima nove članove.', 'closed'); end if;
  insert into public.memberships (project_id, profile_id) values (pr.id, p.id) on conflict do nothing;
  get diagnostics n = row_count;
  update public.invites set status = 'accepted', responded_at = now()
    where project_id = pr.id and profile_id = p.id and status = 'pending';
  if n > 0 then perform private.add_event(p.nick, 'se pridružuje ' || pr.join_text); end if;
  return n > 0;
end $$;

-- ── Spajanje ─────────────────────────────────────────────────
-- Za jednog učesnika (poziva se iz save_interests, u istom odgovoru):
--  1. otvoren projekat čija oznaka je među učesnikovim oznakama, u kom nije i za koji nije pozvan;
--     prednost ima tim sa manje članova (ravnomjerno punjenje), pa stariji projekat;
--  2. inače već postojeći poziv na čekanju;
--  3. inače, samo ako učesnik nije ni u jednom timu: rezervni poziv „STEM klub traži ljude sa idejama“.
create or replace function private.match_invite(p_profile uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare pr public.projects; i public.invites;
begin
  select x.* into pr from public.projects x
  where x.status = 'open' and not x.is_fallback
    and x.tag in (select t.tag from public.profile_tags t where t.profile_id = p_profile)
    and not exists (select 1 from public.memberships m where m.project_id = x.id and m.profile_id = p_profile)
    and not exists (select 1 from public.invites v where v.project_id = x.id and v.profile_id = p_profile)
  order by (select count(*) from public.memberships m where m.project_id = x.id), x.created_at, x.id
  limit 1;

  if found then
    insert into public.invites (project_id, profile_id, reason_tag) values (pr.id, p_profile, pr.tag)
      on conflict (project_id, profile_id) do nothing;
  else
    select v.* into i from public.invites v join public.projects x on x.id = v.project_id
      where v.profile_id = p_profile and v.status = 'pending' and x.status = 'open'
      order by v.created_at desc limit 1;
    if found then return private.invite_json(i); end if;

    if exists (select 1 from public.memberships m where m.profile_id = p_profile) then return null; end if;
    select x.* into pr from public.projects x
      where x.status = 'open' and x.is_fallback
        and not exists (select 1 from public.invites v where v.project_id = x.id and v.profile_id = p_profile)
      order by x.created_at limit 1;
    if not found then return null; end if;
    insert into public.invites (project_id, profile_id, reason_tag) values (pr.id, p_profile, null)
      on conflict (project_id, profile_id) do nothing;
  end if;

  select v.* into i from public.invites v where v.project_id = pr.id and v.profile_id = p_profile;
  if i.status <> 'pending' then return null; end if;
  return private.invite_json(i);
end $$;

-- Za novi (odobren) projekat: poziva učesnike sa tom oznakom koji nemaju poziv na čekanju.
-- Skrivena prednost: prvo oni koji nisu ni u jednom timu.
create or replace function private.fan_out(p_project uuid, p_limit int default 20)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.invites (project_id, profile_id, reason_tag)
  select pr.id, p.id, pr.tag
  from public.projects pr
  join public.profile_tags t on t.tag = pr.tag
  join public.profiles p on p.id = t.profile_id and p.role = 'student' and p.nick is not null
  where pr.id = p_project and pr.status = 'open'
    and not exists (select 1 from public.memberships m where m.project_id = pr.id and m.profile_id = p.id)
    and not exists (select 1 from public.invites v where v.profile_id = p.id and (v.project_id = pr.id or v.status = 'pending'))
  order by exists (select 1 from public.memberships m where m.profile_id = p.id), p.created_at
  limit p_limit
  on conflict (project_id, profile_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Seed ─────────────────────────────────────────────────────

create or replace function private.load_seed()
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tags (slug, label, icon, sort) values
    ('robotika', 'Robotika', '🤖', 1),
    ('programiranje', 'Programiranje', '💻', 2),
    ('dizajn', 'Dizajn i crtanje', '🎨', 3),
    ('video', 'Foto i video', '📸', 4),
    ('nauka', 'Nauka i eksperimenti', '🔬', 5),
    ('ekologija', 'Ekologija', '🌱', 6),
    ('muzika', 'Muzika', '🎵', 7),
    ('ideje', 'Ideje i preduzetništvo', '💡', 8)
  on conflict (slug) do update set label = excluded.label, icon = excluded.icon, sort = excluded.sort;

  insert into public.projects (id, title, sentence, deadline, tag, join_text, status, is_fallback, is_seed, approved_at) values
    ('a0000000-0000-4000-8000-000000000001', 'Robot koji sortira otpad', 'Pravimo malog robota koji prepoznaje plastiku i papir.', current_date + 30, 'robotika', 'robotičkom timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000002', 'Aplikacija za STEM klub', 'Pravimo aplikaciju sa rasporedom radionica i prijavama.', current_date + 35, 'programiranje', 'timu koji pravi aplikaciju', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000003', 'Plakat i logo za STEM sajam', 'Smišljamo izgled sajma: plakat, logo i bedževe.', current_date + 20, 'dizajn', 'dizajnerskom timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000004', 'STEM klub u 60 sekundi', 'Snimamo kratak video o tome šta radimo u klubu.', current_date + 21, 'video', 'video timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000005', 'Eksperimenti za Dan nauke', 'Pripremamo pet eksperimenata koje publika može probati.', current_date + 28, 'nauka', 'naučnom timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000006', 'Senzor kvaliteta vazduha', 'Mjerimo vazduh u školi i pokazujemo podatke na ekranu.', current_date + 40, 'ekologija', 'eko timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000007', 'Muzika za školsku igricu', 'Pravimo zvukove i kratku melodiju za igricu kluba.', current_date + 30, 'muzika', 'muzičkom timu', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-000000000008', 'Ideja koja rješava problem', 'Biramo jedan školski problem i smišljamo rješenje za njega.', current_date + 25, 'ideje', 'timu za ideje', 'open', false, true, now()),
    ('a0000000-0000-4000-8000-0000000000ff', 'STEM klub traži ljude sa idejama', 'Dođi na prvi sastanak i reci šta bi volio/voljela da napravimo.', current_date + 14, null, 'STEM klubu', 'open', true, true, now())
  on conflict (id) do nothing;
end $$;

-- Novi slučajni kodovi (5 znakova, bez sličnih slova i cifara: 0/O, 1/I/L, 5/S, 8/B).
create or replace function private.gen_codes(p_n int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
  made int := 0; tries int := 0; c text; n int;
begin
  while made < p_n and tries < p_n * 20 loop
    tries := tries + 1;
    c := '';
    for k in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    insert into public.demo_codes (code) values (c) on conflict do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  return made;
end $$;

-- Mentorski nalog: korisnik <nik>@connected.test mora postojati u auth.users
-- (Authentication → Users → Add user, sa „Auto Confirm User“).
create or replace function private.make_mentor(p_nick text, p_domain text default 'connected.test')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid; pid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_nick || '@' || p_domain);
  if uid is null then raise exception 'Nema korisnika %@% u auth.users', p_nick, p_domain; end if;
  insert into public.profiles (user_id, nick, role) values (uid, p_nick, 'mentor')
    on conflict (user_id) do update set role = 'mentor', nick = excluded.nick
    returning id into pid;
  return pid;
end $$;

-- ── RPC: učesnik ─────────────────────────────────────────────

-- Novi nalog bez kucanja: anonimna sesija (signInAnonymously) + jedan kod iz bazena.
-- Atomski: zaključava jedan slobodan kod (skip locked), pa 100 telefona istovremeno ne dobija isti kod.
create or replace function public.claim_demo_code(p_izvor text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare p public.profiles; c text;
begin
  if auth.uid() is null then perform private.fail('Nema sesije. Osvježi stranicu.', 'no_session'); end if;
  select * into p from public.profiles where user_id = auth.uid();
  if found then return private.me_json(p); end if;
  if not exists (select 1 from auth.users where id = auth.uid()) then
    perform private.fail('Sesija je istekla. Osvježi stranicu.', 'stale');
  end if;
  if not (select s.registrations_open from public.demo_settings s where s.id = 1) then
    perform private.fail('Prijave su trenutno zatvorene. Pitaj mentora.', 'closed');
  end if;

  select d.code into c from public.demo_codes d where d.used_at is null order by d.code limit 1 for update skip locked;
  if c is null then perform private.fail('Sva mjesta su popunjena. Pitaj mentora.', 'no_codes'); end if;

  begin
    insert into public.profiles (user_id, role, source)
      values (auth.uid(), 'student', case when p_izvor = 'stand' then 'stand' else 'finale' end)
      returning * into p;
  exception when unique_violation then
    -- isti korisnik je istovremeno poslao dva zahtjeva
    select * into p from public.profiles where user_id = auth.uid();
    return private.me_json(p);
  end;
  update public.demo_codes set used_at = now(), used_by = p.id where code = c;
  return private.me_json(p);
end $$;

create or replace function public.get_me()
returns json language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where user_id = auth.uid();
  if not found then return null; end if;
  return private.me_json(p);
end $$;

-- „Imam kod“: nastavi nalog sa drugog uređaja. Nalog sa ovog uređaja (ako postoji) se briše.
create or replace function public.redeem_code(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare norm text; target public.profiles; cur public.profiles;
begin
  if auth.uid() is null then perform private.fail('Nema sesije. Osvježi stranicu.', 'no_session'); end if;
  if (select count(*) from private.code_attempts a where a.user_id = auth.uid() and a.at > now() - interval '10 minutes') >= 10 then
    perform private.fail('Previše pokušaja. Sačekaj nekoliko minuta.', 'too_many');
  end if;
  norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select p.* into target from public.demo_codes d join public.profiles p on p.id = d.used_by
    where d.code = norm and p.role = 'student'
    for update of p;
  if not found then
    insert into private.code_attempts (user_id) values (auth.uid());
    -- greška ne smije poništiti upis pokušaja, pa vraćamo grešku kao rezultat
    return json_build_object('error', 'Taj kod ne postoji. Provjeri slova.');
  end if;
  if target.user_id = auth.uid() then return private.me_json(target); end if;

  select * into cur from public.profiles where user_id = auth.uid();
  if found then
    if cur.role <> 'student' then perform private.fail('Mentorski nalog ne može preuzeti kod.', 'not_student'); end if;
    update public.demo_codes set used_at = null, used_by = null where used_by = cur.id;
    delete from public.profiles where id = cur.id;
  end if;
  update public.profiles set user_id = auth.uid() where id = target.id returning * into target;
  return private.me_json(target);
end $$;

create or replace function public.suggest_nicks()
returns json language sql volatile security definer set search_path = '' as $$
  with free as (
    select n.nick, 0 as tier from private.nick_pool() n
    where not exists (select 1 from public.profiles p where p.nick = n.nick)
    union all
    select n.nick || s, s from private.nick_pool() n cross join generate_series(2, 9) s
    where not exists (select 1 from public.profiles p where p.nick = n.nick || s)
  ), pick as (
    select f.nick from free f order by f.tier, random() limit 6
  )
  select coalesce(json_agg(nick), '[]'::json) from pick
$$;

create or replace function public.set_nick(p_nick text)
returns json language plpgsql security definer set search_path = '' as $$
declare p public.profiles := private.me(); old text;
begin
  if p.role <> 'student' then perform private.fail('Mentor ne mijenja nik ovdje.', 'not_student'); end if;
  if p_nick is null or not private.is_pool_nick(p_nick) then
    perform private.fail('Izaberi jedno od ponuđenih imena.', 'bad_nick');
  end if;
  if p.nick = p_nick then return private.me_json(p); end if;
  old := p.nick;
  begin
    update public.profiles set nick = p_nick where id = p.id returning * into p;
  exception when unique_violation then
    perform private.fail('To ime je upravo neko uzeo. Izaberi drugo.', 'taken');
  end;
  if old is null then perform private.add_event(p.nick, 'je tu 👋'); end if;
  return private.me_json(p);
end $$;

-- Čuva 1–4 oznake i u istom odgovoru vraća poziv (pouzdano: ne zavisi od Realtime-a).
create or replace function public.save_interests(p_tags text[])
returns json language plpgsql security definer set search_path = '' as $$
declare p public.profiles := private.me_student(); clean text[];
begin
  select coalesce(array_agg(distinct t), '{}') into clean from unnest(coalesce(p_tags, '{}')) t;
  if cardinality(clean) < 1 or cardinality(clean) > 4 then
    perform private.fail('Izaberi od 1 do 4 interesovanja.', 'bad_tags');
  end if;
  if exists (select 1 from unnest(clean) t where t not in (select slug from public.tags)) then
    perform private.fail('Nepoznato interesovanje.', 'bad_tags');
  end if;
  delete from public.profile_tags where profile_id = p.id;
  insert into public.profile_tags (profile_id, tag) select p.id, t from unnest(clean) t;
  return json_build_object('me', private.me_json(p), 'invite', private.match_invite(p.id));
end $$;

create or replace function public.respond_invite(p_invite uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare p public.profiles := private.me_student(); i public.invites;
begin
  select * into i from public.invites where id = p_invite and profile_id = p.id for update;
  if not found then perform private.fail('Poziv nije pronađen.', 'not_found'); end if;
  if i.status = 'pending' then
    if p_accept then
      perform private.join_internal(p, i.project_id);
    else
      update public.invites set status = 'declined', responded_at = now() where id = i.id;
    end if;
    select * into i from public.invites where id = p_invite;
  end if;
  return json_build_object('status', i.status, 'project_id', i.project_id);
end $$;

create or replace function public.join_project(p_project uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare p public.profiles := private.me_student();
begin
  return json_build_object('status', case when private.join_internal(p, p_project) then 'joined' else 'already' end);
end $$;

-- „Za tebe“: poziv na čekanju + otvoreni timovi po mojim oznakama + ostali.
create or replace function public.get_for_you()
returns json language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := private.me_student(); inv public.invites;
begin
  select v.* into inv from public.invites v join public.projects x on x.id = v.project_id
    where v.profile_id = p.id and v.status = 'pending' and x.status = 'open'
    order by v.created_at desc limit 1;
  return json_build_object(
    'invite', case when inv.id is null then null else private.invite_json(inv) end,
    'matches', coalesce((
      select json_agg(private.project_json(x, p.id) order by g.sort, x.created_at)
      from public.projects x join public.tags g on g.slug = x.tag
      where x.status = 'open' and x.tag in (select t.tag from public.profile_tags t where t.profile_id = p.id)
    ), '[]'::json),
    'others', coalesce((
      select json_agg(private.project_json(x, p.id) order by x.is_fallback desc, x.created_at)
      from public.projects x
      where x.status = 'open' and (x.tag is null or x.tag not in (select t.tag from public.profile_tags t where t.profile_id = p.id))
    ), '[]'::json)
  );
end $$;

create or replace function public.get_my_teams()
returns json language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := private.me_student();
begin
  return json_build_object(
    'teams', coalesce((
      select json_agg(private.project_json(x, p.id) order by m.joined_at desc)
      from public.memberships m join public.projects x on x.id = m.project_id where m.profile_id = p.id
    ), '[]'::json),
    'proposals', coalesce((
      select json_agg(json_build_object('id', x.id, 'title', x.title, 'sentence', x.sentence, 'tag', x.tag, 'status', x.status) order by x.created_at desc)
      from public.projects x where x.proposed_by = p.id and x.status <> 'open'
    ), '[]'::json)
  );
end $$;

-- Pregled tima: svi članovi (nikovi), redom kako su ulazili. Za otvorene timove i za članove.
create or replace function public.get_team(p_project uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles := private.me_student(); pr public.projects;
begin
  select * into pr from public.projects x
    where x.id = p_project
      and (x.status = 'open' or x.proposed_by = p.id
           or exists (select 1 from public.memberships m where m.project_id = x.id and m.profile_id = p.id));
  if not found then perform private.fail('Tim nije pronađen.', 'not_found'); end if;
  return json_build_object(
    'project', private.project_json(pr, p.id),
    'members', coalesce((
      select json_agg(json_build_object('nick', q.nick, 'me', q.id = p.id) order by m.joined_at)
      from public.memberships m join public.profiles q on q.id = m.profile_id where m.project_id = pr.id
    ), '[]'::json)
  );
end $$;

-- Predlog projekta (sekundarno). Ide mentoru na odobrenje.
create or replace function public.propose_project(p_title text, p_sentence text, p_tag text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles := private.me_student(); new_id uuid; t text := btrim(coalesce(p_title, '')); s text := btrim(coalesce(p_sentence, ''));
begin
  if char_length(t) not between 3 and 60 then perform private.fail('Naslov treba da ima 3–60 znakova.', 'bad_title'); end if;
  if char_length(s) not between 3 and 140 then perform private.fail('Opiši ideju u jednoj rečenici (do 140 znakova).', 'bad_sentence'); end if;
  if p_tag is null or not exists (select 1 from public.tags where slug = p_tag) then perform private.fail('Izaberi oznaku.', 'bad_tags'); end if;
  if (select count(*) from public.projects x where x.proposed_by = p.id and x.status = 'pending') >= 2 then
    perform private.fail('Već imaš dva predloga koja čekaju mentora.', 'too_many');
  end if;
  insert into public.projects (title, sentence, tag, join_text, status, proposed_by, deadline)
    values (t, s, p_tag, 'timu „' || t || '“', 'pending', p.id, current_date + 30)
    returning projects.id into new_id;
  perform private.add_event(p.nick, 'predlaže novi projekat 💡');
  return new_id;
end $$;

-- ── RPC: platno (javno, bez prijave) ─────────────────────────
-- Samo zbirni brojevi + nikovi na zidu.
create or replace function public.get_screen()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'registrations_open', (select s.registrations_open from public.demo_settings s where s.id = 1),
    'people', (select count(*) from public.profiles p where p.role = 'student' and p.nick is not null),
    'joined', (select count(distinct m.profile_id) from public.memberships m),
    'teams', coalesce((
      select json_agg(json_build_object('id', x.id, 'title', x.title, 'tag', x.tag, 'is_fallback', x.is_fallback,
                                        'members', (select count(*) from public.memberships m where m.project_id = x.id))
                      order by x.is_fallback, (select count(*) from public.memberships m where m.project_id = x.id) desc, x.created_at)
      from public.projects x where x.status = 'open'
    ), '[]'::json),
    'wall', coalesce((
      select json_agg(json_build_object('id', e.id, 'nick', e.nick, 'text', e.text, 'at', e.created_at) order by e.id desc)
      from (select * from public.demo_events order by id desc limit 40) e
    ), '[]'::json)
  )
$$;

-- ── RPC: admin (mentor) ──────────────────────────────────────

create or replace function public.get_admin()
returns json language plpgsql stable security definer set search_path = '' as $$
declare m public.profiles := private.require_mentor();
begin
  return json_build_object(
    'nick', m.nick,
    'registrations_open', (select s.registrations_open from public.demo_settings s where s.id = 1),
    'reset_at', (select s.reset_at from public.demo_settings s where s.id = 1),
    'codes_free', (select count(*) from public.demo_codes where used_at is null),
    'codes_used', (select count(*) from public.demo_codes where used_at is not null),
    'proposals', coalesce((
      select json_agg(json_build_object('id', x.id, 'title', x.title, 'sentence', x.sentence, 'tag', x.tag,
                                        'nick', (select p.nick from public.profiles p where p.id = x.proposed_by), 'created_at', x.created_at)
                      order by x.created_at)
      from public.projects x where x.status = 'pending'
    ), '[]'::json),
    'teams', coalesce((
      select json_agg(json_build_object('id', x.id, 'title', x.title, 'tag', x.tag, 'is_fallback', x.is_fallback,
                                        'mentor', (select t.mentor from public.team_mentors t where t.project_id = x.id),
                                        'members', (select count(*) from public.memberships mm where mm.project_id = x.id))
                      order by x.is_fallback, x.created_at, x.title)
      from public.projects x where x.status = 'open'
    ), '[]'::json),
    'screen', public.get_screen()
  );
end $$;

create or replace function public.set_registrations(p_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_mentor();
  update public.demo_settings set registrations_open = p_open where id = 1;
end $$;

create or replace function public.approve_project(p_project uuid, p_approve boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare pr public.projects; author public.profiles; invited int := 0;
begin
  perform private.require_mentor();
  select * into pr from public.projects where id = p_project and status = 'pending' for update;
  if not found then perform private.fail('Predlog nije pronađen ili je već obrađen.', 'not_found'); end if;
  if not p_approve then
    update public.projects set status = 'rejected' where id = pr.id;
    return json_build_object('status', 'rejected');
  end if;
  update public.projects set status = 'open', approved_at = now() where id = pr.id;
  select * into author from public.profiles where id = pr.proposed_by;
  if found and author.nick is not null then
    insert into public.memberships (project_id, profile_id) values (pr.id, author.id) on conflict do nothing;
    perform private.add_event(author.nick, 'pokreće projekat „' || pr.title || '“ 🚀');
  end if;
  invited := private.fan_out(pr.id);
  return json_build_object('status', 'open', 'invited', invited);
end $$;

create or replace function public.set_team_mentor(p_project uuid, p_mentor text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := nullif(btrim(coalesce(p_mentor, '')), '');
begin
  perform private.require_mentor();
  if not exists (select 1 from public.projects where id = p_project) then perform private.fail('Tim nije pronađen.', 'not_found'); end if;
  if v is null then
    delete from public.team_mentors where project_id = p_project;
  elsif char_length(v) > 60 then
    perform private.fail('Ime mentora može imati najviše 60 znakova.', 'bad_mentor');
  else
    insert into public.team_mentors (project_id, mentor) values (p_project, v)
      on conflict (project_id) do update set mentor = excluded.mentor;
  end if;
end $$;

-- Vraća demo na početak u JEDNOJ transakciji: brišu se svi učesnici (i njihovi anonimni nalozi),
-- predlozi, članstva, pozivi i zid; kodovi se oslobađaju; seed projekti se vraćaju. Mentori ostaju.
create or replace function public.reset_demo()
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_mentor();
  delete from auth.users u
    where not exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'mentor');
  delete from public.profiles where role = 'student';
  delete from public.projects where true;
  delete from public.demo_events where true;
  delete from private.code_attempts where true;
  update public.demo_codes set used_at = null, used_by = null where used_at is not null or used_by is not null;
  perform private.load_seed();
  -- mentori seed timova ostaju; mentori obrisanih (predloženih) timova se brišu
  delete from public.team_mentors t where not exists (select 1 from public.projects x where x.id = t.project_id);
  update public.demo_settings set registrations_open = true, reset_at = now() where id = 1;
  return json_build_object(
    'projects', (select count(*) from public.projects),
    'codes_free', (select count(*) from public.demo_codes where used_at is null)
  );
end $$;

create or replace function public.generate_codes(p_n int)
returns json language plpgsql security definer set search_path = '' as $$
declare made int;
begin
  perform private.require_mentor();
  if p_n is null or p_n < 1 or p_n > 1000 then perform private.fail('Broj kodova: 1–1000.', 'bad_n'); end if;
  made := private.gen_codes(p_n);
  return json_build_object('made', made, 'codes_free', (select count(*) from public.demo_codes where used_at is null));
end $$;

-- CSV za štand: broj prijava i broj pridruživanja po izvoru. Bez nikova.
create or replace function public.export_stand_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mentor();
  return (
    select json_agg(json_build_object(
      'izvor', s.izvor,
      'prijave', (select count(*) from public.profiles p where p.role = 'student' and p.source = s.izvor),
      'pridruzivanja', (select count(*) from public.memberships m join public.profiles p on p.id = m.profile_id
                        where p.role = 'student' and p.source = s.izvor)
    ) order by s.ord)
    from (values ('stand', 1), ('finale', 2)) s(izvor, ord)
  );
end $$;

-- ── Prava na funkcije ────────────────────────────────────────

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.claim_demo_code(text), public.get_me(), public.redeem_code(text), public.suggest_nicks(),
  public.set_nick(text), public.save_interests(text[]), public.respond_invite(uuid, boolean),
  public.join_project(uuid), public.get_for_you(), public.get_my_teams(), public.get_team(uuid),
  public.propose_project(text, text, text), public.get_admin(), public.set_registrations(boolean),
  public.approve_project(uuid, boolean), public.set_team_mentor(uuid, text), public.reset_demo(), public.generate_codes(int),
  public.export_stand_stats()
to authenticated;
grant execute on function public.get_screen() to anon, authenticated;

-- ── Početni podaci ───────────────────────────────────────────

insert into public.demo_settings (id) values (1) on conflict do nothing;
select private.load_seed();
select private.gen_codes(300);

-- Mentorski nalog prof.e2e (ako korisnik prof.e2e@connected.test već postoji u auth.users).
do $$
begin
  if exists (select 1 from auth.users where lower(email) = 'prof.e2e@connected.test') then
    perform private.make_mentor('prof.e2e');
  end if;
end $$;
