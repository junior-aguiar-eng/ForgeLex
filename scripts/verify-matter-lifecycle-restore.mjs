// The isolated smoke includes a real pre-purge pg_dump/pg_restore and the restore
// gate. Keep one canonical fixture and the same localhost-only database guard.
await import('./smoke-matter-lifecycle-postgres.mjs');
