-- Recovered from the live project's migration history, where it was applied
-- directly; it had never been committed here. Slows the rollup refresh from
-- every 30 minutes to every 3 hours, and drops two indexes the base schema
-- creates.

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'refresh-stats-rollups'), schedule := '0 */3 * * *');
drop index if exists public.idx_match_participant_augments_augment;
drop index if exists public.idx_match_participants_champion;
