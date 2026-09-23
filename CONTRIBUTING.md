# Database migration workflow

All production Supabase schema changes must be represented by a committed migration file.

## Rules

1. Create the migration in `supabase/migrations/` before applying it to production.
2. Test the migration against a disposable local or preview database.
3. Apply production schema changes through the migration workflow rather than ad-hoc SQL whenever possible.
4. After a production migration is applied, verify the remote migration history with `supabase migration list`.
5. If a production migration was applied manually, recover the exact SQL into a migration file and reconcile the remote history before applying another migration.
6. Do not invent historical migration SQL or use no-op placeholder files when the original statements can be recovered.
7. Keep the local migration timestamps aligned with `supabase_migrations.schema_migrations.version`.

This keeps Supabase Preview, local resets, and production deployments reproducible.
