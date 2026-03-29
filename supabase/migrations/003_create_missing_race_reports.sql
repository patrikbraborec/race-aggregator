create table missing_race_reports (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  message     text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_missing_race_reports_resolved on missing_race_reports (resolved) where resolved = false;

-- Row-level security
alter table missing_race_reports enable row level security;

-- Anyone can submit a missing race report (anonymous)
create policy "Anyone can create a missing race report"
  on missing_race_reports for insert
  with check (true);

-- Only authenticated users (admins) can read reports
create policy "Authenticated users can read missing race reports"
  on missing_race_reports for select
  using (auth.role() = 'authenticated');
