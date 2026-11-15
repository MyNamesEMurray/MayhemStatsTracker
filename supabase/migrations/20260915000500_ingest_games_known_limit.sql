-- A known limit of ingest_games(), written down where the function is.
--
-- shortcut: the daily-cap check adds the whole batch to window_games before it
-- knows which games are already stored, so a client past its first-sync burst
-- that retries a batch whose response was lost can be told "daily limit
-- reached" for games it already sent. Upgrade (count only games not yet in
-- contributions or quarantine before the check) if retries start showing up in
-- support; it is the write path every contributor uses, so it was left alone
-- for a case this rare.

comment on function public.ingest_games(uuid, jsonb, integer, integer, integer) is
  'shortcut: the daily-cap check counts games already stored, so a retried batch can read as over the limit. See migration 20260915000500.';
