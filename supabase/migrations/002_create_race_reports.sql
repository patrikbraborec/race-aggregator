create table race_reports (
  id          uuid primary key default gen_random_uuid(),
  race_id     uuid not null references races(id) on delete cascade,
  reasons     text[] not null default '{}',
  message     text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_race_reports_race on race_reports (race_id);
create index idx_race_reports_resolved on race_reports (resolved) where resolved = false;

-- Row-level security
alter table race_reports enable row level security;

-- Anyone can insert a report (anonymous reporting)
create policy "Anyone can create a report"
  on race_reports for insert
  with check (true);

-- Only authenticated users (admins) can read reports
create policy "Authenticated users can read reports"
  on race_reports for select
  using (auth.role() = 'authenticated');
