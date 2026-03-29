import { createCheerioRouter, log } from 'crawlee';
import type { CheerioCrawlingContext } from 'crawlee';
import {
    generateSlug,
    parseDistances,
    parseTime,
    mapTerrain,
    getRegion,
    type RaceInput,
} from '@race-aggregator/shared';

export const collectedRaces: RaceInput[] = [];

/** Map from source_id to index in collectedRaces for detail enrichment. */
const raceIndexBySourceId = new Map<string, number>();

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

router.addHandler('API', async ({ body, crawler }: CheerioCrawlingContext) => {
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

            raceIndexBySourceId.set(raw.id_races_list, collectedRaces.length);
            collectedRaces.push(race);
        } catch (err) {
            log.warning(`Error processing race "${raw.name}": ${String(err)}`);
        }
    }

    log.info(`Collected ${collectedRaces.length} valid races from behej.com API.`);

    // Enqueue detail pages to scrape rich data (time, prices, description, etc.)
    const detailRequests = collectedRaces.map((race) => ({
        url: `https://www.behej.com/zavod/${race.source_id}`,
        label: 'DETAIL',
        userData: { sourceId: race.source_id },
    }));

    if (detailRequests.length > 0) {
        await crawler.addRequests(detailRequests);
        log.info(`Enqueued ${detailRequests.length} detail pages for enrichment.`);
    }
});

// ── DETAIL page handler — enrich race with data from behej.com detail page ──

router.addHandler('DETAIL', async ({ $, request }: CheerioCrawlingContext) => {
    const sourceId = request.userData?.sourceId as string;
    const idx = raceIndexBySourceId.get(sourceId);
    if (idx === undefined) {
        log.warning(`No race found for source_id="${sourceId}". Skipping detail.`);
        return;
    }

    const race = collectedRaces[idx];

    // Parse table.race rows into a key→value map
    const info = new Map<string, string>();
    $('table.race tr').each((_i, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 2) return;
        const label = $(tds[0]).text().replace(/:\s*$/, '').trim();
        const value = $(tds[1]).text().trim();
        if (label && value) info.set(label, value);
    });

    // Extract links separately (website, facebook)
    const links = new Map<string, string>();
    $('table.race tr').each((_i, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 2) return;
        const label = $(tds[0]).text().replace(/:\s*$/, '').trim();
        const anchor = $(tds[1]).find('a').first();
        if (anchor.length && anchor.attr('href')) {
            links.set(label, anchor.attr('href')!);
        }
    });

    let enriched = false;

    // Start time
    const timeStartRaw = info.get('Čas startu');
    if (timeStartRaw) {
        const parsed = parseTime(timeStartRaw);
        if (parsed) { race.time_start = parsed; enriched = true; }
    }

    // Prices (in CZK)
    const priceAdvanceRaw = info.get('Startovné předem');
    if (priceAdvanceRaw) {
        const match = priceAdvanceRaw.match(/(\d+)/);
        if (match) { race.price_from = parseInt(match[1], 10); enriched = true; }
    }

    const priceOnSiteRaw = info.get('Startovné na místě');
    if (priceOnSiteRaw) {
        const match = priceOnSiteRaw.match(/(\d+)/);
        if (match) { race.price_to = parseInt(match[1], 10); enriched = true; }
    }

    // Handle "Zdarma" (free) — if the text says free but no number was extracted
    if (!race.price_from && !race.price_to) {
        const allPriceText = [priceAdvanceRaw, priceOnSiteRaw].join(' ').toLowerCase();
        if (allPriceText.includes('zdarma')) {
            race.price_from = 0;
            race.price_to = 0;
            enriched = true;
        }
    }

    // Description from track description
    const description = info.get('Popis trati');
    if (description) {
        race.description = description.replace(/\s+/g, ' ').trim();
        enriched = true;
    }

    // Venue from registration place
    const venue = info.get('Místo prezentace');
    if (venue) { race.venue = venue; enriched = true; }

    // Organizer from contact name
    const contactRaw = info.get('Kontakty');
    if (contactRaw) {
        // The text content of the contacts cell contains just the name
        race.organizer = contactRaw;
        enriched = true;
    }

    // Website — prefer the actual race website over the behej.com URL
    const raceWebsite = links.get('Webové stránky');
    if (raceWebsite) {
        race.organizer_url = raceWebsite; // actual race website
        enriched = true;
    }

    // Terrain — refine from explicit "Povrch" field on detail page
    const surfaceRaw = info.get('Povrch');
    if (surfaceRaw) {
        race.terrain = mapTerrain(surfaceRaw);
        enriched = true;
    }

    // Distances — supplement from detail page if the API gave us nothing useful
    const mainDistanceRaw = info.get('Délka hlavní tratě pro muže a ženy')
        ?? info.get('Délka hlavní tratě');
    if (mainDistanceRaw && (race.distances.length === 0 ||
        (race.distances.length === 1 && race.distances[0].km === 0))) {
        const parsed = parseDistances(mainDistanceRaw);
        if (parsed.length > 0) { race.distances = parsed; enriched = true; }
    }

    if (enriched) {
        log.debug(`Enriched race "${race.name}" (${sourceId}) from detail page.`);
    }
});

// ── DEFAULT handler (fallback) ──────────────────────────────────────────────

router.addDefaultHandler(async ({ request }: CheerioCrawlingContext) => {
    log.warning(`Unhandled route: ${request.url}`);
});
