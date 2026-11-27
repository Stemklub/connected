-- ConnectEd · zakrpa: mentor tima (upisuje se u adminu, prikazuje na timu i pozivu; ostaje poslije reseta).
-- Za bazu koja je već na v2. Supabase → SQL Editor → cijeli fajl → Run. Ništa ne briše; može se pokrenuti više puta.

-- Mentor tima (ime nastavnika, upisuje admin). Odvojeno od projects da bi ostalo i poslije reseta.
create table if not exists public.team_mentors (
  project_id uuid primary key,
  mentor     text not null check (char_length(mentor) between 2 and 60)
);
alter table public.team_mentors enable row level security;
revoke all on public.team_mentors from anon, authenticated;

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

revoke all on function public.set_team_mentor(uuid, text) from public, anon;
grant execute on function public.set_team_mentor(uuid, text) to authenticated;
