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
  [/\b(?:praha|prahy|prahu|praze)\b/i, 'Praha'],
  [/\b(?:brno|brna|brnu|brne)\b/i, 'Brno'],
  [/\b(?:ostrava|ostravy|ostravu|ostrave)\b/i, 'Ostrava'],
  [/\b(?:plzen|plzne|plzni)\b/i, 'Plzeň'],
  [/\b(?:liberec|liberce|liberci)\b/i, 'Liberec'],
  [/\b(?:olomouc|olomouce|olomouci)\b/i, 'Olomouc'],
  [/\b(?:ceske budejovice|ceskych budejovic|ceskych budejovicich)\b/i, 'České Budějovice'],
  [/\b(?:hradec kralove|hradce kralove|hradci kralove)\b/i, 'Hradec Králové'],
  [/\b(?:pardubice|pardubic|pardubicich)\b/i, 'Pardubice'],
  [/\b(?:usti nad labem)\b/i, 'Ústí nad Labem'],
  [/\b(?:karlovy vary|karlovych var|karlovych varech)\b/i, 'Karlovy Vary'],
  [/\b(?:zlin|zlina|zlinu|zline)\b/i, 'Zlín'],
  [/\b(?:jihlava|jihlavy|jihlavu|jihlave)\b/i, 'Jihlava'],
  [/\b(?:kladno|kladna|kladnu|kladne)\b/i, 'Kladno'],
  [/\b(?:opava|opavy|opavu|opave)\b/i, 'Opava'],
  [/\b(?:frydek mistek|frydku mistku)\b/i, 'Frýdek-Místek'],
  [/\b(?:karvina|karvine)\b/i, 'Karviná'],
  [/\b(?:trebic|trebice|trebici)\b/i, 'Třebíč'],
  [/\b(?:prostejov|prostejova|prostejovu|prostejove)\b/i, 'Prostějov'],
  [/\b(?:pribram|pribrami)\b/i, 'Příbram'],
];

const TERRAIN_PATTERNS: [RegExp, TerrainType][] = [
  [/\b(?:trail|traily|trialy|trailovy|trailove|trailových|trailovych|teren|terén)\b/i, 'trail'],
  [/\b(?:cross|kros|prespolni|přespolní)\b/i, 'cross'],
  [/\b(?:prekazk|překážk|obstacle|spartan)\b/i, 'obstacle'],
  [/\b(?:silnic|asfalt|road|mestsk|městsk)\b/i, 'road'],
];

const ULTRA_PATTERN = /\bultra\b/i;

const PROXIMITY_PATTERN = /\b(?:okolo|okoli|pobliz|blizko|nedaleko)\b/i;

export interface ParsedSearchQuery {
  displayQuery: string;
  /** Query text with recognised structural tokens (terrain, city, month, km) stripped out. */
  searchText?: string;
  terrain?: TerrainType;
  city?: string;
  month?: number;
  km?: number;
  /** Whether the user wants races *around* a city (okolo, blízko, nedaleko, poblíž, v okolí). */
  proximity?: boolean;
}

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const displayQuery = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  // We'll collect regex patterns that matched so we can strip them from the
  // query to produce a clean searchText for text-ranking.
  const consumedPatterns: RegExp[] = [];

  let terrain: TerrainType | undefined;
  for (const [pattern, t] of TERRAIN_PATTERNS) {
    if (pattern.test(displayQuery)) { terrain = t; consumedPatterns.push(pattern); break; }
  }

  // "ultra" → distance filter (50+ km), not terrain
  let ultraMatch = false;
  if (ULTRA_PATTERN.test(displayQuery)) {
    ultraMatch = true;
    consumedPatterns.push(ULTRA_PATTERN);
  }

  let month: number | undefined;
  for (const [pattern, m] of MONTH_PATTERNS) {
    if (pattern.test(displayQuery)) { month = m; consumedPatterns.push(pattern); break; }
  }

  const normalized = normalizeSearchText(displayQuery);
  let city: string | undefined;
  for (const [pattern, c] of CITY_PATTERNS) {
    if (pattern.test(normalized)) { city = c; consumedPatterns.push(pattern); break; }
  }

  // Proximity detection: only meaningful when a city was found
  const proximity = city !== undefined && PROXIMITY_PATTERN.test(normalized);
  if (proximity) consumedPatterns.push(PROXIMITY_PATTERN);

  let km: number | undefined;
  const kmPatterns: RegExp[] = [
    /\b\d{1,3}\s*(?:km|k)\b/i,
    /\bpulmaraton|pulmaratonu|pulku|pulka\b/,
    /\bmaraton|maratonu\b/,
    /\bdesitka|desitku|desitce\b/,
    /\bpetka|petku|petce\b/,
  ];
  const numericMatch = normalized.match(/\b(\d{1,3})\s*(?:km|k)\b/);
  if (numericMatch) {
    km = Number.parseInt(numericMatch[1], 10);
    consumedPatterns.push(kmPatterns[0]);
  } else if (/\bpulmaraton|pulmaratonu|pulku|pulka\b/.test(normalized)) {
    km = 21; consumedPatterns.push(kmPatterns[1]);
  } else if (/\bmaraton|maratonu\b/.test(normalized)) {
    km = 42; consumedPatterns.push(kmPatterns[2]);
  } else if (/\bdesitka|desitku|desitce\b/.test(normalized)) {
    km = 10; consumedPatterns.push(kmPatterns[3]);
  } else if (/\bpetka|petku|petce\b/.test(normalized)) {
    km = 5; consumedPatterns.push(kmPatterns[4]);
  }

  // "ultra" sets km=50 (ultra distance filter) when no explicit distance was parsed
  if (ultraMatch && km === undefined) {
    km = 50;
  }

  // Build searchText by stripping consumed structural tokens and filler words
  let searchText = normalized;
  for (const pattern of consumedPatterns) {
    searchText = searchText.replace(pattern, ' ');
  }
  // Remove common Czech prepositions left orphaned after stripping
  searchText = searchText.replace(/\b(?:[vksuoz]|okoli|blizko|nedaleko|pobliz)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const cleanedSearchText = searchText || undefined;

  return { displayQuery, searchText: cleanedSearchText, terrain, city, month, km, proximity: proximity || undefined };
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

/** Word-boundary match — "maraton" must NOT match inside "pulmaraton". */
function wordMatch(haystack: string, needle: string): boolean {
  const re = new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
  return re.test(haystack);
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
    let matchedTokens = 0;

    // Full phrase match — bonus scales with how early the phrase appears
    if (normalizedQuery.length >= 3 && raceName.includes(normalizedQuery)) {
      const pos = raceName.indexOf(normalizedQuery);
      score += 10 + Math.max(0, 5 - Math.floor(pos / 3));
    } else if (normalizedQuery.length >= 3 && raceText.includes(normalizedQuery)) {
      score += 6;
    }

    // Per-token scoring with word-boundary matching
    for (const token of queryTokens) {
      if (wordMatch(raceName, token)) {
        score += 4;
        matchedTokens++;
      } else if (wordMatch(raceText, token)) {
        score += 2;
        matchedTokens++;
      }
    }

    // Require all query tokens to match somewhere
    if (matchedTokens < queryTokens.length) {
      score = 0;
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
