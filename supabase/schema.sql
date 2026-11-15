-- Optional: lets the host screen recover a room after a refresh on another device.
-- Realtime multiplayer works without this table (it uses Supabase Realtime Broadcast).
create table if not exists public.dare_rooms (
  code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.dare_rooms enable row level security;
-- Party-game data only (fake money, room snapshots). Anyone with the anon key can read/write rooms.
create policy "rooms are public" on public.dare_rooms for all using (true) with check (true);
