import { Actor, log } from 'apify';
import { getSupabaseClient, normalizeRaceName, removeDiacritics } from '@race-aggregator/shared';
import { similarity } from './similarity.js';

/**
 * Race deduplication actor.
 *
 * Strategy:
 * 1. Fetch all races from Supabase.
 * 2. Group by date_start — only races on the same day can be duplicates.
 * 3. Within each date group, compare normalized names (stripped of brands,
 *    years, diacritics). If similarity >= threshold, mark as duplicates.
 * 4. Also match on identical website URL as a strong signal.
 * 5. For each duplicate group, keep the "best" record (most filled fields)
 *    and delete the rest.
 */

interface DistanceEntry {
    label: string;
    km: number;
}

interface RaceRow {
    id: string;
    slug: string;
    name: string;
    date_start: string;
    city: string | null;
    website: string | null;
    description: string | null;
    distances: DistanceEntry[];
    price_from: number | null;
    cover_url: string | null;
    logo_url: string | null;
    registration_url: string | null;
    organizer: string | null;
    venue: string | null;
    lat: number | null;
    lng: number | null;
    elevation_gain: number | null;
    capacity: number | null;
    tags: string[];
    source: string | null;
    created_at: string;
}

const SIMILARITY_THRESHOLD = 0.8;
const SUPABASE_PAGE_SIZE = 1000;

/** Count how many "useful" fields a race row has filled in. */
function completenessScore(race: RaceRow): number {
    let score = 0;
    if (race.description) score += 2;
    if (race.website) score += 2;
    if (race.registration_url) score += 1;
    if (race.cover_url) score += 1;
    if (race.logo_url) score += 1;
    if (race.organizer) score += 1;
    if (race.venue) score += 1;
    if (race.lat != null && race.lng != null) score += 2;
    if (race.elevation_gain != null) score += 1;
    if (race.price_from != null) score += 1;
    if (race.capacity != null) score += 1;
    if (race.distances?.length > 0) score += race.distances.length;
    if (race.tags?.length > 0) score += race.tags.length;
    return score;
}

/** Create a normalized key for name comparison. */
function nameKey(name: string): string {
    return removeDiacritics(normalizeRaceName(name))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Normalize URL for comparison (strip protocol, www, trailing slash). */
function normalizeUrl(url: string): string {
    return url
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/+$/, '')
        .toLowerCase();
}

/**
 * Check whether two races have compatible distances.
 * Returns false when we're confident they are distinct events
 * (e.g. "maraton" vs "půlmaraton", 10 km vs 21 km).
 *
 * Rules:
 * - If either race has no distances, we can't tell → compatible.
 * - If both have exactly one distance each, they must be within 20%
 *   of each other to be considered the same event.
 * - If one has multiple distances and the other has one, the single
 *   distance must match at least one in the multi-distance race.
 * - If both have multiple distances and share at least one overlapping
 *   distance, they're compatible (likely the same event listed with
 *   different distance subsets).
 */
function distancesCompatible(a: DistanceEntry[], b: DistanceEntry[]): boolean {
    if (!a?.length || !b?.length) return true;

    const tolerance = 0.20; // 20% tolerance

    const closeEnough = (km1: number, km2: number): boolean => {
        const diff = Math.abs(km1 - km2);
        const max = Math.max(km1, km2);
        return max === 0 || diff / max <= tolerance;
    };

    // Both have exactly one distance → must be close
    if (a.length === 1 && b.length === 1) {
        return closeEnough(a[0].km, b[0].km);
    }

    // Check if there's any overlapping distance
    for (const da of a) {
        for (const db of b) {
            if (closeEnough(da.km, db.km)) return true;
        }
    }

    return false;
}

/**
 * Detect distance-distinguishing keywords in a race name.
 * Returns the keyword if found, so we can compare them between races.
 * E.g. "Hranická dvacítka" → "dvacitka", "Hranická desítka" → "desitka"
 */
const DISTANCE_KEYWORDS: [RegExp, string][] = [
    [/marat[oó]n/i, 'maraton'],
    [/p[uů]lmarat[oó]n|1\/2\s*marat|halfmarat|half\s*marat|polmarat/i, 'pulmaraton'],
    [/ultra/i, 'ultra'],
    [/des[ií]tk/i, 'desitka'],
    [/dvac[ií]tk/i, 'dvacitka'],
    [/p[eě]tk/i, 'petka'],
    [/t[rř]ic[ií]tk/i, 'tricetka'],
    [/stovk/i, 'stovka'],
    [/\b(\d+)\s*km\b/i, 'NUM_KM'],
    [/\b(\d+)\s*h\b/i, 'NUM_H'],
];

