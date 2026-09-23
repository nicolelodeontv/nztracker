alter table public.clan_rankings alter column clan_name drop not null;
alter table public.clan_rankings alter column fetched_at drop not null;
alter table public.clan_rankings alter column source set default 'https://ninjazenshin.online/?panel=clan-ranking';
alter table public.sync_runs alter column finished_at drop not null; 
