-- Recovered from the live project's migration history, where it was applied
-- directly; it had never been committed here. The "not exists" check in
-- delete_contributions() looks contributions up by (platform, game_id).

create index if not exists idx_contributions_platform_game_id on public.contributions (platform, game_id);
