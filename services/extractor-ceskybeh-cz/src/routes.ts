import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

const CZECH_MONTHS: Record<string, string> = {
    ledna: '01',
    února: '02',
    března: '03',
    dubna: '04',
    května: '05',
    června: '06',
    července: '07',
    srpna: '08',
    září: '09',
    října: '10',
    listopadu: '11',
    prosince: '12',
};

/**
 * Parses Czech date like "10. dubna 2026" or "10. dubna 2026 – 11. dubna 2026" to ISO "YYYY-MM-DD".
 * For date ranges, returns the start date.
 */
function parseDate(raw: string): string {
    const datePart = raw.split('–')[0].trim();
    const match = datePart.match(/(\d{1,2})\.\s*(\w+)\s+(\d{4})/);
    if (!match) return raw;

    const [, day, monthName, year] = match;
    const month = CZECH_MONTHS[monthName.toLowerCase()];
    if (!month) return raw;

    return `${year}-${month}-${day.padStart(2, '0')}`;
}

/**
 * Parses location like "Praha, Psychiatrická nemocnice Bohnice , Kraj: Praha"
 * into city, startPlace, and region.
 */
function parseLocation(raw: string): { city: string; startPlace: string; region: string } {
    const [locationPart, regionPart] = raw.split(/,?\s*Kraj:\s*/);
    const region = regionPart?.trim() ?? '';

    const parts =
        locationPart
            ?.split(',')
            .map((p) => p.trim())
            .filter(Boolean) ?? [];
    const city = parts[0] ?? '';
    const startPlace = parts.slice(1).join(', ').trim();

    return { city, startPlace, region };
}

/**
 * List page handler — enqueues race detail links and pagination pages.
 */
router.addDefaultHandler(async ({ request, enqueueLinks, page, log }) => {
    log.info('Processing list page', { url: request.loadedUrl });

    await page.waitForSelector('.race-single', { timeout: 30_000 });

    const currentUrl = new URL(request.loadedUrl ?? request.url);
    const currentPage = parseInt(currentUrl.searchParams.get('page') ?? '0', 10);

    // On the first page, discover total pages and enqueue all remaining ones
    if (currentPage === 0) {
        const lastPageHref = await page.$eval(
            'nav[aria-label="Stránkování"] li.page-item:last-child a',
            (a) => a.getAttribute('href') ?? '',
        ).catch(() => '');

        const lastPageMatch = lastPageHref.match(/page=(\d+)/);
        if (lastPageMatch) {
            const lastPage = parseInt(lastPageMatch[1], 10);
            log.info(`Found ${lastPage + 1} pages total, enqueuing pages 1-${lastPage}`);

            const pageUrls = [];
            for (let i = 1; i <= lastPage; i++) {
                pageUrls.push(`https://ceskybeh.cz/terminovka/?page=${i}`);
            }
            await enqueueLinks({ urls: pageUrls });
        }
    }

    // Extract race detail URLs from data-location attributes
    const detailUrls = await page.$$eval('.race-single[data-location]', (entries) =>
        entries.map((el) => (el as HTMLElement).dataset.location!.replace(/\?$/, '')).filter(Boolean),
    );

    const enqueuedInfo = await enqueueLinks({
        urls: detailUrls,
        label: 'detail',
    });

    log.info(`Page ${currentPage}: enqueued ${enqueuedInfo.processedRequests.length} race detail URLs`);
});

/**
 * Detail page handler — extracts race data from the detail page.
 */
router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = (await page.$eval('h3', (el) => el.textContent?.trim() ?? '').catch(() => '')) || (await page.title());
    log.info(`Scraping race detail: ${title}`, { url: request.loadedUrl });

    // Extract fields from the detail info paragraphs (each has an icon identifying the field)
    const rawFields = await page.$$eval('.race-detail .col-md-12.text-muted p', (paragraphs) => {
        return paragraphs.map((p) => {
            const icon = p.querySelector('i')?.className ?? '';
            const text = p.textContent?.trim() ?? '';
            const link = p.querySelector('a')?.href ?? '';
            return { icon, text, link };
        });
    });

    const fields: Record<string, string> = {};
    const links: Record<string, string> = {};

    for (const { icon, text, link } of rawFields) {
        if (icon.includes('fa-calendar')) {
            fields.date = text;
        } else if (icon.includes('fa-clock')) {
            fields.startTime = text;
        } else if (icon.includes('fa-map-marker')) {
            fields.location = text;
        } else if (icon.includes('fa-arrows-h')) {
            fields.distance = text;
        } else if (icon.includes('fa-road')) {
            fields.raceType = text;
        } else if (icon.includes('fa-user-circle')) {
            fields.organizer = text;
            if (link) links.organizerWeb = link;
        } else if (icon.includes('fa-globe')) {
            if (link) links.website = link;
        }
    }

    // Extract description
    const description = await page.$eval('.race-detail p.lead', (el) => el.textContent?.trim() ?? '').catch(() => '');

    // Parse date
    const date = fields.date ? parseDate(fields.date) : '';

    // Parse location into city, startPlace, region
    const { city, startPlace, region } = parseLocation(fields.location ?? '');

    // Parse start time (e.g. "Start první kategorie: v 17:30" → "17:30")
    const startTimeMatch = fields.startTime?.match(/(\d{1,2}:\d{2})/);
    const startTime = startTimeMatch?.[1] ?? '';

    // Parse distance (e.g. "Délka tratí: 10 km / 5 km" → "10 km / 5 km")
    const distance = fields.distance?.replace(/^Délka tratí:\s*/, '') ?? '';

    // Parse race type (e.g. "Typ závodu: OCR závod" → "OCR závod")
    const surface = fields.raceType?.replace(/^Typ závodu:\s*/, '') ?? '';

    // Extract contact info (email, phone) from organizer text
    const contactParts: string[] = [];
    const emailMatch = fields.organizer?.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) contactParts.push(emailMatch[0]);
    const phoneMatch = fields.organizer?.match(/\d{3}\s?\d{3}\s?\d{3}/);
    if (phoneMatch) contactParts.push(phoneMatch[0]);
    const contact = contactParts.join(', ');

    const website = links.website || links.organizerWeb || '';

    await pushData({
        url: request.loadedUrl ?? '',
        title: title?.trim() ?? '',
        date,
        city,
        district: '',
        region,
        distance,
        surface,
        cup: '',
        startTime,
        startPlace,
        registrationTime: '',
        registrationPlace: '',
        description,
        website,
        contact,
        facebook: '',
        photos: '',
        rewards: '',
        edition: '',
        feeOnSite: '',
        feePreRegistration: '',
    });
});
