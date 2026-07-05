-- Funnel analytics events, written fire-and-forget from the app.
-- Read via SQL/dashboard only — no client select policy.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index analytics_events_event_created_idx on public.analytics_events (event, created_at);

alter table public.analytics_events enable row level security;

create policy "users insert their own events"
  on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid());
