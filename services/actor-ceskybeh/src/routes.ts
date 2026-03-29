import { createCheerioRouter } from 'crawlee';
import { log } from 'apify';
import {
    parseDate,
    parseTime,
    parseDistances,
    mapTerrain,
    inferTerrain,
    generateSlug,
    getRegion,
} from '@race-aggregator/shared';
import type { RaceInput } from '@race-aggregator/shared';
import { collectedRaces } from './main.js';

export const router = createCheerioRouter();

/**
 * LIST handler: processes paginated race listing pages at ceskybeh.cz/terminovka/
 *
 * Each race entry is a `div.race-single` with a `data-location` attribute
 * pointing to the detail page URL.
 */
router.addHandler('LIST', async ({ $, request, enqueueLinks }) => {
    const { maxPages, currentPage } = request.userData as {
        maxPages: number;
        currentPage: number;
    };

    log.info(`Processing list page ${currentPage}`, { url: request.url });

    const raceElements = $('div.race-single');
    log.info(`Found ${raceElements.length} race entries on page ${currentPage}`);

    raceElements.each((_index, element) => {
        const el = $(element);
        const detailUrl = el.attr('data-location')?.trim();

        if (!detailUrl) return;

        // Clean the URL (remove trailing ?>)
        const cleanUrl = detailUrl.replace(/\??>?\s*$/, '');

        // Extract basic info from the list page for fallback
        const nameEl = el.find('h4').first();
        const raceName = nameEl.text().trim();

        // Extract text content from paragraphs
        const textContent = el.text();

        // Try to find date from text (e.g., "neděle 29. března 2026")
        const dateMatch = textContent.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4})/);
        const dateStr = dateMatch ? dateMatch[0] : '';

        // Extract distances text (e.g., "Délka tratí: 9 km" or "Délka tratí: 12 km / 5,6 km")
        const distMatch = textContent.match(/Délka tratí:\s*([^\n]*?)(?:\s*Typ|\s*Pořadatel|$)/i);
        const distanceText = distMatch ? distMatch[1].trim() : '';

        // Extract race type
        const typeMatch = textContent.match(/Typ závodu:\s*([^\n]*?)(?:\s*Pořadatel|\s*Kraj|$)/i);
        const raceType = typeMatch ? typeMatch[1].trim() : '';

        // Extract organizer
        const orgMatch = textContent.match(/Pořadatel:\s*([^\n]*?)(?:\s*Kraj|$)/i);
        const organizer = orgMatch ? orgMatch[1].trim() : '';

        // Extract region/kraj
        const krajMatch = textContent.match(/Kraj:\s*(\S+)/i);
        const region = krajMatch ? krajMatch[1].trim() : '';

        // Extract start time
        const startMatch = textContent.match(/Start:\s*(\d{1,2}[:.]\d{2})/i);
        const startTime = startMatch ? startMatch[1] : '';

        // Enqueue detail page
        void enqueueLinks({
            urls: [cleanUrl],
            label: 'DETAIL',
            userData: {
                raceName,
                dateStr,
                distanceText,
                raceType,
                organizer,
                region,
                startTime,
                sourceUrl: cleanUrl,
            },
        });
    });

    // Handle pagination: enqueue next page if within maxPages limit
    const nextPage = currentPage + 1;
    if (nextPage < maxPages && raceElements.length > 0) {
        const nextUrl = `https://ceskybeh.cz/terminovka/?page=${nextPage}`;
        await enqueueLinks({
            urls: [nextUrl],
            label: 'LIST',
            userData: { maxPages, currentPage: nextPage },
        });
        log.info(`Enqueued next list page ${nextPage}`);
    }
});

/**
 * DETAIL handler: extracts full race details from individual race pages.
 *
 * Detail pages have race info in spans/paragraphs without strong semantic markup,
 * so we extract data from text content and fall back to list-page data.
 */
