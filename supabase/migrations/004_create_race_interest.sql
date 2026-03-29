create table race_interest (
  id          uuid primary key default gen_random_uuid(),
  race_id     uuid not null references races(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index idx_race_interest_race on race_interest (race_id);

-- Row-level security
alter table race_interest enable row level security;

-- Anyone can insert (anonymous "I'm running this")
create policy "Anyone can register interest"
  on race_interest for insert
  with check (true);

-- Anyone can read counts (needed for social proof)
create policy "Anyone can read interest"
  on race_interest for select
  using (true);
