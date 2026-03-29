import { createCheerioRouter } from 'crawlee';
import { log } from 'apify';
import {
    parseDate,
    parseDistances,
    mapTerrain,
    inferTerrain,
    generateSlug,
    getRegion,
} from '@race-aggregator/shared';
import type { RaceInput } from '@race-aggregator/shared';

export const router = createCheerioRouter();

const BASE_URL = 'https://www.bezeckyzavod.cz';

/** Shared mutable state accessible from main.ts and all route handlers. */
export const state = {
    races: [] as RaceInput[],
    maxPages: 100,
};

/** All category paths to scrape. */
const CATEGORY_PATHS = [
    '/zavody/dalkovy-pochod/',
    '/zavody/maraton/',
    '/zavody/pulmaraton/',
    '/zavody/10km/',
    '/zavody/5km/',
    '/zavody/extremni-prekazkove/',
    '/zavody/behy-do-vrchu/',
    '/zavody/hodinovka/',
    '/zavody/stafetove-behy/',
    '/zavody/detske/',
];

/**
 * HOMEPAGE handler:
 * - Enqueue all category pages
 * - Extract race links from "Oblibene zavody" and "Kde se bezelo" sections
 */
router.addHandler('HOMEPAGE', async ({ $, crawler }) => {
    log.info('Processing homepage');

    // Enqueue all category listing pages
    for (const path of CATEGORY_PATHS) {
        await crawler.addRequests([{
            url: `${BASE_URL}${path}`,
            label: 'CATEGORY',
            userData: { categoryPath: path, page: 1 },
        }]);
    }

    // Extract direct race links from "Oblibene zavody" and "Kde se bezelo" sections
    const raceLinks: string[] = [];

    // Both sections use <ul class="list-unstyled"> with <li><a href="..."> pattern
    $('ul.list-unstyled li a').each((_, el) => {
        const href = $(el).attr('href');
        if (
            href
            && href.includes('bezeckyzavod.cz/')
            && !href.includes('/zavody/')
            && !href.includes('/kraje/')
            && !href.includes('/okresy/')
        ) {
            // Exclude city pages like /praha/ (single path segment, no year)
            const path = new URL(href, BASE_URL).pathname;
            if (path.match(/-\d{4}\/$/)) {
                raceLinks.push(href);
            }
        }
    });

    if (raceLinks.length > 0) {
        log.info(`Found ${raceLinks.length} race links on homepage`);
        await crawler.addRequests(
            raceLinks.map((url) => ({
                url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
                label: 'DETAIL',
            })),
        );
    }
});

/**
 * CATEGORY handler:
 * - Extract race rows from the listing table
 * - Enqueue detail pages for each race
 * - Follow pagination ("Dalsi zavody" link with ?strana=N)
 */
router.addHandler('CATEGORY', async ({ $, request, crawler }) => {
    const categoryPath = (request.userData.categoryPath as string) || '';
    const currentPage = (request.userData.page as number) || 1;

    log.info(`Processing category ${categoryPath}, page ${currentPage}`);

    // Each race is a <tr class="zavody"> inside a table
    const raceRows = $('tr.zavody');
    let enqueued = 0;

    raceRows.each((_, row) => {
        const $row = $(row);
        // The race link is in the second <td>, inside an <a>
        const link = $row.find('td a[href]').first();
        const href = link.attr('href');

        if (href) {
            const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            crawler.addRequests([{
                url: fullUrl,
                label: 'DETAIL',
            }]);
            enqueued++;
        }
    });

    log.info(`Enqueued ${enqueued} detail pages from category ${categoryPath} page ${currentPage}`);

    // Handle pagination: look for link with ?strana=<next page>
    if (currentPage < state.maxPages) {
        let nextUrl: string | null = null;

        $('a[href*="strana="]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const match = href.match(/strana=(\d+)/);
            if (match && parseInt(match[1], 10) === currentPage + 1) {
                nextUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            }
        });

        if (nextUrl) {
            await crawler.addRequests([{
                url: nextUrl,
                label: 'CATEGORY',
                userData: { categoryPath, page: currentPage + 1 },
            }]);
            log.info(`Following pagination to page ${currentPage + 1} for ${categoryPath}`);
        }
    }
});

/**
 * DETAIL handler:
 * - Extract full race info from the detail page
 * - Build a RaceInput and push to shared state
 */
