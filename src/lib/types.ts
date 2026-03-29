export type TerrainType = 'road' | 'trail' | 'ultra' | 'cross' | 'obstacle' | 'mixed';
export type RaceStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface RaceDistance {
  label: string;
  km: number;
}

export interface Race {
  id: string;
  slug: string;
  name: string;
  description: string | null;

  date_start: string;
  date_end: string | null;
  time_start: string | null;

  city: string;
  region: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  venue: string | null;

  distances: RaceDistance[];
  terrain: TerrainType;
  elevation_gain: number | null;

  price_from: number | null;
  price_to: number | null;
  currency: string;

  website: string | null;
  registration_url: string | null;
  logo_url: string | null;
  cover_url: string | null;

  organizer: string | null;
  organizer_url: string | null;

  status: RaceStatus;
  source: string | null;
  source_id: string | null;
  capacity: number | null;
  tags: string[];

  created_at: string;
  updated_at: string;
}

/** Subset of Race fields used in listing cards */
export type RaceCard = Pick<
  Race,
  | 'id'
  | 'slug'
  | 'name'
  | 'date_start'
  | 'city'
  | 'region'
  | 'lat'
  | 'lng'
  | 'distances'
  | 'terrain'
  | 'price_from'
  | 'price_to'
  | 'cover_url'
  | 'status'
  | 'tags'
>;
