-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0009 · Seed prilika van škole (GENERISANO: npm run gen:seed)
--  Izmišljene prilike; organizatori su generički.
-- ═════════════════════════════════════════════════════════════

create or replace function private.load_seed_opportunities()
returns void language plpgsql security definer set search_path = '' as $opp$
begin
  insert into public.opportunities (id, title, kind, organizer, deadline, place, audience, description, posted_by_label, created_at) values
    ('d0000000-0000-4000-8000-000000000001', 'Hakaton „Turizam sjutra“ za srednjoškolce', 'hakaton', 'Inovacioni centar za mlade', current_date + 18, 'Podgorica', 'II–IV razred, timovi od 3 do 5', 'Dva dana smišljanja digitalnih rješenja za lokalni turizam. Mentori iz IT firmi i hotela, hrana i majice obezbijeđeni. Trebaju ljudi za ideju, dizajn, jezike i prezentaciju.', 'Mentorka sekcije', now() - interval '3 days'),
    ('d0000000-0000-4000-8000-000000000002', 'Regionalno takmičenje mladih kuvara i poslastičara', 'takmicenje', 'Udruženje kuvara primorja', current_date + 14, 'Budva', 'III i IV razred, smjer kuvar', 'Takmičenje u pripremi predjela i deserta od lokalnih namirnica. Najbolji dobijaju praksu u hotelima sa pet zvjezdica.', 'Profesor praktične nastave', now() - interval '5 days'),
    ('d0000000-0000-4000-8000-000000000003', 'Radionica: barmenstvo i latte art', 'radionica', 'Akademija za ugostiteljstvo', current_date + 7, 'Bar, školska kuhinja', 'Svi razredi, 12 mjesta', 'Tri sata prakse: klasični mocktaili, aparat za espresso i crtanje u mlijeku. Dobijaš potvrdu o učešću.', 'Mentorka sekcije', now() - interval '2 days'),
    ('d0000000-0000-4000-8000-000000000004', 'Predavanje: kako do prvog posla u turizmu', 'predavanje', 'Klub mladih turističkih radnika', current_date + 5, 'Online', 'Svi razredi', 'Mladi recepcioneri, vodiči i menadžeri pričaju kako su počeli, šta poslodavci traže i kako se piše prva radna biografija.', 'Školski pedagog', now() - interval '1 days'),
    ('d0000000-0000-4000-8000-000000000005', 'Foto i video konkurs „Moj grad u kadru“', 'konkurs', 'Opštinski centar za kulturu', current_date + 25, 'Online prijava', 'Učenici srednjih škola', 'Pošalji do tri fotografije ili video do 60 sekundi o mjestu u kojem živiš. Najbolji radovi idu na izložbu u gradskoj galeriji.', 'Učenički parlament', now() - interval '4 days'),
    ('d0000000-0000-4000-8000-000000000006', 'Volonteri za ljetnji festival na Primorju', 'volontiranje', 'Festivalski odbor', current_date + 30, 'Bar', 'Od 16 godina', 'Doček gostiju, info-pult na engleskom i pomoć bendovima iza bine. Volonterska potvrda i festivalska majica.', 'Učenički parlament', now() - interval '6 days'),
    ('d0000000-0000-4000-8000-000000000007', 'Konkurs za najbolju biznis ideju mladih', 'konkurs', 'Fond za podršku mladim preduzetnicima', current_date + 40, 'Online prijava', 'Učenici i timovi do 4 člana', 'Opiši ideju na dvije strane: problem, rješenje, kupci i troškovi. Finalisti dobijaju mentorstvo i novčanu nagradu za početak.', 'Profesorka ekonomije', now() - interval '8 days'),
    ('d0000000-0000-4000-8000-000000000008', 'Radionica: snimanje i montaža telefonom', 'radionica', 'Medijski centar za mlade', current_date + 12, 'Podgorica', 'Svi razredi', 'Kako snimiti dobar kadar telefonom, popraviti svjetlo i montirati kratak video za društvene mreže. Ponesi telefon.', 'Mentorka sekcije', now() - interval '2 days')
  on conflict (id) do nothing;
  insert into public.opportunity_tags (opportunity_id, tag)
  select v.o::uuid, v.t from (values
    ('d0000000-0000-4000-8000-000000000001', 'turizam'),
    ('d0000000-0000-4000-8000-000000000001', 'preduzetnistvo'),
    ('d0000000-0000-4000-8000-000000000001', 'crtanje'),
    ('d0000000-0000-4000-8000-000000000002', 'kuvanje'),
    ('d0000000-0000-4000-8000-000000000002', 'poslasticarstvo'),
    ('d0000000-0000-4000-8000-000000000003', 'barmen'),
    ('d0000000-0000-4000-8000-000000000004', 'turizam'),
    ('d0000000-0000-4000-8000-000000000004', 'jezici'),
    ('d0000000-0000-4000-8000-000000000004', 'preduzetnistvo'),
    ('d0000000-0000-4000-8000-000000000005', 'video'),
    ('d0000000-0000-4000-8000-000000000005', 'crtanje'),
    ('d0000000-0000-4000-8000-000000000006', 'jezici'),
    ('d0000000-0000-4000-8000-000000000006', 'turizam'),
    ('d0000000-0000-4000-8000-000000000006', 'muzika'),
    ('d0000000-0000-4000-8000-000000000007', 'preduzetnistvo'),
    ('d0000000-0000-4000-8000-000000000008', 'video')
  ) as v(o, t) where exists (select 1 from public.tags where slug = v.t)
  on conflict do nothing;
end $opp$;

revoke all on function private.load_seed_opportunities() from public, anon, authenticated;

-- Postojeća baza (oznake već postoje): odmah učitaj prilike. Prazna baza: učitava ih seed.sql.
do $$ begin if exists (select 1 from public.tags) then perform private.load_seed_opportunities(); end if; end $$;
