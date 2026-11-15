-- A reviewed game gives its contributor's quarantine slot back.
--
-- ingest_games() keeps contributor_stats.pending_quarantine, the number of a
-- contributor's games waiting for review, and stops taking quarantined games at
-- 25. It added to the counter and nothing took away from it: the review
-- function changes a row's status and never touches the count. So every
-- contributor's slots only ever filled, and after 25 quarantined games in a
-- lifetime a token would be refused further ones for good, told only to retry.
--
-- Rather than change the review function and the ingest function (the write
-- path every contributor uses), the counter is kept honest where the status
-- changes: a trigger on the quarantine table. Covers a single approve, a bulk
-- one, a deny and a delete alike.

create or replace function public.release_quarantine_slot()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.contributor_stats
     set pending_quarantine = greatest(pending_quarantine - 1, 0),
         updated_at = now()
   where contributor_token = old.contributor_token;
  return null;
end;
$function$;

revoke all on function public.release_quarantine_slot() from public, anon, authenticated;

create trigger quarantine_status_releases_slot
  after update of status on public.quarantine
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.release_quarantine_slot();

create trigger quarantine_delete_releases_slot
  after delete on public.quarantine
  for each row
  when (old.status = 'pending')
  execute function public.release_quarantine_slot();

-- Counters that already drifted: set them to what is actually pending
update public.contributor_stats s
   set pending_quarantine = (
         select count(*)::int
           from public.quarantine q
          where q.contributor_token = s.contributor_token
            and q.status = 'pending'
       )
 where s.pending_quarantine <> (
         select count(*)::int
           from public.quarantine q
          where q.contributor_token = s.contributor_token
            and q.status = 'pending'
       );
