-- "Delete my contributions" now removes quarantined games too.
--
-- delete_contributions() removed the token's matches and contributions and
-- stopped there. Games held for review sit in public.quarantine with their full
-- payload, keyed by the same token, so they survived a deletion - and approving
-- one afterwards would put the game and a contributions row for that token
-- straight back. The privacy page promises every record is removed.
--
-- contributor_stats is left alone on purpose: it holds counters, not game data,
-- and clearing it would hand the token a fresh first-sync allowance.

create or replace function public.delete_contributions(p_token uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed integer;
begin
  delete from public.matches m
  where exists (
    select 1 from public.contributions c
    where c.platform = m.platform and c.game_id = m.game_id
      and c.contributor_token = p_token
  )
  and not exists (
    select 1 from public.contributions c2
    where c2.platform = m.platform and c2.game_id = m.game_id
      and c2.contributor_token <> p_token
  );
  get diagnostics removed = row_count;
  delete from public.contributions where contributor_token = p_token;
  delete from public.quarantine where contributor_token = p_token;
  return removed;
end;
$function$;
