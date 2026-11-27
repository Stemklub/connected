-- ConnectEd · zakrpa: pregled tima (svi članovi). Za bazu koja je već na v2.
-- Supabase → SQL Editor → cijeli fajl → Run. Ništa ne briše; može se pokrenuti više puta.

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

revoke all on function public.get_team(uuid) from public, anon;
grant execute on function public.get_team(uuid) to authenticated;
