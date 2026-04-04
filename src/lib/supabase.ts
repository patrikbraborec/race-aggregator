import { createClient } from '@supabase/supabase-js';
import { rankRacesByQuery } from './search';
import type { Race } from './types';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Fetch upcoming races ordered by date, limited to `limit` results. */
export async function getUpcomingRaces(limit: number): Promise<Race[]> {
  const { data, error } = await supabase
    .from('races')
    .select('*')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .in('extraction_status', ['extracted', 'complete'])
    .gte('date_start', getTodayDateString())
    .order('date_start', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as Race[];
}

/** Count races per terrain type (confirmed only). */
export async function getTerrainCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('races')
    .select('terrain')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .in('extraction_status', ['extracted', 'complete'])
    .gte('date_start', getTodayDateString());

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.terrain] = (counts[row.terrain] ?? 0) + 1;
  }
  return counts;
}

/** Fetch races with optional filters. */
export async function getRaces(filters: {
  terrain?: string;
  region?: string;
  query?: string;
  km?: number;
  month?: number;
  city?: string;
}): Promise<Race[]> {
  const effectiveTerrain = filters.terrain;
  const effectiveRegion = filters.region;
  const effectiveMonth = filters.month;
  const effectiveCity = filters.city;
  const effectiveKm = filters.km;
  const today = getTodayDateString();

  let q = supabase
    .from('races')
    .select('*')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .in('extraction_status', ['extracted', 'complete'])
    .gte('date_start', today)
    .order('date_start', { ascending: true });

  if (effectiveTerrain) {
    q = q.eq('terrain', effectiveTerrain);
  }
  if (effectiveRegion) {
    q = q.eq('region', effectiveRegion);
  }

  // Filter by month using date_start range
  if (effectiveMonth && effectiveMonth >= 1 && effectiveMonth <= 12) {
    let year = new Date().getFullYear();
    const monthStr = String(effectiveMonth).padStart(2, '0');
    let lastDay = new Date(year, effectiveMonth, 0).getDate();
    let endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    // If the month has already passed this year, use next year
    if (endDate < today) {
      year += 1;
      lastDay = new Date(year, effectiveMonth, 0).getDate();
      endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    }

    const startDate = `${year}-${monthStr}-01`;
    q = q.gte('date_start', startDate).lte('date_start', endDate);
  }

  if (effectiveCity) {
    const sanitizedCity = effectiveCity.replace(/[%_(),.*\\{}]/g, '');
    if (sanitizedCity.length >= 2) {
      q = q.or(
        `name.ilike.%${sanitizedCity}%,city.ilike.%${sanitizedCity}%,region.ilike.%${sanitizedCity}%`,
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;

  let results = data as Race[];

  // Filter by distance client-side (distances is a JSONB array)
  if (effectiveKm) {
    const targetKm = effectiveKm;
    const tolerance = targetKm * 0.15; // 15% tolerance
    results = results.filter((race) =>
      race.distances?.some(
        (d) => Math.abs(d.km - targetKm) <= tolerance
      )
    );
  }

  if (filters.query?.trim()) {
    results = rankRacesByQuery(results, filters.query);
  }

  return results;
}

/** Get all distinct regions. */
export async function getRegions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('races')
    .select('region')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .in('extraction_status', ['extracted', 'complete'])
    .gte('date_start', getTodayDateString())
    .not('region', 'is', null);

  if (error) throw error;

  const unique = [...new Set(data.map((r) => r.region as string))].sort();
  return unique;
}

/** Get count of "I'm running this" interest for a race. */
export async function getRaceInterestCount(raceId: string): Promise<number> {
  const { count, error } = await supabase
    .from('race_interest')
    .select('*', { count: 'exact', head: true })
    .eq('race_id', raceId);

  if (error) return 0;
  return count ?? 0;
}

/** Fetch a single race by slug. */
export async function getRaceBySlug(slug: string): Promise<Race | null> {
  const { data, error } = await supabase
    .from('races')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data as Race) ?? null;
}
