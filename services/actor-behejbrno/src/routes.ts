import { createCheerioRouter } from 'crawlee';
import type { RaceInput } from '@race-aggregator/shared';
import { parseDate, generateSlug, inferTerrain, parseDistances } from '@race-aggregator/shared';

/** Cards that are not races — filter these out by matching h5 text. */
const NON_RACE_TITLES = [
    'běžecké kurzy',
    'prodejna a kontaktní centrum',
    'společné výběhy',
];

/**
 * Known distance info for BehejBrno races (not always listed on the homepage).
 * Keys are lowercase normalized substrings of the race name.
 */
const KNOWN_DISTANCES: Record<string, string> = {
    'novoroční': '21.1 km / 10 km',
    'půlmaraton': '21.1 km / 10 km / 5 km',
    'sunrise marathon': '42.195 km / 21.1 km',
    'schody': '',
    'brněnská 25': '25 km',
};

function guessDistances(name: string): string {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(KNOWN_DISTANCES)) {
        if (lower.includes(key)) return value;
    }
    return '';
}

export const collectedRaces: RaceInput[] = [];

export const router = createCheerioRouter();

/**
 * DEFAULT handler — scrapes the homepage card grid.
 *
 * HTML structure (from live site):
 *   .portfolio-5 contains a .row with multiple .col-xs-12.col-sm-4 children.
 *   Each child has a .card.no-padding.bordered with:
 *     - .contentswap-effect > .initial-image > img  (cover image)
 *     - .contentswap-effect > .swap-inner a.button.color2  (registration overlay link)
 *     - .col-xs-12 > div[data-type="column"]  with:
 *         h5 elements (first = name, second = date if present)
 *         p.small.italic > b  (date for some cards)
 *         a.button.blue  (detail / registration links)
 */
router.addDefaultHandler(async ({ $, log, enqueueLinks }) => {
    log.info('Scraping BehejBrno homepage...');

    const cards = $('div.portfolio-5 .card.no-padding.bordered');
    log.info(`Found ${cards.length} cards on homepage`);

    cards.each((_i, el) => {
        const card = $(el);

        // Extract all h5 texts
        const h5Elements = card.find('h5');
        if (h5Elements.length === 0) return;

        const name = h5Elements.first().text().trim().replace(/\s+/g, ' ');

        // Skip non-race cards
        if (NON_RACE_TITLES.some((t) => name.toLowerCase().includes(t))) {
            log.info(`Skipping non-race card: ${name}`);
            return;
        }

        // Extract date — could be in a second h5, or in p.small.italic > b
        let rawDate = '';
        if (h5Elements.length > 1) {
            const secondH5 = h5Elements.eq(1).text().trim();
            // Check if it looks like a date (contains digits and dots)
            if (/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/.test(secondH5)) {
                rawDate = secondH5;
            }
        }
        if (!rawDate) {
            const boldDate = card.find('p.small.italic b').first().text().trim();
            if (boldDate) rawDate = boldDate;
        }

        const dateStart = parseDate(rawDate);
        if (!dateStart) {
            log.warning(`Could not parse date for "${name}" (raw: "${rawDate}"), skipping`);
            return;
        }

        // Cover image
        const coverUrl = card.find('.initial-image img').attr('src') || null;

        // Detail page link (first a.button.blue that points to behejbrno.com, not external)
        const detailLinks: string[] = [];
        card.find('a.button.blue').each((_j, a) => {
            const href = $(a).attr('href');
            if (href && href.includes('behejbrno.com/') && !href.includes('forms.gle')) {
                detailLinks.push(href);
            }
        });
        const website = detailLinks[0] || null;

        // Registration URL (ChampionChip or forms.gle)
        let registrationUrl: string | null = null;
        card.find('a.button').each((_j, a) => {
            const href = $(a).attr('href');
            if (href && (href.includes('championchip') || href.includes('forms.gle'))) {
                registrationUrl = href;
                return false; // break
            }
        });

        // Distances
        const distanceHint = guessDistances(name);
        const distances = distanceHint ? parseDistances(distanceHint) : [];
        const terrain = inferTerrain(distances);

        const slug = generateSlug(name, dateStart);

        const race: RaceInput = {
            slug,
            name,
            date_start: dateStart,
            city: 'Brno',
            region: 'Jihomoravský',
            country: 'CZ',
            distances,
            terrain,
            status: 'confirmed',
            source: 'behejbrno',
            website,
            registration_url: registrationUrl,
            cover_url: coverUrl,
            organizer: 'BehejBrno.com',
            organizer_url: 'https://www.behejbrno.com',
        };

        collectedRaces.push(race);
        log.info(`Collected race: ${name} (${dateStart})`);

        // Enqueue detail pages for additional info
        if (detailLinks.length > 0) {
            void enqueueLinks({
                urls: [detailLinks[0]],
                label: 'DETAIL',
                userData: { slug },
            });
        }
    });
});

/**
 * DETAIL handler — extracts extra info from a race detail page.
 * Updates the matching race in collectedRaces with description and any
 * additional data found on the detail page.
 */
router.addHandler('DETAIL', async ({ $, request, log }) => {
    const { slug } = request.userData as { slug: string };
    const race = collectedRaces.find((r) => r.slug === slug);
    if (!race) {
        log.warning(`No collected race found for slug "${slug}"`);
        return;
    }

    log.info(`Scraping detail page for: ${race.name}`);

    // Try to get a description from the page content.
    // The detail pages use Elementor, so look for text in the main content area.
    const contentParagraphs: string[] = [];
    $('div.page-content p, div.entry-content p, .elementor-widget-text-editor p').each((_i, el) => {
        const text = $(el).text().trim();
        if (text.length > 30 && !text.includes('©') && !text.includes('cookie')) {
            contentParagraphs.push(text);
        }
    });

    if (contentParagraphs.length > 0) {
        // Take first few paragraphs as description (max 500 chars)
        const description = contentParagraphs.slice(0, 3).join(' ').slice(0, 500);
        race.description = description;
    }

    // Try to find distance info on the detail page
    if (race.distances.length === 0) {
        const bodyText = $('body').text();
        const distanceMatch = bodyText.match(/(\d+[.,]?\d*\s*km[\s,/|]*)+/gi);
        if (distanceMatch) {
            const parsed = parseDistances(distanceMatch.join(', '));
            if (parsed.length > 0) {
                race.distances = parsed;
                race.terrain = inferTerrain(parsed);
            }
        }
    }

    // Try to find a registration URL if not already set
    if (!race.registration_url) {
        $('a[href*="championchip"], a[href*="registr"]').each((_i, el) => {
            const href = $(el).attr('href');
            if (href) {
                race.registration_url = href;
                return false; // break
            }
        });
    }

    log.info(`Detail page enriched: ${race.name}`);
});
