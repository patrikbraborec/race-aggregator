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
  if (filters.query) {
    const sanitized = filters.query.replace(/[%_(),.*\\]/g, '');
    if (sanitized.length > 0) {
      q = q.or(
        `name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,tags.cs.{${sanitized}}`
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data as Race[];
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
