import type { TerrainType, RaceDistance } from './types.js';

/** Czech month names -> 1-indexed month number. */
const CZECH_MONTHS: Record<string, number> = {
  ledna: 1, únor: 2, února: 2, března: 3, březen: 3,
  dubna: 4, duben: 4, května: 5, květen: 5, června: 6,
  červen: 6, července: 7, červenec: 7, srpna: 8, srpen: 8,
  září: 9, října: 10, říjen: 10, listopadu: 11, listopad: 11,
  prosince: 12, prosinec: 12,
};

/**
 * Parse a Czech date string into ISO YYYY-MM-DD.
 * Handles: "10. 5. 2026", "10.5.2026", "10. května 2026", "2026-05-10"
 */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // "10. 5. 2026" or "10.5.2026"
  const numericMatch = trimmed.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // "10. května 2026"
  const namedMatch = trimmed.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4})/);
  if (namedMatch) {
    const [, day, monthName, year] = namedMatch;
    const month = CZECH_MONTHS[monthName.toLowerCase()];
    if (month) {
      return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parse a time string into HH:MM format.
 * Handles: "9:00", "09.00", "9.30 hod", "09:00:00"
 */
export function parseTime(raw: string): string | null {
  const match = raw.trim().match(/(\d{1,2})[:.:](\d{2})/);
  if (!match) return null;
  const [, h, m] = match;
  return `${h.padStart(2, '0')}:${m}`;
}

/**
 * Parse distance strings into structured RaceDistance array.
 * Handles: "42,195 km", "Maraton (42 km), 10 km", "21.1km", "5 km / 10 km"
 */
export function parseDistances(raw: string): RaceDistance[] {
  const distances: RaceDistance[] = [];

  // Split on common separators: comma, slash, semicolon, pipe, newline
  const parts = raw.split(/[,;|\/\n]+/).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    // Extract numeric km value
    const kmMatch = part.match(/(\d+[.,]?\d*)\s*km/i);
    if (!kmMatch) continue;

    const km = parseFloat(kmMatch[1].replace(',', '.'));
    if (isNaN(km) || km <= 0) continue;

    // Use the full part as label, cleaned up
    let label = part.replace(/[()]/g, '').trim();

    // If label is just the number + km, create a readable label
    if (/^\d+[.,]?\d*\s*km$/i.test(label)) {
      label = `${km} km`;
    }

    // Map well-known distances to standard labels
    if (km >= 42 && km <= 42.3) label = 'Maraton';
    else if (km >= 21 && km <= 21.2) label = 'Půlmaraton';

    distances.push({ label, km });
  }

  return distances;
}

/** Map Czech terrain descriptions to our terrain enum. */
const TERRAIN_KEYWORDS: [RegExp, TerrainType][] = [
  [/ultra/i, 'ultra'],
  [/trail|terén|teren/i, 'trail'],
  [/cross|přespolní|kros/i, 'cross'],
  [/překážk|obstacle/i, 'obstacle'],
  [/silni[cč]|asfalt|road|městsk|cest/i, 'road'],
];

export function mapTerrain(raw: string): TerrainType {
  for (const [pattern, terrain] of TERRAIN_KEYWORDS) {
    if (pattern.test(raw)) return terrain;
  }
  return 'road'; // default
}

/**
 * Infer terrain from distances when no explicit terrain is given.
 */
export function inferTerrain(distances: RaceDistance[]): TerrainType {
  const maxKm = Math.max(...distances.map((d) => d.km), 0);
  if (maxKm >= 80) return 'ultra';
  if (maxKm >= 42.195) return 'road'; // marathons are typically road
  return 'road';
}
