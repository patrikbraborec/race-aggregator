import type { Race, TerrainType } from './types';

const MAX_QUERY_LENGTH = 200;

// --- Regex fallback parser (used when LLM is unavailable) ---

const MONTH_PATTERNS: [RegExp, number][] = [
  [/\b(?:leden|lednu|ledna)\b/i, 1],
  [/\b(?:unor|unora|únor|února)\b/i, 2],
  [/\b(?:brezen|breznu|brezna|březen|březnu|března)\b/i, 3],
  [/\b(?:duben|dubnu|dubna)\b/i, 4],
  [/\b(?:kveten|kvetnu|kvetna|květen|květnu|května)\b/i, 5],
  [/\b(?:cerven|cervnu|cervna|červen|červnu|června)\b/i, 6],
  [/\b(?:cervenec|cervenci|cervence|červenec|červenci|července)\b/i, 7],
  [/\b(?:srpen|srpnu|srpna)\b/i, 8],
  [/\b(?:zari|září)\b/i, 9],
  [/\b(?:rijen|rijnu|rijna|říjen|říjnu|října)\b/i, 10],
  [/\b(?:listopad|listopadu)\b/i, 11],
  [/\b(?:prosinec|prosinci|prosince)\b/i, 12],
];

const CITY_PATTERNS: [RegExp, string][] = [
  [/\bpraze\b/i, 'Praha'],
  [/\bbrne\b/i, 'Brno'],
  [/\bostrave\b/i, 'Ostrava'],
  [/\bplzni\b/i, 'Plzeň'],
  [/\bliberci\b/i, 'Liberec'],
  [/\bolomouci\b/i, 'Olomouc'],
  [/\bceskych budejovicich\b/i, 'České Budějovice'],
  [/\bhradci kralove\b/i, 'Hradec Králové'],
  [/\bpardubicich\b/i, 'Pardubice'],
  [/\busti nad labem\b/i, 'Ústí nad Labem'],
  [/\bkarlovych varech\b/i, 'Karlovy Vary'],
  [/\bzline\b/i, 'Zlín'],
  [/\bjihlave\b/i, 'Jihlava'],
  [/\bkladne\b/i, 'Kladno'],
  [/\bopave\b/i, 'Opava'],
  [/\bfrydku mistku\b/i, 'Frýdek-Místek'],
  [/\bkarvine\b/i, 'Karviná'],
  [/\btrebici\b/i, 'Třebíč'],
  [/\bprostejove\b/i, 'Prostějov'],
  [/\bpribrami\b/i, 'Příbram'],
];

const TERRAIN_PATTERNS: [RegExp, TerrainType][] = [
  [/\bultra\b/i, 'ultra'],
  [/\b(?:trail|traily|trialy|trailovy|trailove|trailových|trailovych|teren|terén)\b/i, 'trail'],
  [/\b(?:cross|kros|prespolni|přespolní)\b/i, 'cross'],
  [/\b(?:prekazk|překážk|obstacle|spartan)\b/i, 'obstacle'],
  [/\b(?:silnic|asfalt|road|mestsk|městsk)\b/i, 'road'],
];

export interface ParsedSearchQuery {
  displayQuery: string;
  terrain?: TerrainType;
  city?: string;
  month?: number;
  km?: number;
}

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const displayQuery = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  let terrain: TerrainType | undefined;
  for (const [pattern, t] of TERRAIN_PATTERNS) {
    if (pattern.test(displayQuery)) { terrain = t; break; }
  }

  let month: number | undefined;
  for (const [pattern, m] of MONTH_PATTERNS) {
    if (pattern.test(displayQuery)) { month = m; break; }
  }

  const normalized = normalizeSearchText(displayQuery);
  let city: string | undefined;
  for (const [pattern, c] of CITY_PATTERNS) {
    if (pattern.test(normalized)) { city = c; break; }
  }

  let km: number | undefined;
  const numericMatch = normalized.match(/\b(\d{1,3})\s*(?:km|k)\b/);
  if (numericMatch) {
    km = Number.parseInt(numericMatch[1], 10);
  } else if (/\bpulmaraton|pulmaratonu|pulku|pulka\b/.test(normalized)) {
    km = 21;
  } else if (/\bmaraton|maratonu\b/.test(normalized)) {
    km = 42;
  } else if (/\bdesitka|desitku|desitce\b/.test(normalized)) {
    km = 10;
  } else if (/\bpetka|petku|petce\b/.test(normalized)) {
    km = 5;
  }

  return { displayQuery, terrain, city, month, km };
}

// --- Text ranking (used after structured filters are applied) ---

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeSearchText(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function getRaceText(race: Race): string {
  return normalizeSearchText(
    [race.name, race.city, race.region ?? ''].join(' '),
  );
}

function compareByDate(a: Race, b: Race): number {
  return a.date_start.localeCompare(b.date_start);
}

export function rankRacesByQuery(races: Race[], query: string): Race[] {
  const trimmed = query?.trim();
  if (!trimmed) return [...races].sort(compareByDate);

  const normalizedQuery = normalizeSearchText(trimmed);
  const queryTokens = tokenize(trimmed);

  if (queryTokens.length === 0) return [...races].sort(compareByDate);

  const scored = races.map((race) => {
    const raceText = getRaceText(race);
    const raceName = normalizeSearchText(race.name);
    let score = 0;

    // Full phrase match in race name — strongest signal
    if (normalizedQuery.length >= 3 && raceName.includes(normalizedQuery)) {
      score += 10;
    } else if (normalizedQuery.length >= 3 && raceText.includes(normalizedQuery)) {
      score += 6;
    }

    // Per-token scoring
    for (const token of queryTokens) {
      if (raceName.includes(token)) {
        score += 4;
      } else if (raceText.includes(token)) {
        score += 2;
      }
    }

    return { race, score };
  });

  // Include any race with a non-zero score
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareByDate(a.race, b.race);
    })
    .map((entry) => entry.race);
}
