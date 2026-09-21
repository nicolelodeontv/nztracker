-- Explicitly document the tracker database access model:
-- RLS remains enabled on tracker tables; only the server-side service_role is granted a policy.
-- anon/authenticated/public therefore remain denied by RLS and table privileges.

drop policy if exists "rep_tracker_audit_log_service_role_only" on public.rep_tracker_audit_log;
create policy "rep_tracker_audit_log_service_role_only"
  on public.rep_tracker_audit_log
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_audit_log from public, anon, authenticated;
grant all privileges on table public.rep_tracker_audit_log to service_role;

drop policy if exists "rep_tracker_baselines_service_role_only" on public.rep_tracker_baselines;
create policy "rep_tracker_baselines_service_role_only"
  on public.rep_tracker_baselines
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_baselines from public, anon, authenticated;
grant all privileges on table public.rep_tracker_baselines to service_role;

drop policy if exists "rep_tracker_config_service_role_only" on public.rep_tracker_config;
create policy "rep_tracker_config_service_role_only"
  on public.rep_tracker_config
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_config from public, anon, authenticated;
grant all privileges on table public.rep_tracker_config to service_role;

drop policy if exists "rep_tracker_finalizations_service_role_only" on public.rep_tracker_finalizations;
create policy "rep_tracker_finalizations_service_role_only"
  on public.rep_tracker_finalizations
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_finalizations from public, anon, authenticated;
grant all privileges on table public.rep_tracker_finalizations to service_role;

drop policy if exists "rep_tracker_hours_service_role_only" on public.rep_tracker_hours;
create policy "rep_tracker_hours_service_role_only"
  on public.rep_tracker_hours
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_hours from public, anon, authenticated;
grant all privileges on table public.rep_tracker_hours to service_role;

drop policy if exists "rep_tracker_kv_service_role_only" on public.rep_tracker_kv;
create policy "rep_tracker_kv_service_role_only"
  on public.rep_tracker_kv
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_kv from public, anon, authenticated;
grant all privileges on table public.rep_tracker_kv to service_role;

drop policy if exists "rep_tracker_member_events_service_role_only" on public.rep_tracker_member_events;
create policy "rep_tracker_member_events_service_role_only"
  on public.rep_tracker_member_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_member_events from public, anon, authenticated;
grant all privileges on table public.rep_tracker_member_events to service_role;

drop policy if exists "rep_tracker_member_latest_service_role_only" on public.rep_tracker_member_latest;
create policy "rep_tracker_member_latest_service_role_only"
  on public.rep_tracker_member_latest
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_member_latest from public, anon, authenticated;
grant all privileges on table public.rep_tracker_member_latest to service_role;

drop policy if exists "rep_tracker_member_points_service_role_only" on public.rep_tracker_member_points;
create policy "rep_tracker_member_points_service_role_only"
  on public.rep_tracker_member_points
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_member_points from public, anon, authenticated;
grant all privileges on table public.rep_tracker_member_points to service_role;

drop policy if exists "rep_tracker_members_service_role_only" on public.rep_tracker_members;
create policy "rep_tracker_members_service_role_only"
  on public.rep_tracker_members
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_members from public, anon, authenticated;
grant all privileges on table public.rep_tracker_members to service_role;

drop policy if exists "rep_tracker_ranking_history_service_role_only" on public.rep_tracker_ranking_history;
create policy "rep_tracker_ranking_history_service_role_only"
  on public.rep_tracker_ranking_history
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_ranking_history from public, anon, authenticated;
grant all privileges on table public.rep_tracker_ranking_history to service_role;

drop policy if exists "rep_tracker_seasons_service_role_only" on public.rep_tracker_seasons;
create policy "rep_tracker_seasons_service_role_only"
  on public.rep_tracker_seasons
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_seasons from public, anon, authenticated;
grant all privileges on table public.rep_tracker_seasons to service_role;

drop policy if exists "rep_tracker_snapshots_service_role_only" on public.rep_tracker_snapshots;
create policy "rep_tracker_snapshots_service_role_only"
  on public.rep_tracker_snapshots
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_snapshots from public, anon, authenticated;
grant all privileges on table public.rep_tracker_snapshots to service_role;

drop policy if exists "rep_tracker_sync_runs_service_role_only" on public.rep_tracker_sync_runs;
create policy "rep_tracker_sync_runs_service_role_only"
  on public.rep_tracker_sync_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table public.rep_tracker_sync_runs from public, anon, authenticated;
grant all privileges on table public.rep_tracker_sync_runs to service_role;