function extractDistanceHint(name: string): string | null {
    for (const [pattern, label] of DISTANCE_KEYWORDS) {
        const match = name.match(pattern);
        if (match) {
            if (label === 'NUM_KM') return `${match[1]}km`;
            if (label === 'NUM_H') return `${match[1]}h`;
            return label;
        }
    }
    return null;
}

/**
 * Check if two races should be considered duplicates based on name similarity.
 * Returns false if their names differ only by a distance-related keyword,
 * which strongly suggests they are different events.
 */
function areLikelyDuplicates(raceA: RaceRow, raceB: RaceRow, nameSim: number, threshold: number): boolean {
    if (nameSim < threshold) return false;

    // Check distance hints from names
    const hintA = extractDistanceHint(raceA.name);
    const hintB = extractDistanceHint(raceB.name);

    // If both have distance hints and they differ → different events
    if (hintA && hintB && hintA !== hintB) {
        return false;
    }

    // Check actual distance data compatibility
    if (!distancesCompatible(raceA.distances, raceB.distances)) {
        return false;
    }

    return true;
}

/** Normalize city name for comparison. */
function normalizeCity(city: string): string {
    return removeDiacritics(city).toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Check if two races match on city + compatible distances.
 * Same city + same date + overlapping distances = very likely the same race,
 * even if names are completely different across languages/sources.
 */
function cityDistanceMatch(raceA: RaceRow, raceB: RaceRow): boolean {
    if (!raceA.city || !raceB.city) return false;
    if (!raceA.distances?.length || !raceB.distances?.length) return false;

    if (normalizeCity(raceA.city) !== normalizeCity(raceB.city)) return false;

    // Check distance hints from names — if they conflict, not the same race
    const hintA = extractDistanceHint(raceA.name);
    const hintB = extractDistanceHint(raceB.name);
    if (hintA && hintB && hintA !== hintB) return false;

    return distancesCompatible(raceA.distances, raceB.distances);
}

/**
 * Source priority for tiebreaking when completeness scores are equal.
 * Lower number = higher priority (more authoritative source).
 */
const SOURCE_PRIORITY: Record<string, number> = {
    runczech: 1,     // official organizer
    behej: 2,        // large established aggregator
    ceskybeh: 3,     // comprehensive calendar
    bezeckyzavod: 4, // large database
    svetbehu: 5,     // aggregator
    behejbrno: 6,    // regional
    finishers: 7,    // international, less Czech-specific
    seed: 10,        // test data — lowest priority
};

function sourcePriority(source: string | null): number {
    return SOURCE_PRIORITY[source ?? ''] ?? 8;
}

await Actor.init();

const input = await Actor.getInput<{
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    similarityThreshold?: number;
    dryRun?: boolean;
}>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const threshold = input?.similarityThreshold ?? SIMILARITY_THRESHOLD;
const dryRun = input?.dryRun ?? false;

if (!supabaseUrl || !supabaseServiceKey) {
    log.error('Missing Supabase credentials. Provide supabaseUrl + supabaseServiceKey as input or env vars.');
    await Actor.exit({ exitCode: 1 });
    process.exit(1);
}

process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;

const supabase = getSupabaseClient();

// --- Step 1: Fetch all races ---
log.info('Fetching all races from Supabase...');
const allRaces: RaceRow[] = [];
let offset = 0;

while (true) {
    const { data, error } = await supabase
        .from('races')
        .select('id, slug, name, date_start, city, website, description, distances, price_from, cover_url, logo_url, registration_url, organizer, venue, lat, lng, elevation_gain, capacity, tags, source, created_at')
        .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
        .order('date_start', { ascending: true });

    if (error) {
        log.error(`Failed to fetch races: ${error.message}`);
        await Actor.exit({ exitCode: 1 });
        process.exit(1);
    }

    allRaces.push(...(data as RaceRow[]));
    if (data.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
}

log.info(`Fetched ${allRaces.length} races total.`);

// --- Step 2: Group by date_start ---
const byDate = new Map<string, RaceRow[]>();
for (const race of allRaces) {
    const key = race.date_start;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(race);
}

// --- Step 3: Find duplicates within each date group ---
type DuplicateGroup = { keep: RaceRow; remove: RaceRow[] };
const duplicateGroups: DuplicateGroup[] = [];

for (const [date, races] of byDate) {
    if (races.length < 2) continue;

    // Union-Find to group duplicates
    const parent = races.map((_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const union = (a: number, b: number) => {
        parent[find(a)] = find(b);
    };

    // Compare all pairs
    for (let i = 0; i < races.length; i++) {
        for (let j = i + 1; j < races.length; j++) {
            // Check website match first (strong signal)
            if (races[i].website && races[j].website) {
                if (normalizeUrl(races[i].website!) === normalizeUrl(races[j].website!)) {
                    union(i, j);
                    continue;
                }
            }

            // Check name similarity
            const keyI = nameKey(races[i].name);
            const keyJ = nameKey(races[j].name);

            // Exact normalized name match — still check distances
            if (keyI === keyJ) {
                if (distancesCompatible(races[i].distances, races[j].distances)) {
                    union(i, j);
                }
                continue;
            }

            // Fuzzy match — check name hints + distances
            const sim = similarity(keyI, keyJ);
            if (areLikelyDuplicates(races[i], races[j], sim, threshold)) {
                union(i, j);
                continue;
            }

            // City + distance match — catches cross-language duplicates
            // e.g., "Prague Marathon" vs "Maraton Praha" (same city, same distances, same date)
            if (cityDistanceMatch(races[i], races[j])) {
                log.info(`  City+distance match: "${races[i].name}" ↔ "${races[j].name}" (${races[i].city})`);
                union(i, j);
            }
        }
    }

    // Collect groups
    const groups = new Map<number, number[]>();
    for (let i = 0; i < races.length; i++) {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(i);
    }

    for (const indices of groups.values()) {
        if (indices.length < 2) continue;

        const groupRaces = indices.map((i) => races[i]);

        // Sort by completeness (descending), then source authority, then created_at (earlier = more established)
        groupRaces.sort((a, b) => {
            const scoreDiff = completenessScore(b) - completenessScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            const priorityDiff = sourcePriority(a.source) - sourcePriority(b.source);
            if (priorityDiff !== 0) return priorityDiff;
            return a.created_at.localeCompare(b.created_at);
        });

        const [keep, ...remove] = groupRaces;
        duplicateGroups.push({ keep, remove });

        log.info(`[${date}] Duplicate group: keeping "${keep.name}" (score=${completenessScore(keep)}, source=${keep.source})`);
        for (const r of remove) {
            log.info(`  → removing "${r.name}" (score=${completenessScore(r)}, source=${r.source})`);
        }
    }
}

const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.remove.length, 0);
log.info(`Found ${duplicateGroups.length} duplicate groups, ${totalDuplicates} races to remove.`);

// --- Step 4: Push report to dataset ---
const report = duplicateGroups.map((g) => ({
    kept: { id: g.keep.id, slug: g.keep.slug, name: g.keep.name, source: g.keep.source, score: completenessScore(g.keep) },
    removed: g.remove.map((r) => ({ id: r.id, slug: r.slug, name: r.name, source: r.source, score: completenessScore(r) })),
}));
await Actor.pushData(report);

// --- Step 5: Delete duplicates ---
if (dryRun) {
    log.info('Dry-run mode — no records deleted.');
} else if (totalDuplicates > 0) {
    const idsToDelete = duplicateGroups.flatMap((g) => g.remove.map((r) => r.id));

    // Delete in batches of 100
    const BATCH = 100;
    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += BATCH) {
        const batch = idsToDelete.slice(i, i + BATCH);
        const { error } = await supabase
            .from('races')
            .delete()
            .in('id', batch);

        if (error) {
            log.error(`Delete batch failed: ${error.message}`);
        } else {
            deleted += batch.length;
            log.info(`Deleted batch ${Math.floor(i / BATCH) + 1}: ${batch.length} races`);
        }
    }

    log.info(`Deduplication complete: ${deleted} duplicate races removed.`);
} else {
    log.info('No duplicates found. Database is clean.');
}

await Actor.exit();
