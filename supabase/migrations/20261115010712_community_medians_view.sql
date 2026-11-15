-- Typical-contributor figures for the community impact page. A mean is
-- dragged up by the launch seed and a few heavy uploaders; the median is what
-- a normal contributor looks like. Counts only, no tokens exposed.

create or replace view public.community_medians as
select
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
  )::int as median_games_per_contributor;

grant select on public.community_medians to anon;
