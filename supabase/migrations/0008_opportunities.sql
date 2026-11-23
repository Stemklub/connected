-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0008 · Prilike van škole
--  Takmičenja, hakatoni, radionice, predavanja, konkursi, volontiranje.
--  „Za tebe“ = oblast prilike se poklapa sa oznakama učenika.
--  „Zanima me — prijavi me“ vidi samo učenik; niko ne dobija spisak.
--  „Ko ide sa mnom? Napravi tim“ pravi običan projekat vezan za priliku
--  (ide mentoru na odobrenje i dalje kroz isto spajanje).
-- ═════════════════════════════════════════════════════════════

create type public.opportunity_kind as enum
  ('takmicenje', 'hakaton', 'radionica', 'predavanje', 'konkurs', 'volontiranje');

create table public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 3 and 100),
  kind            public.opportunity_kind not null,
  organizer       text not null check (char_length(organizer) between 1 and 100),
  deadline        date,
  place           text not null default '' check (char_length(place) <= 100),
  audience        text not null default '' check (char_length(audience) <= 120),
  description     text not null default '' check (char_length(description) <= 800),
  posted_by       uuid references public.profiles (id) on delete set null,
  posted_by_label text not null default '',
  created_at      timestamptz not null default now()
);
create index on public.opportunities (deadline);

create table public.opportunity_tags (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  tag            text not null references public.tags (slug),
  primary key (opportunity_id, tag)
);

create table public.opportunity_interest (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (opportunity_id, profile_id)
);
create index on public.opportunity_interest (profile_id);

alter table public.projects      add column opportunity_id uuid references public.opportunities (id) on delete set null;
alter table public.notifications add column opportunity_id uuid references public.opportunities (id) on delete cascade;

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.opportunities        enable row level security;
alter table public.opportunity_tags     enable row level security;
alter table public.opportunity_interest enable row level security;
revoke insert, update, delete, truncate on public.opportunities, public.opportunity_tags, public.opportunity_interest from anon, authenticated;
revoke select on public.opportunities, public.opportunity_tags, public.opportunity_interest from anon;

create policy opportunities_read on public.opportunities for select to authenticated using (true);
create policy opportunity_tags_read on public.opportunity_tags for select to authenticated using (true);
-- „Prijavljen/a“ vidi samo učenik sam.
create policy opportunity_interest_own on public.opportunity_interest for select to authenticated
  using (profile_id = private.my_profile_id());

-- ─── JSON ────────────────────────────────────────────────────
create or replace function private.opportunity_json(p_id uuid, p_me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'title', o.title, 'kind', o.kind, 'organizer', o.organizer, 'deadline', o.deadline,
    'place', o.place, 'audience', o.audience, 'description', o.description,
    'posted_by', coalesce((select u.nick from public.profiles u where u.id = o.posted_by), nullif(o.posted_by_label, ''), 'Škola'),
    'created_at', o.created_at,
    'tags', coalesce((select jsonb_agg(x.tag order by t.sort) from public.opportunity_tags x
                      join public.tags t on t.slug = x.tag where x.opportunity_id = o.id), '[]'::jsonb),
    'for_me', exists (select 1 from public.opportunity_tags x join public.profile_tags pt on pt.tag = x.tag
                      where x.opportunity_id = o.id and pt.profile_id = p_me),
    'interested', exists (select 1 from public.opportunity_interest i where i.opportunity_id = o.id and i.profile_id = p_me),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'icon', p.icon,
                                                           'free', private.free_spots(p.id), 'leader_nick', l.nick,
                                                           'is_member', exists (select 1 from public.group_members m
                                                             where m.project_id = p.id and m.profile_id = p_me and m.left_at is null))
                                        order by p.approved_at)
                       from public.projects p join public.profiles l on l.id = p.leader_id
                       where p.opportunity_id = o.id and p.status = 'open'), '[]'::jsonb)
  )
  from public.opportunities o where o.id = p_id
$$;

