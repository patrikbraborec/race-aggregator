import { createCheerioRouter, log } from 'crawlee';
import type { CheerioCrawlingContext } from 'crawlee';
import {
    generateSlug,
    parseDistances,
    mapTerrain,
    inferTerrain,
    getRegion,
    type RaceInput,
    type RaceDistance,
    type TerrainType,
} from '@race-aggregator/shared';

export const collectedRaces: RaceInput[] = [];

export const router = createCheerioRouter();

// ── Terrain mapping for English labels from finishers.com ───────────────────

const TERRAIN_MAP: Record<string, TerrainType> = {
    'trail': 'trail',
    'road running': 'road',
    'road': 'road',
    'ultra': 'ultra',
    'ultra trail': 'ultra',
    'cross country': 'cross',
    'cross': 'cross',
    'obstacle': 'obstacle',
};

/**
 * Map an English terrain label from finishers.com to our TerrainType.
 */
function mapFinishersTerrain(raw: string): TerrainType {
    const lower = raw.trim().toLowerCase();
    return TERRAIN_MAP[lower] ?? mapTerrain(raw);
}

/**
 * Normalize English distance labels to a format parseDistances can handle.
 * E.g. "10K" -> "10 km", "Half Marathon" -> "21.0975 km"
 */
function normalizeDistanceLabel(raw: string): string {
    const trimmed = raw.trim();

    // "10K" -> "10 km"
    const kMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*K$/i);
    if (kMatch) return `${kMatch[1]} km`;

    // "Half Marathon" or "Semi Marathon"
    if (/half\s*marathon/i.test(trimmed) || /semi\s*marathon/i.test(trimmed)) {
        return '21.0975 km';
    }

    // "Marathon" (standalone)
    if (/^marathon$/i.test(trimmed)) {
        return '42.195 km';
    }

    return trimmed;
}

/**
 * Parse a finishers.com distance string like "42.195 km, 1.609 km" or "10K"
 * into structured RaceDistance objects.
 */
function parseFinishersDistances(raw: string): RaceDistance[] {
    // Split on comma, slash, or dash used as separator between distances
    const parts = raw.split(/[,;|\/]+/).map((p) => p.trim()).filter(Boolean);
    const distances: RaceDistance[] = [];

    for (const part of parts) {
        const normalized = normalizeDistanceLabel(part);
        const parsed = parseDistances(normalized);
        if (parsed.length > 0) {
            distances.push(...parsed);
        }
    }

    return distances;
}

/**
 * Parse a finishers.com English date string into ISO YYYY-MM-DD.
 * Handles: "Sat, May 16, 2026", "May 2-3, 2026", "March 15, 2026", "2026-05-16"
 */
