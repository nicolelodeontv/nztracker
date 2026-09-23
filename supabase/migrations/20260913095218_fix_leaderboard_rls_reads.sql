create policy "authenticated read leaderboard entries" on public.leaderboard_entries for select to authenticated using (true);
create policy "authenticated read leaderboard history" on public.leaderboard_history for select to authenticated using (true); 
