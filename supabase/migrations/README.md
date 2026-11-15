# Migrations

Twenty-eight migrations have been applied to the community stats project. Until
2026-08-28 only six of them were in this repository, and the seven missing ones
included the base schema: every table, every foreign key, the row level
security posture, and the withdrawal function. They existed only inside the
Supabase project's own history.

They have now been recovered by reading
`supabase_migrations.schema_migrations` out of the live database, and are
committed here verbatim except where noted below. The three from 2026-08-28
were written here as they were applied.

## Versions match the live ledger

Every file here is named with the version the live project's
`supabase_migrations.schema_migrations` recorded for it, so `supabase db push`
sees all of them as applied and runs nothing. A few were once numbered by hand
and did not match; they were renamed on 2026-11-15:

| Renamed from                                         | To (the recorded version)        |
| ---------------------------------------------------- | -------------------------------- |
| `20260824000000_materialize_stats_aggregates`        | `20260824073838`                 |
| `20260824120000_materialize_stats_rollups`           | `20260824075624`                 |
| `20260824120100_serve_stats_from_rollups`            | `20260824075945`                 |
| `20260824120200_restrict_refresh_stats_execute`      | `20260824080854`                 |
| `20260824120300_drop_duplicate_stats_mv`             | `20260824081514`                 |
| `20260828192500_fix_rollup_refresh_timeout`          | `20260828191720`                 |
| `20260915000000` .. `0500` (the six added 2026-11-15) | `20261115010710` .. `20261115030203` |

Two things are not a plain rename:

- **`20260824075700_stats_rollups`** was applied to the project outside the
  ledger (its objects are live), so it had no recorded version. It was
  renumbered to sort after `20260824075624`, because it indexes
  `stats.augment_stats`, which that migration creates - its old number put it
  first and a rebuild from this directory would have failed. A ledger row was
  added for it with the equivalent of `supabase migration repair --status
  applied 20260824075700`, so a push does not run it again. It drops and
  rebuilds `augment_totals` and `matchup_coverage` and would take the public
  views down for the duration if it did.
- The two `20260924*` files were recovered from the ledger as they were; see
  below.

The files from before 2026-08-28 are longer than what the database stored,
because they were rewritten with fuller comments. The SQL is equivalent; the
prose is better here.

**`supabase db pull` will write secrets into a file.** The
`quarantine_review_pipeline` migration seeded `admin_config` with live values
inline: the review secret that authorises approve and deny links, the cron
secret, an API key and a personal email address. Those values are in the
project's migration history and will come straight out into your working tree.

The copy committed here has them removed, and explains what to seed instead.
If you pull, diff before you commit.

## Rebuilding from scratch

Applying these in filename order against an empty project reproduces the
schema, minus the `admin_config` rows, which are seeded out of band per the
comment in `20260809222856`. The digest function returns quietly when they are
absent, so an unseeded environment simply never sends a digest.

## The 2026-08-28 three

`contributor_stats_counters` adds the per-token counter row.
`atomic_ingest_games` adds `ingest_games()`, and `fix_ingest_counter_update`
replaces its counter update with a single readable statement. The last one is
what is running; the middle one is kept because the database's ledger records
it, and because applying the pair in order is what reproduces the live
function.

The function body in `fix_ingest_counter_update` is byte-identical to
`pg_proc.prosrc` in production, checked by SHA-256.

## The rollups added on 2026-08-28

`champion_matchups_rollup` and `augment_pairs_rollup` each turn a join that
was only ever counted into a table that can be read.

`augment_pairs` is created WITH NO DATA on purpose: its build is a self-join
over five million augment rows and does not finish inside a client timeout.
`stats.refresh_all()` finds it by catalog lookup and populates it on its next
pass - a plain refresh while it is unpopulated, concurrent ones after that -
so a rebuilt environment fills it in without anyone doing anything.

## Applied directly, then recovered

`20260924163340_slow_stats_refresh_drop_unused_indexes` and
`20260924163614_index_contributions_platform_game_id` were applied to the live
project without being committed. They are copied here from its ledger. The
first moves the `refresh-stats-rollups` job from every 30 minutes to every 3
hours, which supersedes the schedule set in `20260828191720`, and drops two
indexes the base schema creates.

The `20261115*` files (community summary rollup and its views, release of
quarantine slots, delete clearing quarantine, a note on `ingest_games`) were
applied through the Supabase tool. `community_summary` refreshes itself every
five minutes on its own job, apart from `refresh_all()`.
