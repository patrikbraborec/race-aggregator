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
>;

/** Terrain labels in Czech */
export const terrainLabels: Record<string, string> = {
  road: 'Silnice',
  trail: 'Trail',
  ultra: 'Ultra',
  cross: 'Cross',
  obstacle: 'Překážky',
  mixed: 'Mix',
};

/** Terrain dot color classes for Tailwind */
export const terrainDotColors: Record<string, string> = {
  road: 'bg-[#6B7280]',
  trail: 'bg-success',
  ultra: 'bg-[#7C3AED]',
  cross: 'bg-[#D97706]',
  obstacle: 'bg-error',
  mixed: 'bg-primary',
};

/** Valid terrain type keys */
export const validTerrains = new Set<string>(Object.keys(terrainLabels));
