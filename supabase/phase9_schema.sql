-- Phase 9 bootstrap schema for DinnerDecider
-- Profiles, realtime session telemetry, and group session events

create extension if not exists "uuid-ossp";

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text,
  tier text not null default 'free',
  ai_summary text,
  preferences jsonb,
  insights jsonb,
  last_active_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated
before update on profiles
for each row execute function set_profiles_updated_at();

alter table profiles enable row level security;
create policy "profile_self_access" on profiles
  for select using (auth.uid() = user_id);
create policy "service_read_profiles" on profiles
  for select using (auth.role() = 'service_role');
create policy "service_write_profiles" on profiles
  for insert with check (auth.role() = 'service_role');
create policy "service_update_profiles" on profiles
  for update using (auth.role() = 'service_role');

create table if not exists session_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete set null,
  session_code text,
  action text not null,
  restaurant_name text,
  restaurant_data jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table session_metrics enable row level security;
create policy "metrics_self_read" on session_metrics
  for select using (auth.uid() = user_id or user_id is null);
create policy "metrics_insert" on session_metrics
  for insert with check (auth.uid() = user_id or user_id is null);
create policy "metrics_service_all" on session_metrics
  for all using (auth.role() = 'service_role');

create table if not exists group_session_events (
  id uuid primary key default uuid_generate_v4(),
  session_code text not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

alter table group_session_events enable row level security;
create policy "group_events_read" on group_session_events
  for select using (auth.role() = 'service_role');
create policy "group_events_insert" on group_session_events
  for insert with check (auth.role() = 'service_role');

-- Optional publication for realtime streaming of session metrics
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'realtime_metrics'
  ) then
    create publication realtime_metrics
      for table session_metrics, group_session_events;
  end if;
end;
$$;
