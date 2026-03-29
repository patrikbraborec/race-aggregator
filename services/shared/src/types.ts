export type TerrainType = 'road' | 'trail' | 'ultra' | 'cross' | 'obstacle' | 'mixed';
export type RaceStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface RaceDistance {
  label: string;
  km: number;
}

/**
 * Input type for upserting races into Supabase.
 * Omits auto-generated fields (id, created_at, updated_at).
 */
export interface RaceInput {
  slug: string;
  name: string;
  description?: string | null;

  date_start: string;
  date_end?: string | null;
  time_start?: string | null;

  city: string;
  region?: string | null;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  venue?: string | null;

  distances: RaceDistance[];
  terrain: TerrainType;
  elevation_gain?: number | null;

  price_from?: number | null;
  price_to?: number | null;
  currency?: string;

  website?: string | null;
  registration_url?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;

  organizer?: string | null;
  organizer_url?: string | null;

  status: RaceStatus;
  source: string;
  source_id?: string | null;
  capacity?: number | null;
  tags?: string[];
}
