import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

/**
 * List page handler — enqueues race detail links and pagination links.
 *
 * svetbehu.cz uses server-rendered pagination at /terminovka/strana/{N}/.
 * Race detail pages follow the pattern /terminovka/{race-slug}/.
 */
router.addDefaultHandler(async ({ enqueueLinks, page, log, crawler }) => {
    const url = page.url();
    log.info('Processing list page', { url });

    // On the first page, discover all pagination pages by extracting the last page number
    // and enqueuing every page URL. This avoids relying on the ellipsis-based pagination
    // links which only show a few nearby pages (e.g. 2, 3, …, 24).
    const isFirstPage = !url.includes('/strana/');
    if (isFirstPage) {
        const lastPage = await page.evaluate(() => {
            const paginationLinks = document.querySelectorAll('a[href*="/strana/"]');
            let max = 1;
            for (const link of paginationLinks) {
                const match = link.getAttribute('href')?.match(/\/strana\/(\d+)\//);
                if (match) max = Math.max(max, parseInt(match[1], 10));
            }
            return max;
        });

        if (lastPage > 1) {
            const pageUrls = [];
            for (let i = 2; i <= lastPage; i++) {
                pageUrls.push({ url: `https://www.svetbehu.cz/terminovka/strana/${i}/` });
            }
            await crawler.addRequests(pageUrls);
            log.info(`Enqueued all ${lastPage - 1} pagination pages (2–${lastPage})`);
        }
    }

    // Enqueue race detail links — single-segment paths under /terminovka/
    // Exclude pagination (/strana/) and filter (/mesic/) paths
    const enqueuedInfo = await enqueueLinks({
        globs: ['https://www.svetbehu.cz/terminovka/*/'],
        exclude: ['https://www.svetbehu.cz/terminovka/strana/**', 'https://www.svetbehu.cz/terminovka/mesic/**'],
        label: 'detail',
    });

    log.info(`Enqueued ${enqueuedInfo.processedRequests.length} race detail URLs`);
});

/**
 * Label-to-field mapping for the detail page.
 * Keys are Czech labels (lowercase), values are internal field names.
 */
const FIELD_MAP: Record<string, string> = {
    'datum konání': 'date',
    'lokalita': 'region',
    'místo konání': 'venue',
    'délka (km)': 'distance',
    'povrch': 'surface',
    'pohár': 'cup',
    'ročník': 'edition',
    'místo a čas prezence': 'registration',
    'místo a čas startu': 'start',
    'odměny': 'rewards',
    'kontakt': 'contact',
    'startovné předem': 'feePreRegistration',
    'startovné na místě': 'feeOnSite',
};

/**
 * Parses Czech date format "D. M. YYYY" or "DD.MM.YYYY" into ISO "YYYY-MM-DD".
 */
function parseDate(raw: string): string {
    const cleaned = raw.replace(/\s/g, '');
    const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) return raw;
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Splits a combined "place, HH:MM" field into separate place and time parts.
 */
function splitPlaceAndTime(raw: string): { place: string; time: string } {
    const timeMatch = raw.match(/(\d{1,2}[:.]\d{2})/);
    if (!timeMatch) return { place: raw.trim(), time: '' };

    const time = timeMatch[1].replace('.', ':');
    const place = raw
        .replace(timeMatch[0], '')
        .replace(/,\s*$/, '')
        .replace(/^\s*,/, '')
        .trim();
    return { place, time };
}

/**
 * Detail page handler — extracts all available fields from the race detail page.
 *
 * HTML structure uses:
 * - .terms__item > .terms__note (label) + .terms__text (value) for primary fields
 * - .parameters__item > .parameters__title (label) + .parameters__value (value) for secondary fields
 * - a.race-social-links__item--web for website URL
 * - a.race-social-links__item--facebook for Facebook URL
 */
router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = (await page.locator('h1').first().textContent()) ?? (await page.title());
    log.info(`Scraping race detail: ${title}`, { url: request.loadedUrl });

    const data = await page.evaluate(() => {
        const labels: Record<string, string> = {};

        // 1. Primary fields: .terms__item containers
        const termsItems = document.querySelectorAll('.terms__item');
        for (const item of termsItems) {
            const label = item.querySelector('.terms__note')?.textContent?.trim().toLowerCase() ?? '';
            const valueEl = item.querySelector('.terms__text');
            if (!label || !valueEl) continue;

            const link = valueEl.querySelector('a');
            const value = link?.textContent?.trim() || valueEl.textContent?.trim() || '';
            if (value) labels[label] = value;
        }

        // 2. Secondary fields: .parameters__item containers
        const paramItems = document.querySelectorAll('.parameters__item');
        for (const item of paramItems) {
            const label = item.querySelector('.parameters__title')?.textContent?.trim().toLowerCase() ?? '';
            const valueEl = item.querySelector('.parameters__value:not(.race-social-links)');
            const value = valueEl?.textContent?.trim() ?? '';
            if (label && value) labels[label] = value;
        }

        // 3. Website URL from social links
        const websiteLink = document.querySelector('a.race-social-links__item--web') as HTMLAnchorElement | null;
        const websiteUrl = websiteLink?.href ?? '';

        // 4. Facebook URL from social links
        const facebookLink = document.querySelector(
            'a.race-social-links__item--facebook',
        ) as HTMLAnchorElement | null;
        const facebookUrl = facebookLink?.href ?? '';

        // 5. Description text
        const descEl = document.querySelector('.w-lg-75 p');
        const descriptionText = descEl?.textContent?.trim() ?? '';

        return { labels, websiteUrl, facebookUrl, descriptionText };
    });

    // Map Czech labels to standardized field names
    const fields: Record<string, string> = {};
    for (const [label, value] of Object.entries(data.labels)) {
        const fieldName = FIELD_MAP[label];
        if (fieldName && value) {
            fields[fieldName] = value;
        }
    }

    const date = fields.date ? parseDate(fields.date) : '';
    const { place: startPlace, time: startTime } = splitPlaceAndTime(fields.start ?? '');
    const { place: registrationPlace, time: registrationTime } = splitPlaceAndTime(fields.registration ?? '');

    await pushData({
        url: request.loadedUrl ?? '',
        title: title?.trim() ?? '',
        date,
        city: fields.venue ?? '',
        district: '',
        region: fields.region ?? '',
        distance: fields.distance ?? '',
        surface: fields.surface ?? '',
        cup: fields.cup ?? '',
        startTime,
        startPlace,
        registrationTime,
        registrationPlace,
        description: data.descriptionText,
        website: data.websiteUrl,
        contact: fields.contact ?? '',
        facebook: data.facebookUrl,
        photos: '',
        rewards: fields.rewards ?? '',
        edition: fields.edition ?? '',
        feeOnSite: fields.feeOnSite ?? '',
        feePreRegistration: fields.feePreRegistration ?? '',
    });
});
