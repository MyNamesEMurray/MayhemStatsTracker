-- Rolling 30 day growth for the community impact page: what the database
-- gained recently, as counts only. "New" means first uploaded in the window,
-- by upload time, so a backlog synced today counts as growth even though the
-- games were played earlier.

create or replace view public.community_growth as
select
  (
    select count(*)::int
      from (
        select contributor_token
          from public.contributions
         group by contributor_token
        having min(created_at) >= now() - interval '30 days'
      ) t
  ) as new_contributors_30d,
  (select count(*)::int from public.matches
    where created_at >= now() - interval '30 days') as new_games_30d,
  (select coalesce(sum(game_duration), 0)::bigint from public.matches
    where created_at >= now() - interval '30 days') as new_seconds_30d;

grant select on public.community_growth to anon;
