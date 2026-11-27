// Pravi supabase/nadogradnja-v1-v2.sql = brisanje v1 objekata + setup.sql + vraćanje mentora.
//   npm run gen:upgrade
// Test (tests/upgrade.test.ts) provjerava da je fajl ažuran i da radi nad pravom v1 bazom.
import { readFileSync, writeFileSync } from 'node:fs'

const V1_FUNCTIONS = [
  'approve_project', 'check_code', 'complete_project', 'create_opportunity', 'create_project', 'get_feed', 'get_me',
  'get_mentor_dashboard', 'get_metrics', 'get_my_groups', 'get_my_invites', 'get_my_tags', 'get_notifications',
  'get_opportunities', 'get_opportunity', 'get_project', 'join_project', 'leave_project', 'mark_notifications_read',
  'nick_status', 'post_wall', 'redeem_code', 'request_help', 'reset_demo', 'resolve_help', 'respond_invite',
  'save_tags', 'toggle_opportunity_interest',
]
// v2 objekti se takođe brišu, da bi se skripta mogla pokrenuti ponovo ako je prvi put stala na pola.
const V2_FUNCTIONS = [
  'claim_demo_code', 'get_team', 'suggest_nicks', 'set_nick', 'save_interests', 'get_for_you', 'get_my_teams', 'propose_project',
  'get_screen', 'get_admin', 'set_registrations', 'generate_codes', 'export_stand_stats',
]
const V2_TABLES = ['demo_events', 'memberships', 'demo_codes', 'demo_settings']
const V1_TABLES = [
  'wall_posts', 'notifications', 'help_signals', 'group_members', 'invites', 'project_tags', 'projects',
  'opportunity_interest', 'opportunity_tags', 'opportunities', 'profile_tags', 'access_codes', 'profiles', 'tags',
  'classes', 'demo_meta',
]
const V1_TYPES = ['user_role', 'tag_kind', 'project_status', 'invite_status', 'opportunity_kind']

export function buildUpgrade(setup: string): string {
  const header = `-- ═════════════════════════════════════════════════════════════
--  ConnectEd · nadogradnja v1 → v2 (GENERISANO: npm run gen:upgrade)
--  Za bazu postavljenu starom verzijom (v1). Supabase → SQL Editor → cijeli fajl → Run.
--  Briše SVE v1 tabele, funkcije i tipove i sve naloge učenika.
--  Čuva mentorske (i pedagoške) profile i njihove auth.users naloge (npr. prof.e2e).
--  Ako nešto pukne na pola, popravite uzrok i pokrenite cijeli fajl ponovo: skripta to podnosi.
-- ═════════════════════════════════════════════════════════════

begin;

-- 1. Zapamti mentore (obična tabela, ne privremena: SQL Editor može izvršavati naredbe
--    u odvojenim sesijama). Briše se na kraju. Skripta se smije pokrenuti ponovo.
create table if not exists public.ce_keep_mentors (user_id uuid primary key, nick text not null);
alter table public.ce_keep_mentors enable row level security;
revoke all on public.ce_keep_mentors from anon, authenticated;
do $$
begin
  -- v1 ili (pri ponovnom pokretanju) v2 tabela profiles
  if to_regclass('public.profiles') is not null then
    insert into public.ce_keep_mentors (user_id, nick)
      select user_id, nick from public.profiles
      where role::text in ('mentor', 'pedagog') and user_id is not null
      on conflict (user_id) do nothing;
  end if;
end $$;

-- 2. Obriši naloge koji nisu mentorski (učenici, anonimni, nedovršeni)
delete from auth.users u where not exists (select 1 from public.ce_keep_mentors k where k.user_id = u.id);

-- 3. Obriši v1 objekte
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${[...V1_FUNCTIONS, ...V2_FUNCTIONS].map((f) => `'${f}'`).join(', ')}])
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;
drop table if exists ${[...V1_TABLES, ...V2_TABLES].map((t) => `public.${t}`).join(', ')} cascade;
drop type if exists ${V1_TYPES.map((t) => `public.${t}`).join(', ')} cascade;
drop schema if exists private cascade;

-- 4. v2 (isto kao supabase/setup.sql)
`
  const footer = `

-- 5. Vrati mentore (uloga mentor; sintetički email nik@connected.test ostaje isti)
insert into public.profiles (user_id, nick, role)
  select k.user_id, k.nick, 'mentor' from public.ce_keep_mentors k
  where exists (select 1 from auth.users u where u.id = k.user_id)
  on conflict (user_id) do update set role = 'mentor';
drop table public.ce_keep_mentors;

commit;
`
  return header + setup + footer
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const setup = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8')
  writeFileSync(new URL('../supabase/nadogradnja-v1-v2.sql', import.meta.url), buildUpgrade(setup))
  console.log('supabase/nadogradnja-v1-v2.sql spreman')
}
