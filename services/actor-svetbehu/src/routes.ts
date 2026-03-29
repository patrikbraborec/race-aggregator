import { createCheerioRouter, log } from 'crawlee';
import {
    generateSlug,
    parseDate,
    parseDistances,
    mapTerrain,
    inferTerrain,
    type RaceInput,
} from '@race-aggregator/shared';

export const collectedRaces: RaceInput[] = [];

export const router = createCheerioRouter();

// ── LIST page handler ───────────────────────────────────────────────────────

router.addHandler('LIST', async ({ $, request, enqueueLinks }) => {
    const pageNum = request.userData?.page ?? '?';
    log.info(`Processing listing page ${pageNum}: ${request.url}`);

    const raceCards = $('a .race-card').closest('a');
    log.info(`Found ${raceCards.length} race cards on page ${pageNum}.`);

    raceCards.each((_index, element) => {
        const card = $(element);
        const detailUrl = card.attr('href') ?? null;
        const cardInner = card.find('.race-card');

        // Extract fields from within the race card
        const rawDate = cardInner.find('time').text().trim();
        const region = cardInner.find('.region').text().trim();
        const name = cardInner.find('h3').text().trim();
        const terrainRaw = cardInner.find('.terrain').text().trim();
        const distanceRaw = cardInner.find('.distance').text().trim();

        if (!name) {
            log.warning(`Empty race name on page ${pageNum}, skipping card.`);
            return;
        }

        // Pre-process date: svetbehu uses DD/MM YYYY format (e.g. "4/4 2026")
        // Replace slashes with dots so parseDate can handle it as "4.4. 2026"
        const normalizedDate = rawDate.replace(/\//g, '.').replace(/\s+/g, ' ');
        // Ensure trailing dot before year: "4.4 2026" -> "4.4. 2026"
        const dateForParser = normalizedDate.replace(/(\d+\.\d+)\s+(\d{4})/, '$1. $2');
        const dateStart = parseDate(dateForParser);

        if (!dateStart) {
            log.warning(`Could not parse date "${rawDate}" for race "${name}", skipping.`);
            return;
        }

        // Parse distances
        const distances = parseDistances(distanceRaw);

        // Determine terrain: prefer explicit tag, fall back to inference from distances
        const terrain = terrainRaw ? mapTerrain(terrainRaw) : inferTerrain(distances);

        const slug = generateSlug(name, dateStart);

        // Build absolute detail URL
        let website: string | null = null;
        if (detailUrl) {
            try {
                website = new URL(detailUrl, 'https://www.svetbehu.cz').href;
            } catch {
                website = detailUrl.startsWith('/') ? `https://www.svetbehu.cz${detailUrl}` : detailUrl;
            }
        }

        const race: RaceInput = {
            slug,
            name,
            date_start: dateStart,
            date_end: null,
            time_start: null,
            city: region || 'Neuvedeno',
            region: region || null,
            country: 'CZ',
            distances: distances.length > 0 ? distances : [{ label: distanceRaw || 'Neuvedeno', km: 0 }],
            terrain,
            website,
            registration_url: null,
            cover_url: null,
            organizer: null,
            organizer_url: null,
            status: 'confirmed',
            source: 'svetbehu',
            source_id: detailUrl?.split('/').filter(Boolean).pop() ?? null,
            tags: ['svetbehu'],
        };

        collectedRaces.push(race);
        log.debug(`Collected: ${name} (${dateStart}, ${region}, ${distanceRaw})`);
    });

    log.info(`Total races collected so far: ${collectedRaces.length}`);

    // Enqueue detail pages for richer data (optional enrichment)
    await enqueueLinks({
        selector: 'a:has(.race-card)',
        label: 'DETAIL',
    });
});

// ── DETAIL page handler (optional enrichment) ───────────────────────────────

router.addHandler('DETAIL', async ({ $, request }) => {
    log.info(`Processing detail page: ${request.url}`);

    // Find the matching race we already collected from the listing
    const sourceId = request.url.split('/').filter(Boolean).pop() ?? '';
    const race = collectedRaces.find((r) => r.source_id === sourceId);

    if (!race) {
        log.debug(`No matching list entry for detail page ${request.url}, skipping enrichment.`);
        return;
    }

    // Extract description from the detail page
    const description = $('article p, .content p, .detail p, .race-detail p')
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter((t: string) => t.length > 20)
        .slice(0, 3)
        .join('\n\n') || null;

    if (description) {
        race.description = description;
    }

    // Extract organizer info
    const organizer = $('a[href*="organiz"], .organizer, [class*="organiz"]').first().text().trim() || null;
    if (organizer) {
        race.organizer = organizer;
    }

    // Extract registration URL
    const registrationLink = $('a[href*="registr"], a[href*="prihlask"], a:contains("Přihlášení"), a:contains("Registrace")').first().attr('href') ?? null;
    if (registrationLink) {
        try {
            race.registration_url = new URL(registrationLink, 'https://www.svetbehu.cz').href;
        } catch {
            race.registration_url = registrationLink;
        }
    }

    // Try to get a more specific city from the detail page
    const cityText = $('[class*="city"], [class*="misto"], [class*="location"], .place').first().text().trim();
    if (cityText && cityText.length < 100) {
        race.city = cityText;
    }

    log.debug(`Enriched detail for: ${race.name}`);
});

// ── DEFAULT handler (fallback) ──────────────────────────────────────────────

router.addDefaultHandler(async ({ request }) => {
    log.warning(`Unhandled route: ${request.url}`);
});
