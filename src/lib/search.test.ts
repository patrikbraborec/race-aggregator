import { describe, expect, it } from 'vitest';
import { parseSearchQuery, rankRacesByQuery, normalizeSearchText } from './search';
import type { Race } from './types';

// --- Helper to build minimal Race objects for ranking tests ---

function makeRace(
  overrides: Partial<Race> & Pick<Race, 'name' | 'city'>,
): Race {
  return {
    id: crypto.randomUUID(),
    slug: overrides.name.toLowerCase().replace(/\s+/g, '-'),
    name: overrides.name,
    description: null,
    date_start: '2026-05-01',
    date_end: null,
    time_start: null,
    city: overrides.city,
    region: overrides.region ?? null,
    country: 'CZ',
    lat: null,
    lng: null,
    distances: overrides.distances ?? [],
    terrain: overrides.terrain ?? 'road',
    elevation_gain: null,
    price_from: null,
    price_to: null,
    currency: 'CZK',
    website: null,
    registration_url: null,
    logo_url: null,
    cover_url: null,
    organizer: null,
    organizer_url: null,
    status: 'confirmed',
    source: null,
    source_id: null,
    capacity: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// Realistic race fixtures matching what the DB contains
const RACES = {
  maratonPraha: makeRace({
    name: 'ORLEN Maraton Praha, MČR v maratonu mužů a žen',
    city: 'Praha',
    region: 'Praha',
    distances: [{ label: 'Maraton', km: 42.195 }],
    date_start: '2026-05-03',
  }),
  juniorMaratonPraha: makeRace({
    name: 'Juniorský maraton - Praha a Středočeský kraj',
    city: 'Praha',
    region: 'Praha, Středočeský',
    distances: [{ label: '10 km', km: 10 }],
    date_start: '2026-04-22',
  }),
  pardubickyPulmaraton: makeRace({
    name: 'Pardubický vinařský půlmaratón – Mistrovství ČR v půlmaratonu',
    city: 'Pardubice',
    region: 'Pardubický',
    distances: [{ label: 'Půlmaraton', km: 21.1 }],
    date_start: '2026-04-11',
  }),
  horskyPulmaratonSusice: makeRace({
    name: 'Horský půlmaraton Sušice',
    city: 'Sušice',
    region: 'Plzeňský',
    distances: [
      { label: '30 km', km: 30 },
      { label: 'Půlmaraton', km: 21.1 },
    ],
    terrain: 'trail',
    date_start: '2026-04-11',
  }),
  trailPulmaratonPrahy: makeRace({
    name: 'Trail Running Cup - Půlmaraton okolo Prahy 4',
    city: 'Praha',
    region: 'Praha',
    distances: [{ label: 'Půlmaraton', km: 21.1 }],
    terrain: 'trail',
    date_start: '2026-04-14',
  }),
  urbanChallengePraha: makeRace({
    name: 'Urban Challenge Praha',
    city: 'Praha',
    region: 'Praha',
    distances: [{ label: '10 km', km: 10 }],
    date_start: '2026-04-16',
  }),
  jizerska50: makeRace({
    name: 'Jizerská 50 Trail 2026',
    city: 'Bedřichov',
    region: 'Liberecký',
    distances: [
      { label: '50 km', km: 50 },
      { label: '25 km', km: 25 },
    ],
    terrain: 'trail',
    date_start: '2026-09-12',
  }),
  gladiatorBrno: makeRace({
    name: 'Gladiator Race Brno 2026',
    city: 'Brno',
    region: 'Jihomoravský',
    distances: [
      { label: '12 km', km: 12 },
      { label: '6 km', km: 6 },
    ],
    terrain: 'obstacle',
    date_start: '2026-06-14',
  }),
  vltavaRun: makeRace({
    name: 'Vltava Run 2026',
    city: 'Praha',
    region: 'Praha',
    distances: [
      { label: '350 km', km: 350 },
      { label: '200 km', km: 200 },
    ],
    terrain: 'trail',
    date_start: '2026-08-10',
  }),
  brnoCityRun: makeRace({
    name: 'Brno City Run 2026',
    city: 'Brno',
    region: 'Jihomoravský',
    distances: [
      { label: 'Půlmaraton', km: 21.1 },
      { label: '10 km', km: 10 },
    ],
    date_start: '2026-10-03',
  }),
  krajskyPulmaraton: makeRace({
    name: 'Krajský půlmaraton Plzeňského kraje',
    city: 'Plzeň',
    region: 'Plzeňský',
    distances: [
      { label: 'Půlmaraton', km: 21.1 },
      { label: '10 km', km: 9.99 },
    ],
    date_start: '2026-04-11',
  }),
};

const ALL_RACES = Object.values(RACES);

// ─── normalizeSearchText ───────────────────────────────────────

describe('normalizeSearchText', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeSearchText('Půlmaraton České Budějovice')).toBe(
      'pulmaraton ceske budejovice',
    );
  });

  it('replaces non-alphanum with spaces', () => {
    expect(normalizeSearchText('Trail – Běh (2026)')).toBe('trail beh 2026');
  });
});

