import { createCheerioRouter, log } from 'crawlee';
import type { CheerioCrawlingContext } from 'crawlee';
import {
    generateSlug,
    parseDistances,
    mapTerrain,
    getRegion,
    type RaceInput,
} from '@race-aggregator/shared';

export const collectedRaces: RaceInput[] = [];

export const router = createCheerioRouter();

/**
 * Shape of a single race object from the behej.com JSON API.
 */
interface BehejRace {
    id_races_list: string;
    name: string;
    date_of_race: string;       // e.g. "2026-03-29 00:00:00"
    place_of_race: string;      // city name
    variants: string;           // e.g. "8,4 / 5,9 km"
    latitude: string;           // e.g. "48.87440137433051"
    longitude: string;          // e.g. "16.076393367736504"
    type_name: string;          // e.g. "5-15 km", "maraton", "ultra"
    sport_name: string;         // e.g. "běh"
    cup_name: string | null;    // series name or null
}

// ── API response handler ────────────────────────────────────────────────────

router.addHandler('API', async ({ body }: CheerioCrawlingContext) => {
    log.info('Processing behej.com API response...');

    let races: BehejRace[];
    try {
        races = JSON.parse(body.toString());
    } catch (err) {
        log.error('Failed to parse API response as JSON.', { error: String(err) });
        return;
    }

    if (!Array.isArray(races)) {
        log.error('API response is not an array.', { type: typeof races });
        return;
    }

    log.info(`Parsed ${races.length} race objects from API.`);

    for (const raw of races) {
        try {
            // Parse date: extract "2026-03-29" from "2026-03-29 00:00:00"
            const dateStart = raw.date_of_race?.split(' ')[0] ?? null;
            if (!dateStart || !/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) {
                log.warning(`Invalid date for race "${raw.name}": "${raw.date_of_race}". Skipping.`);
                continue;
            }

            const name = raw.name?.trim();
            if (!name) {
                log.warning(`Empty name for race ID ${raw.id_races_list}. Skipping.`);
                continue;
            }

            // Parse city
            const city = raw.place_of_race?.trim() ?? '';
            if (!city) {
                log.warning(`No city for race "${name}". Skipping.`);
                continue;
            }

            // Parse lat/lng from strings
            const lat = raw.latitude ? parseFloat(raw.latitude) : null;
            const lng = raw.longitude ? parseFloat(raw.longitude) : null;

            // Parse distances from variants text (e.g. "8,4 / 5,9 km")
            const distances = raw.variants
                ? parseDistances(raw.variants)
                : [];

            // Map terrain from type_name
            const terrain = raw.type_name
                ? mapTerrain(raw.type_name)
                : (distances.length > 0 ? mapTerrain('') : 'road');

            // Generate slug
            const slug = generateSlug(name, dateStart);

            // Look up region from city
            const region = getRegion(city);

            // Build tags
            const tags: string[] = ['behej'];
            if (raw.cup_name) {
                tags.push(raw.cup_name);
            }

            // Construct website URL
            const website = `https://www.behej.com/zavod/${raw.id_races_list}`;

            const race: RaceInput = {
                slug,
                name,
                date_start: dateStart,
                date_end: null,
                time_start: null,
                city,
                region,
                country: 'CZ',
                lat: lat && !isNaN(lat) ? lat : null,
                lng: lng && !isNaN(lng) ? lng : null,
                distances: distances.length > 0 ? distances : [{ label: 'Neuvedeno', km: 0 }],
                terrain,
                website,
                registration_url: null,
                cover_url: null,
                organizer: null,
                organizer_url: null,
                status: 'confirmed',
                source: 'behej',
                source_id: raw.id_races_list,
                capacity: null,
                tags,
            };

            collectedRaces.push(race);
        } catch (err) {
            log.warning(`Error processing race "${raw.name}": ${String(err)}`);
        }
    }

    log.info(`Collected ${collectedRaces.length} valid races from behej.com API.`);
});

// ── DEFAULT handler (fallback) ──────────────────────────────────────────────

router.addDefaultHandler(async ({ request }: CheerioCrawlingContext) => {
    log.warning(`Unhandled route: ${request.url}`);
});