-- Projekat sada nosi i vezu sa prilikom.
create or replace function private.project_json(p_id uuid, p_me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'goal', p.goal, 'deadline', p.deadline,
    'spots', p.spots, 'free', private.free_spots(p.id), 'icon', p.icon, 'status', p.status,
    'created_at', p.created_at, 'approved_at', p.approved_at, 'completed_at', p.completed_at,
    'result_text', p.result_text,
    'tags', coalesce((select jsonb_agg(x.tag order by t.sort) from public.project_tags x
                      join public.tags t on t.slug = x.tag where x.project_id = p.id), '[]'::jsonb),
    'leader_nick', (select nick from public.profiles where id = p.leader_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('nick', u.nick, 'class_label', c.label,
                                          'is_leader', u.id = p.leader_id) order by m.joined_at)
      from public.group_members m
      join public.profiles u on u.id = m.profile_id
      left join public.classes c on c.id = u.class_id
      where m.project_id = p.id and m.left_at is null), '[]'::jsonb),
    'class_count', (select count(distinct u.class_id) from public.group_members m
                    join public.profiles u on u.id = m.profile_id
                    where m.project_id = p.id and m.left_at is null),
    'is_member', exists (select 1 from public.group_members m
                         where m.project_id = p.id and m.profile_id = p_me and m.left_at is null),
    'is_leader', p.leader_id = p_me,
    'invite', (select jsonb_build_object('id', i.id, 'reason_tag', i.reason_tag, 'reason_kind', i.reason_kind)
               from public.invites i
               where i.project_id = p.id and i.profile_id = p_me and i.status = 'pending'),
    'opportunity', (select jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind)
                    from public.opportunities o where o.id = p.opportunity_id)
  )
  from public.projects p where p.id = p_id
$$;

-- Obavještenja o prilikama koje odgovaraju učeniku (najviše 3 odjednom, bez ponavljanja).
create or replace function private.notify_opportunities(p_profile uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, kind, opportunity_id, body)
  select p_profile, 'opportunity', o.id, 'Prilika za tebe: „' || o.title || '“'
  from public.opportunities o
  where (o.deadline is null or o.deadline >= current_date)
    and exists (select 1 from public.opportunity_tags x join public.profile_tags pt on pt.tag = x.tag
                where x.opportunity_id = o.id and pt.profile_id = p_profile)
    and not exists (select 1 from public.notifications n where n.profile_id = p_profile and n.opportunity_id = o.id)
  order by o.deadline nulls last, o.created_at
  limit 3
$$;

-- ─── RPC ─────────────────────────────────────────────────────
create or replace function public.get_opportunities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  return coalesce((
    select jsonb_agg(j order by (j->>'for_me')::boolean desc, (j->>'deadline') nulls last, j->>'created_at' desc)
    from (select private.opportunity_json(o.id, v_me.id) j from public.opportunities o
          where o.deadline is null or o.deadline >= current_date) s
  ), '[]'::jsonb);
end $$;