// ─── parseSearchQuery (regex fallback) ─────────────────────────

describe('parseSearchQuery', () => {
  it('extracts terrain', () => {
    expect(parseSearchQuery('trail závod').terrain).toBe('trail');
    expect(parseSearchQuery('cross závod').terrain).toBe('cross');
    expect(parseSearchQuery('obstacle race').terrain).toBe('obstacle');
    expect(parseSearchQuery('road race').terrain).toBe('road');
  });

  it('extracts "ultra" as distance (km=50), not terrain', () => {
    const r = parseSearchQuery('ultra běh');
    expect(r.terrain).toBeUndefined();
    expect(r.km).toBe(50);
  });

  it('extracts Czech month names in various declensions', () => {
    expect(parseSearchQuery('něco v lednu').month).toBe(1);
    expect(parseSearchQuery('závod v dubnu').month).toBe(4);
    expect(parseSearchQuery('běh v srpnu').month).toBe(8);
    expect(parseSearchQuery('závod v listopadu').month).toBe(11);
  });

  it('extracts city from Czech locative form', () => {
    expect(parseSearchQuery('závod v Praze').city).toBe('Praha');
    expect(parseSearchQuery('běh v Brně').city).toBe('Brno');
  });

  it('extracts city from nominative form', () => {
    expect(parseSearchQuery('závod Praha').city).toBe('Praha');
    expect(parseSearchQuery('ultra Brno').city).toBe('Brno');
    expect(parseSearchQuery('trail Ostrava').city).toBe('Ostrava');
  });

  it('"ultra Brno" extracts km=50 and city=Brno', () => {
    const r = parseSearchQuery('ultra Brno');
    expect(r.km).toBe(50);
    expect(r.city).toBe('Brno');
    expect(r.terrain).toBeUndefined();
  });

  it('extracts city from genitive form (v okolí X)', () => {
    expect(parseSearchQuery('Ultra v okolí Brna').city).toBe('Brno');
    expect(parseSearchQuery('závod v okolí Prahy').city).toBe('Praha');
    expect(parseSearchQuery('běh blízko Ostravy').city).toBe('Ostrava');
  });

  it('extracts numeric distance', () => {
    expect(parseSearchQuery('závod 10 km').km).toBe(10);
    expect(parseSearchQuery('běh na 5k').km).toBe(5);
  });

  it('extracts named distances', () => {
    expect(parseSearchQuery('půlmaraton v Praze').km).toBe(21);
    expect(parseSearchQuery('maraton v Brně').km).toBe(42);
    expect(parseSearchQuery('desítka v Ostravě').km).toBe(10);
    expect(parseSearchQuery('pětka pro děti').km).toBe(5);
  });

  it('půlmaraton takes priority over maraton', () => {
    expect(parseSearchQuery('půlmaraton').km).toBe(21);
  });

  it('returns searchText with structural tokens stripped', () => {
    // "trail v praze" → terrain=trail, city=Praha, searchText=undefined (nothing left)
    const r1 = parseSearchQuery('trail v praze');
    expect(r1.terrain).toBe('trail');
    expect(r1.city).toBe('Praha');
    expect(r1.searchText).toBeUndefined();

    // "maraton v brně v dubnu" → km=42, city=Brno, month=4, searchText=undefined
    const r2 = parseSearchQuery('maraton v brně v dubnu');
    expect(r2.km).toBe(42);
    expect(r2.city).toBe('Brno');
    expect(r2.month).toBe(4);
    expect(r2.searchText).toBeUndefined();

    // "jizerská trail" → terrain=trail, searchText="jizerska"
    const r3 = parseSearchQuery('jizerská trail');
    expect(r3.terrain).toBe('trail');
    expect(r3.searchText).toBe('jizerska');
  });

  it('strips proximity words (okolí, blízko, nedaleko) from searchText', () => {
    // "Ultra v okolí Brna" → km=50, city=Brno, proximity=true, searchText=undefined
    const r1 = parseSearchQuery('Ultra v okolí Brna');
    expect(r1.km).toBe(50);
    expect(r1.terrain).toBeUndefined();
    expect(r1.city).toBe('Brno');
    expect(r1.proximity).toBe(true);
    expect(r1.searchText).toBeUndefined();

    // "trail blízko Prahy" → terrain=trail, city=Praha, proximity=true, searchText=undefined
    const r2 = parseSearchQuery('trail blízko Prahy');
    expect(r2.terrain).toBe('trail');
    expect(r2.city).toBe('Praha');
    expect(r2.proximity).toBe(true);
    expect(r2.searchText).toBeUndefined();

    // "závod nedaleko Ostravy" → city=Ostrava, proximity=true, searchText="zavod"
    const r3 = parseSearchQuery('závod nedaleko Ostravy');
    expect(r3.city).toBe('Ostrava');
    expect(r3.proximity).toBe(true);
    expect(r3.searchText).toBe('zavod');
  });

  it('detects proximity keywords and sets proximity flag', () => {
    expect(parseSearchQuery('závody okolo Brna').proximity).toBe(true);
    expect(parseSearchQuery('běh v okolí Prahy').proximity).toBe(true);
    expect(parseSearchQuery('trail poblíž Ostravy').proximity).toBe(true);
    expect(parseSearchQuery('závody blízko Plzně').proximity).toBe(true);
    expect(parseSearchQuery('nedaleko Liberce').proximity).toBe(true);
  });

  it('does NOT set proximity for bare city names', () => {
    expect(parseSearchQuery('závod v Praze').proximity).toBeUndefined();
    expect(parseSearchQuery('trail Brno').proximity).toBeUndefined();
    expect(parseSearchQuery('maraton Praha').proximity).toBeUndefined();
  });

  it('does NOT set proximity without a recognized city', () => {
    expect(parseSearchQuery('závody okolo').proximity).toBeUndefined();
    expect(parseSearchQuery('blízko něčeho').proximity).toBeUndefined();
  });
});

