export type TerrainType = 'road' | 'trail' | 'cross' | 'obstacle' | 'mixed';

export type SourceName = 'behej' | 'ceskybeh' | 'svetbehu';

export interface RaceDistance {
  label: string;
  km: number;
}

/** Raw shape from all 3 Apify actors (identical schema). */
export interface RawScrapedItem {
  url: string;
  title: string;
  date: string;
  city: string;
  district: string;
  region: string;
  distance: string;
  surface: string;
  cup: string;
  startTime: string;
  startPlace: string;
  registrationTime: string;
  registrationPlace: string;
  description: string;
  website: string;
  contact: string;
  facebook: string;
  photos: string;
  rewards: string;
  edition: string;
  feeOnSite: string;
  feePreRegistration: string;
}

/** After normalization — typed properly, tagged with source. */
export interface NormalizedItem {
  source: SourceName;
  sourceUrl: string;
  title: string;
  date: string;               // ISO YYYY-MM-DD
  city: string;
  district: string;
  region: string;
  distances: RaceDistance[];
  terrain: TerrainType;
  startTime: string | null;   // HH:MM or null
  startPlace: string;
  registrationPlace: string;
  description: string;
  website: string | null;      // normalized URL or null
  contact: string;
  facebook: string;
  cup: string;
  rewards: string;
  edition: string;
  priceFrom: number | null;
  priceTo: number | null;
}

/** DB-ready race object written to output JSON and upserted to Supabase. */
export interface MergedRace {
  slug: string;
  name: string;
  description: string | null;
  date_start: string;
  time_start: string | null;
  city: string;
  region: string | null;
  country: string;
  distances: RaceDistance[];
  terrain: TerrainType;
  price_from: number | null;
  price_to: number | null;
  currency: string;
  website: string | null;
  official_url: string | null;
  extraction_status: string;
  source: string;
  status: string;
  organizer: string | null;
}
