-- Discover content override. Empty by default: the app bundles a static
-- dataset and only switches to these rows when at least one exists.
-- Content is managed via service-role SQL inserts; clients read only.
create table if not exists public.destinations (
  id text primary key,
  name text not null,
  country text not null,
  country_code text not null,
  continent text not null,
  themes text[] not null default '{}',
  tags text[] not null default '{}',
  blurb text not null default '',
  highlights text[] not null default '{}',
  image_url text not null,
  lat double precision not null default 0,
  lng double precision not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.destinations enable row level security;

create policy "destinations readable by authenticated users"
  on public.destinations for select to authenticated using (true);
-- No insert/update/delete policies: writes go through the service role only.
