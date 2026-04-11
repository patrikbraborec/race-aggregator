import { createClient } from '@supabase/supabase-js';
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

/** Fetch races with optional filters via the search_races RPC. */
export async function getRaces(filters: {
  terrain?: string;
  region?: string;
  query?: string;
  km?: number;
  month?: number;
  city?: string;
  proximity?: boolean;
}): Promise<Race[]> {
  const { data, error } = await supabase.rpc('search_races', {
    p_terrain: filters.terrain || null,
    p_region: filters.region || null,
    p_month: filters.month || null,
    p_km: filters.km || null,
    p_city: filters.city || null,
    p_proximity: filters.proximity ?? false,
    p_search_text: filters.query?.trim() || null,
  });

  if (error) throw error;
  return (data ?? []) as Race[];
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
