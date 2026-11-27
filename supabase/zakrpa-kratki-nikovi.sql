-- ConnectEd · zakrpa: kratki nikovi kao u Kahootu (Komet, Laser, Turbo; zatim Komet2 … Komet9)
-- Za bazu koja je već na v2. Supabase → SQL Editor → cijeli fajl → Run. Može se pokrenuti više puta.
-- Postojeći učesnici zadržavaju stara imena dok se ne uradi „Resetuj demo“.

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