router.addHandler('DETAIL', async ({ $, request }) => {
    const url = request.url;

    log.info(`Processing detail page: ${url}`);

    // Race name from <span itemprop="name"> inside <h1>
    const nameFromItemprop = $('span[itemprop="name"]').first().text().trim();
    const h1Text = $('h1').first().text().trim();
    const rawName = nameFromItemprop || h1Text;

    if (!rawName) {
        log.warning(`No race name found on ${url}, skipping`);
        return;
    }

    // Strip trailing date from name (e.g. "Orlen Maraton Praha 3.5.2026")
    const name = rawName.replace(/\s+\d{1,2}\.\d{1,2}\.\d{4}\s*$/, '').trim();

    // Date from <meta itemprop="startDate" content="...">
    // Content can be "2026-05-03" or "2026-05-03 00:00:00"
    const startDateMeta = $('meta[itemprop="startDate"]').first().attr('content');
    let dateStart: string | null = null;

    if (startDateMeta) {
        dateStart = parseDate(startDateMeta.split(' ')[0]);
    }

    // Fallback: parse from the visible text next to the clock icon
    if (!dateStart) {
        const dateRow = $('i.fa-clock').closest('.row').find('.col-10, .col-sm-11');
        const dateText = dateRow.text().trim();
        const dateMatch = dateText.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
        if (dateMatch) {
            dateStart = parseDate(dateMatch[1]);
        }
    }

    if (!dateStart) {
        log.warning(`No date found for "${name}" on ${url}, skipping`);
        return;
    }

    // Location from <span itemprop="streetAddress"> within #main-content
    const city = (
        $('section#main-content span[itemprop="streetAddress"]').first().text().trim()
        || $('span[itemprop="streetAddress"]').first().text().trim()
        || ''
    );

    if (!city) {
        log.warning(`No city found for "${name}" on ${url}, skipping`);
        return;
    }

    // Venue: text before the city in the location row (e.g. "Machovo jezero -")
    const locationRow = $('i.fa-map-marker-alt').closest('.row').find('.col-10, .col-sm-11');
    const locationText = locationRow.contents().first().text().trim();
    let venue: string | null = null;
    if (locationText.includes(' - ')) {
        const venuePart = locationText.split(' - ')[0].trim();
        if (venuePart && venuePart.toLowerCase() !== city.toLowerCase()) {
            venue = venuePart;
        }
    }

    // Region: try from breadcrumb kraj link, then fall back to city lookup
    let region: string | null = null;
    const krajLink = $('a[href*="/kraje/"]').first();
    if (krajLink.length > 0) {
        const krajText = krajLink.find('span').text().trim() || krajLink.text().trim();
        region = krajText.replace(/\s*kraj\s*$/i, '').trim() || null;
    }
    if (!region) {
        region = getRegion(city);
    }

    // Website URL from <a itemprop="url">
    const website = $('a[itemprop="url"]').first().attr('href') || null;

    // Distances from <span itemprop="description"> in #main-content
    // Each distance is in a separate <span> child, e.g. <span>5 km</span><span>, 40 km</span>
    const distanceContainer = $('section#main-content span[itemprop="description"]').first();
    let distancesRaw = '';

    if (distanceContainer.length > 0) {
        const spans = distanceContainer.find('span');
        if (spans.length > 0) {
            const parts: string[] = [];
            spans.each((_, span) => {
                const text = $(span).text().trim().replace(/^,\s*/, '');
                if (text) parts.push(text);
            });
            distancesRaw = parts.join(', ');
        } else {
            distancesRaw = distanceContainer.text().trim();
        }
    }

    const distances = parseDistances(distancesRaw);

    // Category tags from <span class="badge badge-typ"> links
    const tags: string[] = [];
    $('section#main-content span.badge-typ a').each((_, el) => {
        const tagText = $(el).text().trim();
        if (tagText) tags.push(tagText);
    });

    // Infer terrain from tags first, then from distances
    let terrain = inferTerrain(distances);
    for (const tag of tags) {
        const mapped = mapTerrain(tag);
        if (mapped !== 'road') {
            terrain = mapped;
            break;
        }
    }

    // Source ID: URL slug without base and slashes
    const sourceId = url.replace(BASE_URL, '').replace(/^\/|\/$/g, '') || null;

    const slug = generateSlug(name, dateStart);

    const race: RaceInput = {
        slug,
        name,
        date_start: dateStart,
        city,
        region,
        country: 'CZ',
        venue,
        distances,
        terrain,
        website,
        registration_url: website,
        status: 'confirmed',
        source: 'bezeckyzavod',
        source_id: sourceId,
        tags: tags.length > 0 ? tags : undefined,
    };

    state.races.push(race);
    log.info(`Collected race: "${name}" in ${city} on ${dateStart} (${distances.length} distances)`);
});