router.addHandler('DETAIL', async ({ $, request }) => {
    const userData = request.userData as {
        raceName: string;
        dateStr: string;
        distanceText: string;
        raceType: string;
        organizer: string;
        region: string;
        startTime: string;
        sourceUrl: string;
    };

    log.info(`Processing detail page: ${userData.raceName}`, { url: request.url });

    const bodyText = $('body').text();

    // --- Race name ---
    const detailName = $('h3').first().text().trim() || $('h2').first().text().trim();
    const name = detailName || userData.raceName;

    if (!name) {
        log.warning('Could not extract race name, skipping', { url: request.url });
        return;
    }

    // --- Date ---
    // Try detail page first, fall back to list data
    const detailDateMatch = bodyText.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4})/);
    const rawDate = detailDateMatch ? detailDateMatch[0] : userData.dateStr;
    const dateStart = parseDate(rawDate);

    if (!dateStart) {
        log.warning(`Could not parse date for "${name}", skipping`, { rawDate });
        return;
    }

    // --- Time ---
    const detailTimeMatch = bodyText.match(/Start[^:]*?:\s*(?:v\s+)?(\d{1,2}[:.]\d{2})/i);
    const rawTime = detailTimeMatch ? detailTimeMatch[1] : userData.startTime;
    const timeStart = rawTime ? parseTime(rawTime) : null;

    // --- Location ---
    // Try to extract city from detail page text near "Kraj:"
    let city = '';
    const locationMatch = bodyText.match(/(?:Místo|Město|Obec)[:\s]+([^\n,]+)/i);
    if (locationMatch) {
        city = locationMatch[1].trim();
    }
    // Fall back: extract from the URL slug or list page text
    if (!city) {
        // Look for location near the date on the detail page
        const locMatch = bodyText.match(/\d{4}\s*[,.]?\s*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž\s-]+?)(?:\s*[,.]?\s*Kraj)/i);
        if (locMatch) {
            city = locMatch[1].trim();
        }
    }
    if (!city) {
        // Try extracting from a line that has the location pattern
        const altLocMatch = bodyText.match(/(?:neděle|pondělí|úterý|středa|čtvrtek|pátek|sobota)\s+\d{1,2}\.\s*\S+\s+\d{4}\s*[,.]?\s*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž\s-]+?)(?:\s*Start|\s*$)/im);
        if (altLocMatch) {
            city = altLocMatch[1].trim();
        }
    }
    // Last resort: extract from URL
    if (!city) {
        const urlSlug = request.url.match(/\/zavody\/([^/]+)/);
        if (urlSlug) {
            // Not ideal but better than empty
            city = 'Unknown';
        }
    }

    // --- Region ---
    const detailKrajMatch = bodyText.match(/Kraj:\s*(\S+)/i);
    const regionText = detailKrajMatch ? detailKrajMatch[1].trim() : userData.region;
    const region = getRegion(city) || regionText || null;

    // --- Distances ---
    const detailDistMatch = bodyText.match(/Délka tratí:\s*([^\n]*?)(?:\s*Typ|\s*Pořadatel|\s*$)/im);
    const rawDistances = detailDistMatch ? detailDistMatch[1].trim() : userData.distanceText;
    const distances = parseDistances(rawDistances);

    // --- Terrain ---
    const detailTypeMatch = bodyText.match(/Typ závodu:\s*([^\n]*?)(?:\s*Pořadatel|\s*Kraj|\s*$)/im);
    const rawType = detailTypeMatch ? detailTypeMatch[1].trim() : userData.raceType;
    const terrain = rawType ? mapTerrain(rawType) : inferTerrain(distances);

    // --- Organizer ---
    const detailOrgMatch = bodyText.match(/Pořadatel:\s*([^\n,]+)/i);
    const organizer = detailOrgMatch ? detailOrgMatch[1].trim() : userData.organizer || null;

    // --- Description ---
    // Look for a description/propozice section
    const descMatch = bodyText.match(/Popis[:\s]+([^\n]+)/i);
    const description = descMatch ? descMatch[1].trim() : null;

    // --- Registration URL ---
    let registrationUrl: string | null = null;
    const regLink = $('a[href*="registr"], a[href*="prihlask"], a[href*="prihlas"]');
    if (regLink.length > 0) {
        registrationUrl = regLink.first().attr('href') || null;
    }
    // Also check for "Propozice" link as a fallback website
    let website: string | null = null;
    const propLink = $('a').filter((_i, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes('web') || text.includes('propozice');
    });
    if (propLink.length > 0) {
        website = propLink.first().attr('href') || null;
    }

    // --- Source ID from URL ---
    const sourceIdMatch = request.url.match(/\/zavody\/([^/]+)/);
    const sourceId = sourceIdMatch ? sourceIdMatch[1] : null;

    // --- Build RaceInput ---
    const slug = generateSlug(name, dateStart);

    const race: RaceInput = {
        slug,
        name,
        description,
        date_start: dateStart,
        date_end: null,
        time_start: timeStart,
        city,
        region,
        country: 'CZ',
        lat: null,
        lng: null,
        venue: null,
        distances,
        terrain,
        elevation_gain: null,
        price_from: null,
        price_to: null,
        currency: 'CZK',
        website,
        registration_url: registrationUrl,
        logo_url: null,
        cover_url: null,
        organizer,
        organizer_url: null,
        status: 'confirmed',
        source: 'ceskybeh',
        source_id: sourceId,
        capacity: null,
        tags: [],
    };

    collectedRaces.push(race);
    log.info(`Collected race: "${name}" on ${dateStart} in ${city}`, {
        distances: distances.length,
        terrain,
    });
});

/**
 * DEFAULT handler: catches any unhandled requests.
 */
router.addDefaultHandler(async ({ request }) => {
    log.warning(`Unhandled request: ${request.url}`);
});
