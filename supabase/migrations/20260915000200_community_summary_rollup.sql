-- The Community page's numbers, saved instead of recomputed per visit.
--
-- community_totals, community_growth and community_medians each scanned the
-- whole contributions or matches table on every request: about 590, 240 and
-- 110 ms on 164k contributions and 140k matches, so roughly a second of
-- database time per page view, callable by anyone without logging in, and
-- growing with the data. The other stats were moved into rollups for the same
-- reason.
--
-- One row, computed once, read by all three views. Column names and types are
-- unchanged, so the site and the prerender script keep working. It is picked
-- up by stats.refresh_all() with the other rollups, and also refreshed every
-- five minutes on its own (it takes about a second), so the game count still
-- moves for contributors watching it.

create materialized view stats.community_summary as
select
  (select count(*) from public.matches) as games,
  (select count(distinct contributor_token) from public.contributions) as contributors,
  (select coalesce(sum(game_duration), 0) from public.matches) as total_seconds,
  (select count(distinct split_part(game_version, '.', 1) || '.' || split_part(game_version, '.', 2))
     from public.matches) as patches,
  (select min(game_creation) from public.matches) as first_game_ms,
  (select max(game_creation) from public.matches) as last_game_ms,
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
    where created_at >= now() - interval '30 days') as new_seconds_30d,
  coalesce(
    (
      select percentile_cont(0.5) within group (order by n)
        from (
          select count(*) as n
            from public.contributions
           group by contributor_token
        ) per_contributor
    ),
    0
  )::int as median_games_per_contributor,
  1 as singleton;

-- A concurrent refresh needs a unique index
create unique index community_summary_key on stats.community_summary (singleton);

create or replace view public.community_totals as
select games, contributors, total_seconds, patches, first_game_ms, last_game_ms
  from stats.community_summary;

create or replace view public.community_growth as
select new_contributors_30d, new_games_30d, new_seconds_30d
  from stats.community_summary;

create or replace view public.community_medians as
select median_games_per_contributor
  from stats.community_summary;

select cron.schedule(
  'refresh-community-summary',
  '*/5 * * * *',
  $$refresh materialized view concurrently stats.community_summary$$
);