function parseFinishersDate(raw: string): { dateStart: string | null; dateEnd: string | null } {
    const trimmed = raw.trim();

    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { dateStart: trimmed, dateEnd: null };
    }

    const MONTHS: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
        jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    // Remove day-of-week prefix like "Sat, " or "Sunday, "
    const cleaned = trimmed.replace(/^[a-z]+,\s*/i, '');

    // Range within same month: "May 2-3, 2026"
    const rangeMatch = cleaned.match(/^([a-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})$/i);
    if (rangeMatch) {
        const [, monthStr, dayStart, dayEnd, year] = rangeMatch;
        const month = MONTHS[monthStr.toLowerCase()];
        if (month) {
            const m = String(month).padStart(2, '0');
            return {
                dateStart: `${year}-${m}-${dayStart.padStart(2, '0')}`,
                dateEnd: `${year}-${m}-${dayEnd.padStart(2, '0')}`,
            };
        }
    }

    // Cross-month range: "April 30 - May 1, 2026"
    const crossMonthMatch = cleaned.match(
        /^([a-z]+)\s+(\d{1,2})\s*[-–]\s*([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i,
    );
    if (crossMonthMatch) {
        const [, monthStr1, day1, monthStr2, day2, year] = crossMonthMatch;
        const month1 = MONTHS[monthStr1.toLowerCase()];
        const month2 = MONTHS[monthStr2.toLowerCase()];
        if (month1 && month2) {
            return {
                dateStart: `${year}-${String(month1).padStart(2, '0')}-${day1.padStart(2, '0')}`,
                dateEnd: `${year}-${String(month2).padStart(2, '0')}-${day2.padStart(2, '0')}`,
            };
        }
    }

    // Single date: "May 16, 2026" or "March 15, 2026"
    const singleMatch = cleaned.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (singleMatch) {
        const [, monthStr, day, year] = singleMatch;
        const month = MONTHS[monthStr.toLowerCase()];
        if (month) {
            return {
                dateStart: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
                dateEnd: null,
            };
        }
    }

    // Fallback: try to find any date-like pattern
    const fallbackMatch = cleaned.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (fallbackMatch) {
        const [, monthStr, day, year] = fallbackMatch;
        const month = MONTHS[monthStr.toLowerCase()];
        if (month) {
            return {
                dateStart: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
                dateEnd: null,
            };
        }
    }

    return { dateStart: null, dateEnd: null };
}

// ── Interfaces for __NEXT_DATA__ parsing ────────────────────────────────────

interface NextDataEvent {
    name?: string;
    href?: string;
    slug?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    city?: string;
    location?: string;
    country?: string;
    distances?: string | string[];
    discipline?: string;
    sport?: string;
    tags?: string[];
    image?: string;
}

// ── LISTING page handler ────────────────────────────────────────────────────

router.addHandler('LISTING', async ({ $, crawler }: CheerioCrawlingContext) => {
    log.info('Processing Finishers.com Czechia listing page...');

    // ── Strategy 1: Try to extract data from __NEXT_DATA__ JSON ─────────────
    const nextDataScript = $('script#__NEXT_DATA__').html();
    let extractedFromJson = false;

    if (nextDataScript) {
        try {
            const nextData = JSON.parse(nextDataScript);
            const pageProps = nextData?.props?.pageProps;

            if (pageProps) {
                log.info('Found __NEXT_DATA__ pageProps, checking for embedded event data...');

                // Recursively search for arrays of event-like objects in pageProps
                const events = findEventArrays(pageProps);

                if (events.length > 0) {
                    log.info(`Found ${events.length} events in __NEXT_DATA__ JSON.`);
                    extractedFromJson = true;

                    for (const event of events) {
                        processJsonEvent(event);
                    }
                } else {
                    log.info('No event arrays found in __NEXT_DATA__. Falling back to HTML parsing.');
                }
            }
        } catch (err) {
            log.warning(`Failed to parse __NEXT_DATA__: ${err}`);
        }
    }

    // ── Strategy 2: Parse rendered HTML for race cards ──────────────────────
    if (!extractedFromJson) {
        log.info('Parsing race cards from rendered HTML...');

        // Collect detail page URLs to enqueue
        const detailUrls: string[] = [];

        // finishers.com race cards are anchor elements linking to /en/event/<slug>
        $('a[href*="/en/event/"]').each((_i, el) => {
            const $card = $(el);
            const href = $card.attr('href');
            if (!href || href === '/en/event/' || href === '/en/event') return;

            const fullUrl = href.startsWith('http')
                ? href
                : `https://www.finishers.com${href}`;

            // Avoid duplicates
            if (!detailUrls.includes(fullUrl)) {
                detailUrls.push(fullUrl);
            }
        });

        log.info(`Found ${detailUrls.length} event detail links on listing page.`);

        // Enqueue all detail pages for full extraction via JSON-LD
        if (detailUrls.length > 0) {
            await crawler.addRequests(
                detailUrls.map((url) => ({ url, label: 'DETAIL' })),
            );
        }
    }
});

/**
 * Recursively search an object for arrays that look like event data.
 */
function findEventArrays(obj: unknown, depth = 0): NextDataEvent[] {
    if (depth > 8 || !obj || typeof obj !== 'object') return [];

    const results: NextDataEvent[] = [];

    if (Array.isArray(obj)) {
        // Check if this array contains event-like objects
        const eventLike = obj.filter(
            (item) =>
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                ('name' in item || 'eventName' in item) &&
                ('href' in item || 'slug' in item || 'date' in item || 'startDate' in item),
        );
        if (eventLike.length > 0) {
            results.push(...(eventLike as NextDataEvent[]));
        }
        // Also recurse into array elements
        for (const item of obj) {
            results.push(...findEventArrays(item, depth + 1));
        }
    } else {
        // Recurse into object values
        for (const value of Object.values(obj as Record<string, unknown>)) {
            results.push(...findEventArrays(value, depth + 1));
        }
    }

    return results;
}

/**
 * Process a single event object extracted from __NEXT_DATA__ JSON.
 */
function processJsonEvent(event: NextDataEvent): void {
    const name = event.name ?? '';
    if (!name) return;

    const dateRaw = event.startDate ?? event.date ?? '';
    const { dateStart, dateEnd: dateEndParsed } = parseFinishersDate(dateRaw);

    if (!dateStart) {
        log.warning(`Could not parse date for "${name}" from: "${dateRaw}". Skipping.`);
        return;
    }

    let dateEnd = dateEndParsed;
    if (!dateEnd && event.endDate) {
        const parsed = parseFinishersDate(event.endDate);
        dateEnd = parsed.dateStart;
    }

    const city = event.city ?? event.location ?? '';
    if (!city) {
        log.warning(`No city found for "${name}". Skipping.`);
        return;
    }

    // Parse distances
    let distances: RaceDistance[] = [];
    if (event.distances) {
        const distStr = Array.isArray(event.distances)
            ? event.distances.join(', ')
            : event.distances;
        distances = parseFinishersDistances(distStr);
    }

    // Determine terrain
    const terrainRaw = event.discipline ?? event.sport ?? '';
    const terrain = terrainRaw ? mapFinishersTerrain(terrainRaw) : inferTerrain(distances);

    const slug = generateSlug(name, dateStart);
    const region = getRegion(city);

    const race: RaceInput = {
        slug,
        name,
        date_start: dateStart,
        date_end: dateEnd,
        time_start: null,
        city,
        region,
        country: 'CZ',
        distances: distances.length > 0 ? distances : [{ label: 'Unknown', km: 0 }],
        terrain,
        website: event.href
            ? `https://www.finishers.com${event.href}`
            : null,
        registration_url: null,
        cover_url: event.image ?? null,
        organizer: null,
        organizer_url: null,
        status: 'confirmed',
        source: 'finishers',
        source_id: event.slug ?? event.href?.split('/').pop() ?? null,
        tags: event.tags ?? ['finishers'],
    };

    collectedRaces.push(race);
    log.info(`Collected race (JSON): ${name} (${dateStart}, ${city}, ${distances.length} distances)`);
}

// ── DETAIL page handler ─────────────────────────────────────────────────────

router.addHandler('DETAIL', async ({ $, request }: CheerioCrawlingContext) => {
    log.info(`Processing detail page: ${request.url}`);

    // ── Strategy 1: Extract from JSON-LD structured data ────────────────────
    let race: RaceInput | null = null;

    $('script[type="application/ld+json"]').each((_i, el) => {
        if (race) return; // Already found

        try {
            const json = JSON.parse($(el).html() ?? '');

            // Handle both single objects and arrays
            const items = Array.isArray(json) ? json : [json];

            for (const item of items) {
                if (item['@type'] !== 'Event') continue;

                const name = item.name;
                if (!name) continue;

                const startDate = item.startDate;
                const endDate = item.endDate;

                const { dateStart } = parseFinishersDate(startDate ?? '');
                if (!dateStart) {
                    log.warning(`Could not parse start date for "${name}". Skipping.`);
                    continue;
                }

                let dateEnd: string | null = null;
                if (endDate) {
                    const parsed = parseFinishersDate(endDate);
                    dateEnd = parsed.dateStart;
                }

                // Location from JSON-LD
                const location = item.location;
                const city =
                    location?.address?.addressLocality ??
                    location?.name ??
                    '';

                if (!city) {
                    log.warning(`No city found for "${name}". Skipping.`);
                    continue;
                }

                // Country check - only Czech races
                const country =
                    location?.address?.addressCountry ?? '';
                if (country && country !== 'CZ' && country !== 'Czechia' && country !== 'Czech Republic') {
                    log.info(`Skipping non-Czech race: "${name}" (country: ${country}).`);
                    continue;
                }

                // Terrain from JSON-LD sport field
                const sportRaw = item.sport ?? '';
                let terrain: TerrainType = sportRaw
                    ? mapFinishersTerrain(sportRaw)
                    : 'road';

                // Distances from eventSchedule or page content
                const distances: RaceDistance[] = [];
                if (item.eventSchedule && Array.isArray(item.eventSchedule)) {
                    for (const schedule of item.eventSchedule) {
                        const scheduleName = schedule.name ?? '';
                        if (!scheduleName) continue;

                        const normalized = normalizeDistanceLabel(scheduleName);
                        const parsed = parseDistances(normalized);
                        if (parsed.length > 0) {
                            distances.push(...parsed);
                        }
                    }
                }

                // Also try parsing distances from the page text
                if (distances.length === 0) {
                    const pageText = $('body').text();
                    // Look for patterns like "42.195 km" or "10 km"
                    const distanceMatches = pageText.match(/\d+(?:\.\d+)?\s*km/gi);
                    if (distanceMatches) {
                        const seen = new Set<number>();
                        for (const match of distanceMatches) {
                            const parsed = parseDistances(match);
                            for (const d of parsed) {
                                if (!seen.has(d.km)) {
                                    seen.add(d.km);
                                    distances.push(d);
                                }
                            }
                        }
                    }
                }

                // If terrain not set from sport field, infer from distances
                if (!sportRaw) {
                    terrain = inferTerrain(distances);
                }

                // Description from JSON-LD or meta tag
                const description =
                    item.description ??
                    $('meta[property="og:description"]').attr('content') ??
                    null;

                // Cover image from JSON-LD or meta
                let coverUrl: string | null = null;
                if (item.image) {
                    coverUrl = Array.isArray(item.image) ? item.image[0] : item.image;
                }
                if (!coverUrl) {
                    coverUrl = $('meta[property="og:image"]').attr('content') ?? null;
                }

                // Registration URL - look for external links
                let registrationUrl: string | null = null;
                $('a[href]').each((_j, linkEl) => {
                    if (registrationUrl) return;
                    const href = $(linkEl).attr('href') ?? '';
                    // Registration links typically point to external sites
                    if (
                        href.includes('register') ||
                        href.includes('registration') ||
                        href.includes('signup') ||
                        href.includes('entry')
                    ) {
                        registrationUrl = href.startsWith('http') ? href : null;
                    }
                });

                // Extract tags from the page
                const tags: string[] = ['finishers'];

                const slug = generateSlug(name, dateStart);
                const region = getRegion(city);

                race = {
                    slug,
                    name,
                    description,
                    date_start: dateStart,
                    date_end: dateEnd,
                    time_start: null,
                    city,
                    region,
                    country: 'CZ',
                    distances: distances.length > 0 ? distances : [{ label: 'Unknown', km: 0 }],
                    terrain,
                    website: request.url,
                    registration_url: registrationUrl,
                    cover_url: coverUrl,
                    organizer: null,
                    organizer_url: null,
                    status: 'confirmed',
                    source: 'finishers',
                    source_id: request.url.split('/event/').pop() ?? null,
                    tags,
                };
            }
        } catch (err) {
            log.debug(`Failed to parse JSON-LD on ${request.url}: ${err}`);
        }
    });

    // ── Strategy 2: Fall back to __NEXT_DATA__ ──────────────────────────────
    if (!race) {
        const nextDataScript = $('script#__NEXT_DATA__').html();
        if (nextDataScript) {
            try {
                const nextData = JSON.parse(nextDataScript);
                const pageProps = nextData?.props?.pageProps;

                if (pageProps) {
                    const name = pageProps.name ?? pageProps.eventName ?? $('h1').first().text().trim();
                    if (!name) {
                        log.warning(`No race name found on ${request.url}. Skipping.`);
                        return;
                    }

                    const startDate = pageProps.startDate ?? pageProps.date ?? '';
                    const { dateStart } = parseFinishersDate(startDate);
                    if (!dateStart) {
                        log.warning(`Could not parse date for "${name}" on ${request.url}. Skipping.`);
                        return;
                    }

                    let dateEnd: string | null = null;
                    if (pageProps.endDate) {
                        const parsed = parseFinishersDate(pageProps.endDate);
                        dateEnd = parsed.dateStart;
                    }

                    const city = pageProps.city ?? pageProps.location ?? '';
                    if (!city) {
                        log.warning(`No city for "${name}" on ${request.url}. Skipping.`);
                        return;
                    }

                    const distances: RaceDistance[] = [];
                    const terrainRaw = pageProps.discipline ?? pageProps.sport ?? '';
                    const terrain = terrainRaw ? mapFinishersTerrain(terrainRaw) : inferTerrain(distances);

                    const slug = generateSlug(name, dateStart);
                    const region = getRegion(city);

                    const description =
                        pageProps.description ??
                        $('meta[property="og:description"]').attr('content') ??
                        null;

                    const coverUrl =
                        pageProps.image ??
                        $('meta[property="og:image"]').attr('content') ??
                        null;

                    race = {
                        slug,
                        name,
                        description,
                        date_start: dateStart,
                        date_end: dateEnd,
                        time_start: null,
                        city,
                        region,
                        country: 'CZ',
                        distances: distances.length > 0 ? distances : [{ label: 'Unknown', km: 0 }],
                        terrain,
                        website: request.url,
                        registration_url: null,
                        cover_url: coverUrl,
                        organizer: null,
                        organizer_url: null,
                        status: 'confirmed',
                        source: 'finishers',
                        source_id: request.url.split('/event/').pop() ?? null,
                        tags: ['finishers'],
                    };
                }
            } catch (err) {
                log.warning(`Failed to parse __NEXT_DATA__ on ${request.url}: ${err}`);
            }
        }
    }

    // ── Strategy 3: Parse from HTML as last resort ──────────────────────────
    if (!race) {
        const name = $('h1').first().text().trim();
        if (!name) {
            log.warning(`No race name found on ${request.url}. Skipping.`);
            return;
        }

        const ogDescription = $('meta[property="og:description"]').attr('content') ?? null;
        const coverUrl = $('meta[property="og:image"]').attr('content') ?? null;

        log.warning(`Could not extract structured data for "${name}" on ${request.url}. Minimal data only.`);

        race = {
            slug: generateSlug(name, ''),
            name,
            description: ogDescription,
            date_start: '',
            time_start: null,
            city: '',
            region: null,
            country: 'CZ',
            distances: [{ label: 'Unknown', km: 0 }],
            terrain: 'road',
            website: request.url,
            registration_url: null,
            cover_url: coverUrl,
            organizer: null,
            organizer_url: null,
            status: 'confirmed',
            source: 'finishers',
            source_id: request.url.split('/event/').pop() ?? null,
            tags: ['finishers'],
        };
    }

    if (race && race.date_start) {
        collectedRaces.push(race);
        log.info(
            `Collected race: ${race.name} (${race.date_start}, ${race.city}, ${race.distances.length} distances)`,
        );
    } else {
        log.warning(`Incomplete data for race on ${request.url}. Skipping.`);
    }
});

// ── DEFAULT handler (fallback) ──────────────────────────────────────────────

router.addDefaultHandler(async ({ request }: CheerioCrawlingContext) => {
    log.warning(`Unhandled route: ${request.url}`);
});