create or replace function public.get_opportunity(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  return private.opportunity_json(p_id, v_me.id);
end $$;

-- „Zanima me — prijavi me“ (ponovni dodir poništava). Vraća novo stanje.
create or replace function public.toggle_opportunity_interest(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if v_me.role <> 'student' then raise exception 'Prijavljuju se učenici.'; end if;
  if not exists (select 1 from public.opportunities where id = p_id) then raise exception 'Prilika nije pronađena.'; end if;
  delete from public.opportunity_interest where opportunity_id = p_id and profile_id = v_me.id;
  if found then return false; end if;
  insert into public.opportunity_interest (opportunity_id, profile_id) values (p_id, v_me.id);
  return true;
end $$;

-- Mentor/pedagog objavljuje priliku; učenici sa poklapajućim oznakama dobijaju obavještenje.
create or replace function public.create_opportunity(
  p_title text, p_kind public.opportunity_kind, p_organizer text, p_deadline date,
  p_place text, p_audience text, p_description text, p_tags text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.require_staff();
  v_id uuid;
begin
  if coalesce(array_length(p_tags, 1), 0) = 0 then raise exception 'Izaberi bar jednu oblast.'; end if;
  insert into public.opportunities (title, kind, organizer, deadline, place, audience, description, posted_by)
  values (btrim(p_title), p_kind, btrim(p_organizer), p_deadline, btrim(coalesce(p_place, '')),
          btrim(coalesce(p_audience, '')), btrim(coalesce(p_description, '')), v_me.id)
  returning id into v_id;
  insert into public.opportunity_tags (opportunity_id, tag)
  select distinct v_id, t from unnest(p_tags) t where exists (select 1 from public.tags where slug = t);
  insert into public.notifications (profile_id, kind, opportunity_id, body)
  select u.id, 'opportunity', v_id, 'Prilika za tebe: „' || btrim(p_title) || '“'
  from public.profiles u
  where u.role = 'student' and u.onboarded
    and exists (select 1 from public.opportunity_tags x join public.profile_tags pt on pt.tag = x.tag
                where x.opportunity_id = v_id and pt.profile_id = u.id);
  return v_id;
end $$;

-- Projekat (tim) može biti vezan za priliku.
drop function if exists public.create_project(text, text, date, int, text[], text);
create or replace function public.create_project(
  p_title text, p_goal text, p_deadline date, p_spots int, p_tags text[], p_icon text default '✨',
  p_opportunity uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.me();
  v_id uuid;
begin
  if v_me.role <> 'student' then raise exception 'Projekte pokreću učenici.'; end if;
  if (select count(*) from public.projects where leader_id = v_me.id and status = 'pending') >= 3 then
    raise exception 'Već imaš 3 projekta koja čekaju odobrenje.';
  end if;
  if coalesce(array_length(p_tags, 1), 0) = 0 then raise exception 'Izaberi bar jednu oznaku.'; end if;
  if p_opportunity is not null and not exists (select 1 from public.opportunities where id = p_opportunity) then
    raise exception 'Prilika nije pronađena.';
  end if;
  insert into public.projects (title, goal, deadline, spots, icon, leader_id, opportunity_id)
  values (btrim(p_title), btrim(p_goal), p_deadline, coalesce(p_spots, 2), coalesce(nullif(p_icon, ''), '✨'), v_me.id, p_opportunity)
  returning id into v_id;
  insert into public.project_tags (project_id, tag)
  select distinct v_id, t from unnest(p_tags) t where exists (select 1 from public.tags where slug = t);
  return v_id;
end $$;

-- Čuvanje oznaka sada javlja i prilike koje odgovaraju učeniku.
create or replace function public.save_tags(p_tags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if jsonb_typeof(p_tags) <> 'array' or jsonb_array_length(p_tags) = 0 then
    raise exception 'Izaberi bar jednu oznaku.';
  end if;
  if jsonb_array_length(p_tags) > 17 then raise exception 'Previše oznaka.'; end if;
  delete from public.profile_tags where profile_id = v_me.id;
  insert into public.profile_tags (profile_id, tag, kind)
  select distinct on (e->>'tag') v_me.id, e->>'tag', (e->>'kind')::public.tag_kind
  from jsonb_array_elements(p_tags) e
  where exists (select 1 from public.tags t where t.slug = e->>'tag');
  update public.profiles set onboarded = true, tags_version = tags_version + 1 where id = v_me.id;
  if v_me.role = 'student' then perform private.notify_opportunities(v_me.id); end if;
end $$;

create or replace function public.get_notifications()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'project_id', project_id,
           'opportunity_id', opportunity_id, 'body', body, 'read', read_at is not null,
           'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from (select * from public.notifications where profile_id = private.my_profile_id()
        order by created_at desc limit 30) n
$$;

-- Reset vraća i prilike na seed.
create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  delete from auth.users u
  where exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'student')
     or not exists (select 1 from public.profiles p where p.user_id = u.id);
  delete from public.notifications where true;
  delete from public.help_signals where true;
  delete from public.projects where true; -- kaskadno: oznake, članovi, pozivi, zid
  delete from public.group_members where true;
  delete from public.opportunity_interest where true;
  delete from public.opportunities where true;
  delete from public.profiles where role = 'student';
  delete from private.first_group_events where true;
  update public.access_codes set used_at = null where role = 'student';
  perform private.load_seed();
  perform private.load_seed_opportunities();
  update public.demo_meta set reset_at = now() where id = 1;
end $$;

-- Privremena prazna verzija; prava je u 0009_seed_opportunities.sql (generisano).
create or replace function private.load_seed_opportunities()
returns void language plpgsql security definer set search_path = '' as $$ begin end $$;

-- ─── Realtime ────────────────────────────────────────────────
alter publication supabase_realtime add table public.opportunities;

-- ─── Prava ───────────────────────────────────────────────────
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.my_profile_id(), private.is_staff(), private.is_member(uuid),
  private.shares_group(uuid), private.has_group(uuid)
to authenticated;
revoke execute on function
  public.get_opportunities(), public.get_opportunity(uuid), public.toggle_opportunity_interest(uuid),
  public.create_opportunity(text, public.opportunity_kind, text, date, text, text, text, text[]),
  public.create_project(text, text, date, int, text[], text, uuid),
  public.save_tags(jsonb), public.get_notifications(), public.reset_demo()
from public, anon;
grant execute on function
  public.get_opportunities(), public.get_opportunity(uuid), public.toggle_opportunity_interest(uuid),
  public.create_opportunity(text, public.opportunity_kind, text, date, text, text, text, text[]),
  public.create_project(text, text, date, int, text[], text, uuid),
  public.save_tags(jsonb), public.get_notifications(), public.reset_demo()
to authenticated;