// ─── rankRacesByQuery ──────────────────────────────────────────

describe('rankRacesByQuery', () => {
  // --- 1. Maraton Praha (the original bug) ---

  it('"Maraton Praha" — ORLEN Maraton Praha ranks first', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Maraton Praha');
    expect(results[0].name).toContain('ORLEN Maraton Praha');
  });

  it('"Maraton Praha" — does NOT include Pardubice půlmaraton', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Maraton Praha');
    const names = results.map((r) => r.name);
    expect(names).not.toContain(RACES.pardubickyPulmaraton.name);
  });

  it('"Maraton Praha" — does NOT include Horský půlmaraton Sušice', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Maraton Praha');
    const names = results.map((r) => r.name);
    expect(names).not.toContain(RACES.horskyPulmaratonSusice.name);
  });

  // --- 2. Word-boundary: "maraton" vs "půlmaraton" ---

  it('"maraton" does NOT match "půlmaraton" (word boundary)', () => {
    const pulmaratonOnly = [RACES.pardubickyPulmaraton, RACES.horskyPulmaratonSusice];
    const results = rankRacesByQuery(pulmaratonOnly, 'maraton');
    expect(results).toHaveLength(0);
  });

  // --- 3. All tokens must match ---

  it('"Maraton Praha" excludes races matching only one token', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Maraton Praha');
    // Every result must contain both "maraton" and "praha" somewhere in name/city/region
    for (const race of results) {
      const text = normalizeSearchText(
        [race.name, race.city, race.region ?? ''].join(' '),
      );
      expect(text).toContain('maraton');
      expect(text).toContain('praha');
    }
  });

  // --- 4. Full phrase match scores higher ---

  it('full phrase match in name ranks above token-only match', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Maraton Praha');
    // ORLEN has "maraton praha" as a full phrase; Juniorský has them as separate tokens
    const orlenIdx = results.findIndex((r) => r.name.includes('ORLEN'));
    const juniorIdx = results.findIndex((r) => r.name.includes('Juniorský'));
    expect(orlenIdx).toBeLessThan(juniorIdx);
  });

  // --- 5. City-only search ---

  it('"Praha" returns only races in Praha', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Praha');
    for (const race of results) {
      const text = normalizeSearchText(
        [race.name, race.city, race.region ?? ''].join(' '),
      );
      expect(text).toContain('praha');
    }
    expect(results.length).toBeGreaterThan(0);
  });

  // --- 6. Partial race name ---

  it('"Jizerská" finds Jizerská 50', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Jizerská');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Jizerská 50');
  });

  // --- 7. Brno search ---

  it('"Brno" returns Brno races, not Pardubice ones', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Brno');
    const names = results.map((r) => r.name);
    expect(names).toContain(RACES.gladiatorBrno.name);
    expect(names).toContain(RACES.brnoCityRun.name);
    expect(names).not.toContain(RACES.pardubickyPulmaraton.name);
  });

  // --- 8. Empty / whitespace query ---

  it('empty query returns all races sorted by date', () => {
    const results = rankRacesByQuery(ALL_RACES, '');
    expect(results).toHaveLength(ALL_RACES.length);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].date_start >= results[i - 1].date_start).toBe(true);
    }
  });

  it('whitespace-only query returns all races', () => {
    const results = rankRacesByQuery(ALL_RACES, '   ');
    expect(results).toHaveLength(ALL_RACES.length);
  });

  // --- 9. No matches ---

  it('returns empty array when nothing matches', () => {
    const results = rankRacesByQuery(ALL_RACES, 'neexistující závod xyz');
    expect(results).toHaveLength(0);
  });

  // --- 10. "Ultra v okolí Brna" (text ranking — "ultra" is now a distance filter, not terrain) ---

  it('"ultra Brno" does not text-match Vltava Run (which is in Praha)', () => {
    const results = rankRacesByQuery(ALL_RACES, 'ultra Brno');
    const names = results.map((r) => r.name);
    expect(names).not.toContain(RACES.vltavaRun.name);
  });

  // --- 11. Multi-word race name ---

  it('"Urban Challenge" finds Urban Challenge Praha', () => {
    const results = rankRacesByQuery(ALL_RACES, 'Urban Challenge');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Urban Challenge');
  });
});
