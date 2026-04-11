import type { NormalizedItem, MergedRace, TerrainType, RaceDistance } from './types.js';
import { normalizeText, extractOrganizer, normalizeWebsite } from './normalize.js';

/** Terrain specificity order — higher = more specific. */
const TERRAIN_PRIORITY: Record<TerrainType, number> = {
  road: 0,
  mixed: 1,
  cross: 2,
  trail: 3,
  obstacle: 4,
  ultra: 5,
};

/**
 * Merge a group of duplicate items into a single race.
 * Strategy: pick the richest non-empty value for each field.
 */
export function mergeGroup(group: NormalizedItem[]): Omit<MergedRace, 'slug'> {
  const name = pickLongest(group.map(g => g.title));
  const description = pickLongest(group.map(g => g.description)) || null;
  const date = group[0].date;
  const startTime = pickFirst(group.map(g => g.startTime));
  const city = pickShortest(group.map(g => g.city).filter(Boolean)) || group[0].city;
  const region = pickFirst(group.map(g => g.region || null));
  const distances = mergeDistances(group.flatMap(g => g.distances));
  const terrain = pickMostSpecificTerrain(group.map(g => g.terrain));

  // Prices: take minimum priceFrom and maximum priceTo
  const pricesFrom = group.map(g => g.priceFrom).filter((p): p is number => p !== null);
  const pricesTo = group.map(g => g.priceTo).filter((p): p is number => p !== null);
  const priceFrom = pricesFrom.length > 0 ? Math.min(...pricesFrom) : null;
  const priceTo = pricesTo.length > 0 ? Math.max(...pricesTo) : null;

  const website = pickFirst(group.map(g => g.website));

  // Organizer: try behej contact first, then any contact
  const behejItem = group.find(g => g.source === 'behej');
  const organizer = (behejItem ? extractOrganizer(behejItem.contact) : null)
    ?? pickFirst(group.map(g => extractOrganizer(g.contact)));

  const sources = [...new Set(group.map(g => g.source))].sort().join(',');

  return {
    name,
    description,
    date_start: date,
    time_start: startTime,
    city,
    region: region || null,
    country: 'CZ',
    distances,
    terrain,
    price_from: priceFrom,
    price_to: priceTo,
    currency: 'CZK',
    website,
    official_url: website ? normalizeWebsite(website) : null,
    extraction_status: 'extracted',
    source: sources,
    status: 'confirmed',
    organizer,
  };
}

function pickLongest(values: string[]): string {
  return values
    .filter(v => v.trim().length > 0)
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

function pickShortest(values: string[]): string | undefined {
  return values
    .filter(v => v.trim().length > 0)
    .sort((a, b) => a.length - b.length)[0];
}

function pickFirst<T>(values: (T | null | undefined)[]): T | null {
  return values.find((v): v is T => v !== null && v !== undefined) ?? null;
}

function pickMostSpecificTerrain(terrains: TerrainType[]): TerrainType {
  return terrains.sort((a, b) => TERRAIN_PRIORITY[b] - TERRAIN_PRIORITY[a])[0] ?? 'road';
}

/** Merge distances from multiple sources, deduplicating by km (0.5km tolerance). */
function mergeDistances(all: RaceDistance[]): RaceDistance[] {
  const merged: RaceDistance[] = [];

  for (const d of all) {
    const existing = merged.find(m => Math.abs(m.km - d.km) < 0.5);
    if (existing) {
      // Keep the richer label
      if (d.label.length > existing.label.length) {
        existing.label = d.label;
      }
    } else {
      merged.push({ ...d });
    }
  }

  return merged.sort((a, b) => b.km - a.km);
}
