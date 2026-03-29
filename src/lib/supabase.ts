import { createClient } from '@supabase/supabase-js';
import type { Race } from './types';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Fetch upcoming races ordered by date, limited to `limit` results. */
export async function getUpcomingRaces(limit: number): Promise<Race[]> {
  const { data, error } = await supabase
    .from('races')
    .select('*')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .gte('date_start', new Date().toISOString().split('T')[0])
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
    .eq('country', 'CZ');

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
  let q = supabase
    .from('races')
    .select('*')
    .eq('status', 'confirmed')
    .eq('country', 'CZ')
    .order('date_start', { ascending: true });

  if (filters.terrain) {
    q = q.eq('terrain', filters.terrain);
  }
  if (filters.region) {
    q = q.eq('region', filters.region);
  }

  // Filter by month using date_start range
  if (filters.month && filters.month >= 1 && filters.month <= 12) {
    const year = new Date().getFullYear();
    const monthStr = String(filters.month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    // Last day of month: create date for 1st of next month, subtract 1 day
    const lastDay = new Date(year, filters.month, 0).getDate();
    const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    q = q.gte('date_start', startDate).lte('date_start', endDate);
  }

  // Filter by city (case-insensitive prefix match)
  if (filters.city) {
    const sanitizedCity = filters.city.replace(/[%_(),.*\\{}]/g, '');
    if (sanitizedCity.length >= 2) {
      q = q.ilike('city', `%${sanitizedCity}%`);
    }
  }

  if (filters.query) {
    const sanitized = filters.query.replace(/[%_(),.*\\{}]/g, '');
    if (sanitized.length > 0) {
      // Split query into words and create prefix-based search conditions
      // to handle Czech declension (e.g., "Beskydech" → "Beskyd" matches "Beskydská")
      const words = sanitized.split(/\s+/).filter((w) => w.length >= 3);
      if (words.length > 0) {
        const conditions = words.flatMap((w) => {
          // Truncate to ~60% of length (min 3 chars) to strip Czech suffixes
          const prefixLen = Math.max(3, Math.floor(w.length * 0.6));
          const prefix = w.slice(0, prefixLen);
          return [`name.ilike.%${prefix}%`, `city.ilike.%${prefix}%`];
        });
        // Also try the full query as-is for exact-ish matches and tag search
        conditions.push(`name.ilike.%${sanitized}%`);
        conditions.push(`tags.cs.{${sanitized}}`);
        q = q.or(conditions.join(','));
      }
    }
  }

  const { data, error } = await q;
  if (error) throw error;

  let results = data as Race[];

  // Filter by distance client-side (distances is a JSONB array)
  if (filters.km) {
    const targetKm = filters.km;
    const tolerance = targetKm * 0.15; // 15% tolerance
    results = results.filter((race) =>
      race.distances?.some(
        (d) => Math.abs(d.km - targetKm) <= tolerance
      )
    );
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
