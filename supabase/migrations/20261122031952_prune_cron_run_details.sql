-- cron.job_run_details keeps one row per job run and is never pruned; the
-- 5-minute community summary refresh alone adds about 288 rows a day.
select cron.schedule(
  'prune-cron-run-details',
  '17 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
