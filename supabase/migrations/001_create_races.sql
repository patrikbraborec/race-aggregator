-- Enable PostGIS for geospatial queries
create extension if not exists postgis;

-- Enum for terrain type
create type terrain_type as enum ('road', 'trail', 'ultra', 'cross', 'obstacle', 'mixed');

-- Enum for race status
create type race_status as enum ('confirmed', 'tentative', 'cancelled');

create table races (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,

  -- Date & time
  date_start    date not null,
  date_end      date,
  time_start    time,

  -- Location
  city          text not null,
  region        text,
  country       text not null default 'CZ',
  lat           double precision,
  lng           double precision,
  location      geography(Point, 4326),
  venue         text,

  -- Race details
  distances     jsonb not null default '[]',  -- e.g. [{"label":"Maraton","km":42.195},{"label":"Pulmaraton","km":21.1}]
  terrain       terrain_type not null default 'road',
  elevation_gain integer,

  -- Pricing
  price_from    integer,  -- in CZK, lowest current entry fee
  price_to      integer,  -- highest current entry fee
  currency      text not null default 'CZK',

  -- Links & media
  website       text,
  registration_url text,
  logo_url      text,
  cover_url     text,

  -- Organizer
  organizer     text,
  organizer_url text,

  -- Status & metadata
  status        race_status not null default 'confirmed',
  source        text,         -- where we scraped/imported from
  source_id     text,         -- external ID from source
  capacity      integer,
  tags          text[] default '{}',

  -- Full-text search
  fts           tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create index idx_races_date on races (date_start);
create index idx_races_terrain on races (terrain);
create index idx_races_slug on races (slug);
create index idx_races_fts on races using gin (fts);
create index idx_races_location on races using gist (location);
create index idx_races_status on races (status) where status = 'confirmed';

-- Auto-populate geography column from lat/lng
create or replace function races_set_location()
returns trigger as $$
begin
  if NEW.lat is not null and NEW.lng is not null then
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_races_set_location
  before insert or update on races
  for each row execute function races_set_location();

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql;

create trigger trg_races_updated_at
  before update on races
  for each row execute function update_updated_at();

-- Row-level security
alter table races enable row level security;

-- Public read access
create policy "Races are publicly readable"
  on races for select
  using (true);
