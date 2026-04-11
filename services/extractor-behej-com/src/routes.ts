import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

/**
 * List page handler — enqueues all race detail links from the table.
 *
 * The race table is populated via AJAX: getRaces() fetches JSON from
 * /races/index/testraces and inserts rows with writeRaceToTable().
 * We must wait for that to finish before enqueuing links.
 */
router.addDefaultHandler(async ({ enqueueLinks, page, log }) => {
    log.info('Enqueuing race detail URLs from list page');

    // Wait for the AJAX-populated race count text — it's written after all rows are inserted.
    await page.waitForSelector('#number-info:not(:empty)', { timeout: 60_000 });

    const countText = await page.$eval('#number-info', (el) => el.textContent?.trim() ?? '');
    log.info(`Race list loaded: ${countText}`);

    const enqueuedInfo = await enqueueLinks({
        globs: ['https://www.behej.com/zavod/*'],
        label: 'detail',
    });

    log.info(`Enqueued ${enqueuedInfo.processedRequests.length} race detail URLs`);
});

/**
 * Label-to-field mapping for the detail page table.
 * Keys are Czech labels (lowercase, without colon), values are standardized field names.
 */
const FIELD_MAP: Record<string, string> = {
    'den': 'date',
    'místo': 'location',
    'poháry': 'cup',
    'délka hlavní tratě pro muže a ženy': 'distance',
    'povrch': 'surface',
    'popis trati': 'description',
    'čas prezentace': 'registrationTime',
    'místo prezentace': 'registrationPlace',
    'čas startu': 'startTime',
    'místo startu': 'startPlace',
    'odměny': 'rewards',
    'webové stránky': 'website',
    'facebook': 'facebook',
    'fotky': 'photos',
    'kontakty': 'contact',
    'ročník': 'edition',
    'startovné na místě': 'feeOnSite',
    'startovné předem': 'feePreRegistration',
};

/**
 * Parses Czech date format "DD.MM.YYYY" or "D. M. YYYY" into ISO "YYYY-MM-DD".
 */
function parseDate(raw: string): string {
    const cleaned = raw.replace(/\s/g, '');
    const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) return raw;
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parses location string like "Karlovy Vary, okres Karlovy Vary, kraj Karlovarský kraj"
 * into structured parts.
 */
function parseLocation(raw: string): { city: string; district: string; region: string } {
    const parts = raw.split(',').map((p) => p.trim());
    const city = parts[0] ?? '';
    const district = parts.find((p) => p.startsWith('okres '))?.replace('okres ', '') ?? '';
    const region = parts.find((p) => p.startsWith('kraj '))?.replace('kraj ', '') ?? '';
    return { city, district, region };
}

/**
 * Detail page handler — extracts all available fields from the race table.
 */
router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = await page.locator('h1').first().textContent() ?? await page.title();
    log.info(`Scraping race detail: ${title}`, { url: request.loadedUrl });

    // Extract all key-value rows from the race detail table
    const rawFields = await page.$$eval('table.race tbody tr', (rows) => {
        return rows.map((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return null;

            const label = cells[0]?.textContent?.trim().replace(/:$/, '').toLowerCase() ?? '';
            const valueCell = cells[1];
            const link = valueCell?.querySelector('a');
            const value = link?.href || valueCell?.textContent?.trim() || '';

            return { label, value };
        }).filter((r): r is { label: string; value: string } => r !== null && r.label !== '');
    });

    // Map Czech labels to standardized field names
    const fields: Record<string, string> = {};
    for (const { label, value } of rawFields) {
        const fieldName = FIELD_MAP[label];
        if (fieldName && value) {
            fields[fieldName] = value;
        }
    }

    // Standardize date
    const date = fields.date ? parseDate(fields.date) : '';

    // Standardize location
    const { city, district, region } = parseLocation(fields.location ?? '');

    await pushData({
        url: request.loadedUrl ?? '',
        title: title?.trim() ?? '',
        date,
        city,
        district,
        region,
        distance: fields.distance ?? '',
        surface: fields.surface ?? '',
        cup: fields.cup ?? '',
        startTime: fields.startTime ?? '',
        startPlace: fields.startPlace ?? '',
        registrationTime: fields.registrationTime ?? '',
        registrationPlace: fields.registrationPlace ?? '',
        description: fields.description ?? '',
        website: fields.website ?? '',
        contact: fields.contact ?? '',
        facebook: fields.facebook ?? '',
        photos: fields.photos ?? '',
        rewards: fields.rewards ?? '',
        edition: fields.edition ?? '',
        feeOnSite: fields.feeOnSite ?? '',
        feePreRegistration: fields.feePreRegistration ?? '',
    });
});
