alter table public.clan_members add column if not exists snapshot_at timestamptz;
create index if not exists clan_members_snapshot_idx on public.clan_members (season, clan_id, snapshot_at desc); 
