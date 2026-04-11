import type { RawScrapedItem, NormalizedItem, SourceName, TerrainType, RaceDistance } from './types.js';

// ── Text normalization (mirrors src/lib/search.ts:normalizeSearchText) ──

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── Date normalization ──

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CZECH_MONTHS: Record<string, string> = {
  'ledna': '01', 'února': '02', 'března': '03', 'dubna': '04',
  'května': '05', 'června': '06', 'července': '07', 'srpna': '08',
  'září': '09', 'října': '10', 'listopadu': '11', 'prosince': '12',
};

export function normalizeDate(raw: string): string | null {
  // Handle date ranges: take the start date
  // "11. září 2026 – 12. září 2026" → "11. září 2026"
  // "06.06.2026–06.06.2026" → "06.06.2026"
  // Only split on en-dash/em-dash (not regular hyphen which appears in ISO dates)
  const trimmed = raw.trim().split(/\s*[–—]\s*(?=\d)/)[0].trim();

  if (ISO_DATE_RE.test(trimmed)) return trimmed;

  // DD.MM.YYYY or D.M.YYYY (with optional spaces)
  const dotMatch = trimmed.replace(/\s/g, '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Czech format: "1. května 2026" or "11. září 2026"
  const czechMatch = trimmed.match(/^(\d{1,2})\.\s*(\S+)\s+(\d{4})$/);
  if (czechMatch) {
    const [, d, monthName, y] = czechMatch;
    const m = CZECH_MONTHS[monthName.toLowerCase()];
    if (m) {
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }

  return null;
}

// ── Distance parsing ──

/**
 * Parses raw distance strings like "8,8 km", "10 km / 5 km", "5/12/30/21,1 km"
 * into structured [{label, km}] arrays.
 */
export function parseDistances(raw: string): RaceDistance[] {
  if (!raw.trim()) return [];

  // Split on " / " or "/" (when followed by a number)
  const segments = raw.split(/\s*\/\s*(?=\d)/).map(s => s.trim()).filter(Boolean);
  const results: RaceDistance[] = [];

  for (const seg of segments) {
    // Skip time-based values ("60 minut", "1 hodina") and non-distance labels
    if (/minut|hodin|hod\b/i.test(seg)) continue;
    if (/štafet/i.test(seg) && !/km/i.test(seg)) continue;

    const kmMatch = seg.match(/(\d+[.,]?\d*)\s*(km|míle|mil)?/i);
    if (!kmMatch) continue;

    let value = parseFloat(kmMatch[1].replace(',', '.'));
    const unit = kmMatch[2]?.toLowerCase();

    if (unit === 'míle' || unit === 'mil') {
      value = Math.round(value * 1.609 * 10) / 10;
    }

    if (value <= 0 || isNaN(value)) continue;

    // Clean up the label: strip trailing "km", "+", whitespace
    const label = seg.replace(/\s*\+?\s*$/, '').trim();
    results.push({ label, km: Math.round(value * 100) / 100 });
  }

  // Deduplicate by km value (within 0.1 km tolerance)
  const deduped: RaceDistance[] = [];
  for (const d of results) {
    if (!deduped.some(existing => Math.abs(existing.km - d.km) < 0.1)) {
      deduped.push(d);
    }
  }

  return deduped.sort((a, b) => b.km - a.km);
}

// ── Surface → Terrain mapping ──

const TERRAIN_KEYWORDS: [RegExp, TerrainType][] = [
  [/ocr/i, 'obstacle'],
  [/překáž/i, 'obstacle'],
  [/trail/i, 'trail'],
  [/kros/i, 'trail'],
  [/terén/i, 'trail'],
  [/přírod/i, 'trail'],
  [/vrchu/i, 'trail'],
  [/dráha/i, 'road'],
  [/silnic/i, 'road'],
  [/asfalt/i, 'road'],
  [/smíšen/i, 'mixed'],
  [/štafet/i, 'mixed'],
  [/jiný/i, 'mixed'],
];

export function normalizeSurface(raw: string, distances: RaceDistance[]): TerrainType {
  const s = raw.trim();

  if (!s) return 'road';

  // Mixed surfaces: "silnice/asfalt, terén" has both road and trail → mixed
  const hasRoad = /silnic|asfalt/i.test(s);
  const hasTrail = /terén/i.test(s);
  if (hasRoad && hasTrail) return 'mixed';

  for (const [pattern, terrain] of TERRAIN_KEYWORDS) {
    if (pattern.test(s)) return terrain;
  }

  return 'road';
}

// ── Time normalization ──

export function normalizeTime(raw: string): string | null {
  if (!raw.trim()) return null;

  // Replace dot separators: "10.30" → "10:30"
  const cleaned = raw.replace(/(\d{1,2})\.(\d{2})(?!\d)/, '$1:$2');

  // Extract first HH:MM pattern
  const match = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  if (h === 0 && m === 0) return null;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── City normalization ──

const VENUE_PREFIXES = /^(autokempink|areál|stadion|sportovní areál|ski areál|centrum|hotel|restaurace|sportcentrum|koupaliště|park|hřiště|louka)\s+/i;

export function normalizeCity(raw: string): string {
  let city = raw.trim();
  if (!city) return city;

  // Strip parenthetical info: "Radonice (Praha - východ)" → "Radonice"
  city = city.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Strip venue prefixes
  city = city.replace(VENUE_PREFIXES, '').trim();

  // If it looks like a compound route ("X-Y-Z-W" with 3+ segments), take first
  const dashParts = city.split(/\s*-\s*/);
  if (dashParts.length >= 3 && dashParts.every(p => p.length < 20)) {
    city = dashParts[0];
  }

  // Strip trailing district numbers: "Praha 6" → "Praha"
  // But only for well-known cities
  city = city.replace(/^(Praha)\s+\d+$/i, '$1');

  return city.trim();
}

// ── Region normalization ──

const REGION_MAP: Record<string, string> = {
  'hlavní město praha': 'Praha',
  'praha': 'Praha',
  'středočeský kraj': 'Středočeský',
  'středočeský': 'Středočeský',
  'jihomoravský kraj': 'Jihomoravský',
  'jihomoravský': 'Jihomoravský',
  'moravskoslezský kraj': 'Moravskoslezský',
  'moravskoslezský': 'Moravskoslezský',
  'olomoucký kraj': 'Olomoucký',
  'olomoucký': 'Olomoucký',
  'olomouc': 'Olomoucký',
  'liberecký kraj': 'Liberecký',
  'liberecký': 'Liberecký',
  'královéhradecký kraj': 'Královéhradecký',
  'královéhradecký': 'Královéhradecký',
  'plzeňský kraj': 'Plzeňský',
  'plzeňský': 'Plzeňský',
  'pardubický kraj': 'Pardubický',
  'pardubický': 'Pardubický',
  'ústecký kraj': 'Ústecký',
  'ústecký': 'Ústecký',
  'jihočeský kraj': 'Jihočeský',
  'jihočeský': 'Jihočeský',
  'karlovarský kraj': 'Karlovarský',
  'karlovarský': 'Karlovarský',
  'zlínský kraj': 'Zlínský',
  'zlínský': 'Zlínský',
  'vysočina': 'Vysočina',
};

/** Non-CZ regions to filter out. */
const FOREIGN_REGIONS = new Set([
  'slovensko', 'rakousko', 'španělsko', 'itálie', 'ostatní',
  'bratislavský kraj', 'bratislavský',
  'žilinský', 'žilinský kraj',
  'trnavský kraj', 'trnavský',
  'trenčiansky kraj', 'trenčiansky',
  'prešovský kraj', 'prešovský',
  'košický kraj', 'košický',
  'banskobystrický kraj', 'banskobystrický',
  'nitriansky kraj', 'nitriansky',
]);

export function normalizeRegion(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return REGION_MAP[key] ?? null;
}

export function isForeignRegion(raw: string): boolean {
  return FOREIGN_REGIONS.has(raw.trim().toLowerCase());
}

// ── Website / URL normalization ──

export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    // Return clean URL without trailing slash
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Normalize URL for dedup comparison: strip protocol, www, trailing slash, lowercase. */
export function normalizeUrlForDedup(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

// ── Fee parsing ──

export function parseFee(raw: string): number | null {
  if (!raw.trim()) return null;

  const lower = raw.toLowerCase();
  if (lower.includes('dobrovolné') || lower.includes('neplatí') || lower.includes('zdarma')) {
    return 0;
  }

  // Match first number, handling "1 800" (space-separated thousands) and "1500,-"
  const match = raw.match(/(\d[\d\s]*\d|\d+)/);
  if (!match) return null;

  const value = parseInt(match[1].replace(/\s/g, ''), 10);
  return isNaN(value) ? null : value;
}

// ── Organizer extraction (from behej contact field) ──

export function extractOrganizer(contact: string): string | null {
  if (!contact.trim()) return null;

  const nameMatch = contact.match(/Jméno:\s*([^\n]+)/);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (name) return name;
  }

  return null;
}

// ── Main normalization function ──

export let badDateCount = 0;

export function normalizeItem(raw: RawScrapedItem, source: SourceName): NormalizedItem | null {
  const date = normalizeDate(raw.date);
  if (!date) {
    badDateCount++;
    return null;
  }

  // Filter out foreign races
  if (isForeignRegion(raw.region)) return null;

  const distances = parseDistances(raw.distance);
  const terrain = normalizeSurface(raw.surface, distances);
  const website = normalizeWebsite(raw.website);
  const priceFrom = parseFee(raw.feePreRegistration) ?? parseFee(raw.feeOnSite);
  const priceTo = parseFee(raw.feeOnSite) ?? parseFee(raw.feePreRegistration);

  return {
    source,
    sourceUrl: raw.url,
    title: raw.title.trim(),
    date,
    city: normalizeCity(raw.city),
    district: raw.district?.trim() ?? '',
    region: normalizeRegion(raw.region) ?? '',
    distances,
    terrain,
    startTime: normalizeTime(raw.startTime),
    startPlace: raw.startPlace?.trim() ?? '',
    registrationPlace: raw.registrationPlace?.trim() ?? '',
    description: raw.description?.trim() ?? '',
    website,
    contact: raw.contact?.trim() ?? '',
    facebook: raw.facebook?.trim() ?? '',
    cup: raw.cup?.trim() ?? '',
    rewards: raw.rewards?.trim() ?? '',
    edition: raw.edition?.trim() ?? '',
    priceFrom,
    priceTo,
  };
}
