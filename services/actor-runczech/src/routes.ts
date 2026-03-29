import { createPlaywrightRouter, log } from 'crawlee';
import type { PlaywrightCrawlingContext } from 'crawlee';
import {
    generateSlug,
    parseDate,
    parseDistances,
    inferTerrain,
    getRegion,
    type RaceInput,
    type RaceDistance,
} from '@race-aggregator/shared';

export const collectedRaces: RaceInput[] = [];

export const router = createPlaywrightRouter();

/**
 * Dismiss the cookie consent banner if present.
 */
async function dismissCookieConsent(page: PlaywrightCrawlingContext['page']): Promise<void> {
    try {
        const acceptButton = page.locator('#dcb-action-agree-all1');
        if (await acceptButton.isVisible({ timeout: 3000 })) {
            await acceptButton.click();
            log.debug('Cookie consent dismissed.');
            // Wait for banner to disappear
            await page.waitForTimeout(500);
        }
    } catch {
        // Banner not present or already dismissed
    }
}

/**
 * Parse a Czech date range string into start and end ISO dates.
 * Handles formats like:
 *   "2. - 3. května 2026"
 *   "31. Březen - 3. května 2026"
 *   "16. května 2026" (single date)
 */
function parseDateRange(raw: string): { dateStart: string | null; dateEnd: string | null } {
    const trimmed = raw.trim();

    // Single date: "16. května 2026" or "16. 5. 2026"
    const singleDate = parseDate(trimmed);
    if (singleDate) {
        return { dateStart: singleDate, dateEnd: null };
    }

    // Range with dash separator: "2. - 3. května 2026" or "31. Březen - 3. května 2026"
    const dashIndex = trimmed.indexOf(' - ');
    if (dashIndex === -1) {
        return { dateStart: null, dateEnd: null };
    }

    const leftPart = trimmed.slice(0, dashIndex).trim();
    const rightPart = trimmed.slice(dashIndex + 3).trim();

    // Parse the end date first (it usually has the full date info)
    const dateEnd = parseDate(rightPart);

    // The start part may be just a day number like "2." — borrow month/year from end
    let dateStart: string | null = null;
    if (dateEnd) {
        // Try parsing start part directly
        dateStart = parseDate(leftPart);

        if (!dateStart) {
            // Start is likely just "2." or "31. Březen" without a year
            // Borrow year (and possibly month) from end date
            const dayMatch = leftPart.match(/^(\d{1,2})\.\s*(.*)$/);
            if (dayMatch) {
                const [, day, rest] = dayMatch;
                const [endYear, endMonth] = dateEnd.split('-');

                if (rest.trim()) {
                    // Has month name like "31. Březen"  — try with end year appended
                    const withYear = `${leftPart} ${endYear}`;
                    dateStart = parseDate(withYear);
                }

                if (!dateStart) {
                    // Just a day number — use same month/year as end
                    dateStart = `${endYear}-${endMonth}-${day.padStart(2, '0')}`;
                }
            }
        }
    }

    return { dateStart, dateEnd };
}

/**
 * Extract distance labels from text and convert to RaceDistance array.
 * RunCzech uses labels like "Marathon", "Half Marathon", "10 km", "5 km",
 * "dm rodinná míle", "dm bambini run", "2Run".
 */
function extractDistances(distanceTexts: string[]): RaceDistance[] {
    const distances: RaceDistance[] = [];

    for (const text of distanceTexts) {
        const trimmed = text.trim().toLowerCase();
        if (!trimmed) continue;

        // Map known RunCzech distance labels to km values
        if (trimmed.includes('marathon') && !trimmed.includes('half') && !trimmed.includes('půl')) {
            // Check if it's a relay
            if (trimmed.includes('relay') || trimmed.includes('pair') || trimmed.includes('štafet')) {
                distances.push({ label: 'Maratonská štafeta', km: 42.195 });
            } else {
                distances.push({ label: 'Maraton', km: 42.195 });
            }
        } else if (trimmed.includes('half marathon') || trimmed.includes('půlmaraton')) {
            distances.push({ label: 'Půlmaraton', km: 21.0975 });
        } else if (trimmed.includes('relay half') || trimmed.includes('štafeta')) {
            distances.push({ label: 'Půlmaratonská štafeta', km: 21.0975 });
        } else if (trimmed.includes('2run')) {
            distances.push({ label: '2Run (štafeta)', km: 21.0975 });
        } else if (trimmed.includes('rodinná míle') || trimmed.includes('family mile')) {
            distances.push({ label: 'Rodinná míle', km: 1.609 });
        } else if (trimmed.includes('bambini')) {
            distances.push({ label: 'Bambini run', km: 0.2 });
        } else if (trimmed.includes('breakfast') || trimmed.includes('snídaňový')) {
            distances.push({ label: 'Breakfast Run', km: 4.2 });
        } else {
            // Try to parse numeric distances like "10 km", "5 km", "12 km", "22 km"
            const parsed = parseDistances(text);
            if (parsed.length > 0) {
                distances.push(...parsed);
            }
        }
    }

    return distances;
}

// ── LISTING page handler ─────────────────────────────────────────────────────

router.addHandler('LISTING', async ({ page, enqueueLinks }: PlaywrightCrawlingContext) => {
    log.info('Processing RunCzech events listing page...');

    await dismissCookieConsent(page);

    // Wait for the events to load
    await page.waitForSelector('h3 a[href*="/cs/akce/"]', { timeout: 15000 });

    // Extract all event links from the listing page and enqueue them as DETAIL pages.
    // The listing page shows race cards with h3 headings containing links.
    const eventLinks = await page.$$eval('h3 a[href*="/cs/akce/"]', (anchors) =>
        anchors
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => href && !href.endsWith('/cs/akce') && !href.endsWith('/cs/akce/')),
    );

    log.info(`Found ${eventLinks.length} event detail links on listing page.`);

    // Enqueue each detail page
    await enqueueLinks({
        urls: eventLinks,
        label: 'DETAIL',
    });

    // Also try to load other years if a year selector is present
    try {
        const yearSelect = page.locator('#js-selected-year, select[name*="year"]');
        if (await yearSelect.isVisible({ timeout: 2000 })) {
            const years = await yearSelect.locator('option').allTextContents();
            const currentYear = new Date().getFullYear().toString();

            for (const year of years) {
                const yearTrimmed = year.trim();
                // Only scrape current year and future years
                if (yearTrimmed && parseInt(yearTrimmed, 10) >= parseInt(currentYear, 10)) {
                    const yearUrl = `https://www.runczech.com/cs/akce?selected_year=${yearTrimmed}`;
                    log.info(`Enqueueing year filter: ${yearTrimmed}`);
                    await enqueueLinks({
                        urls: [yearUrl],
                        label: 'LISTING',
                    });
                }
            }
        }
    } catch {
        log.debug('No year selector found or not interactive.');
    }
});

// ── DETAIL page handler ──────────────────────────────────────────────────────

router.addHandler('DETAIL', async ({ page, request }: PlaywrightCrawlingContext) => {
    log.info(`Processing detail page: ${request.url}`);

    await dismissCookieConsent(page);

    // Wait for main content to load
    await page.waitForSelector('h1, h2', { timeout: 15000 });

    // Extract race name from the page heading
    const name = await page.$eval('h1', (el) => el.textContent?.trim() ?? '').catch(() => '');
    if (!name) {
        log.warning(`No race name found on ${request.url}, skipping.`);
        return;
    }

    log.info(`Scraping race: ${name}`);

    // Extract description — look for introductory paragraph text
    const description = await page.$$eval(
        'main p, article p, .content p, [class*="desc"] p, [class*="intro"] p',
        (paragraphs) => {
            const texts = paragraphs
                .map((p) => p.textContent?.trim() ?? '')
                .filter((t) => t.length > 30 && !t.includes('cookie'));
            return texts.slice(0, 3).join('\n\n') || null;
        },
    ).catch(() => null);

    // Extract all visible date text from the page
    const dateText = await page.evaluate(() => {
        const body = document.body.textContent ?? '';
        // Look for Czech date patterns in the page
        const datePatterns = body.match(
            /\d{1,2}\.\s*(?:\d{1,2}\.\s*\d{4}|[a-záčďéěíňóřšťúůýž]+\s+\d{4})/gi,
        );
        return datePatterns?.[0] ?? '';
    });

    // Also try to find date range text (e.g., "2. - 3. května 2026")
    const dateRangeText = await page.evaluate(() => {
        const body = document.body.textContent ?? '';
        const rangePattern = body.match(
            /\d{1,2}\.\s*(?:[a-záčďéěíňóřšťúůýž]*)\s*-\s*\d{1,2}\.\s*[a-záčďéěíňóřšťúůýž]+\s+\d{4}/gi,
        );
        return rangePattern?.[0] ?? '';
    });

    const { dateStart, dateEnd } = parseDateRange(dateRangeText || dateText);

    if (!dateStart) {
        log.warning(`Could not parse date for "${name}" from text: "${dateRangeText || dateText}". Skipping.`);
        return;
    }

    // Extract city from the page — try meta tags, breadcrumbs, or visible location info
    const city = await page.evaluate(() => {
        // Try to find city from common locations on the page
        const czechCities = [
            'Praha', 'Prague', 'Karlovy Vary', 'České Budějovice', 'Olomouc',
            'Ústí nad Labem', 'Liberec', 'Brno', 'Ostrava', 'Plzeň',
        ];
        const bodyText = document.body.textContent ?? '';
        for (const city of czechCities) {
            if (bodyText.includes(city)) return city;
        }
        return '';
    });

    // Normalize "Prague" to "Praha"
    const normalizedCity = city === 'Prague' ? 'Praha' : city;

    if (!normalizedCity) {
        log.warning(`Could not determine city for "${name}". Skipping.`);
        return;
    }

    // Extract distances from event detail tables/lists
    const distanceTexts = await page.$$eval(
        // RunCzech detail pages have race/event tables or lists with distance info
        'table td, table th, li, [class*="race"] *, [class*="event"] *, [class*="distance"] *',
        (elements) => {
            const distanceKeywords = [
                'marathon', 'maraton', 'half', 'půl', '10 km', '5 km', '21 km', '42 km',
                'km', 'míle', 'mile', 'bambini', '2run', 'relay', 'štafet', 'breakfast',
                '12 km', '22 km',
            ];
            const seen = new Set<string>();
            const result: string[] = [];
            for (const el of elements) {
                const text = el.textContent?.trim() ?? '';
                if (text.length > 2 && text.length < 100 && !seen.has(text)) {
                    const lower = text.toLowerCase();
                    if (distanceKeywords.some((kw) => lower.includes(kw))) {
                        seen.add(text);
                        result.push(text);
                    }
                }
            }
            return result;
        },
    ).catch(() => []);

    const distances = extractDistances(distanceTexts);

    // If we couldn't find distances from structured elements, try from slug/name
    if (distances.length === 0) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('maraton') || nameLower.includes('marathon')) {
            distances.push({ label: 'Maraton', km: 42.195 });
        }
        if (nameLower.includes('10 km')) {
            distances.push({ label: '10 km', km: 10 });
        }
        if (nameLower.includes('5 km')) {
            distances.push({ label: '5 km', km: 5 });
        }
    }

    const terrain = inferTerrain(distances);

    // Extract registration URL
    const registrationUrl = await page.$$eval('a[href*="register.runczech"]', (anchors) => {
        const hrefs = anchors.map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
        return hrefs[0] ?? null;
    }).catch(() => null);

    // Extract capacity if mentioned
    const capacity = await page.evaluate(() => {
        const bodyText = document.body.textContent ?? '';
        // Look for patterns like "10 600 runners" or "kapacita: 10600"
        const capacityMatch = bodyText.match(/(\d[\d\s]*\d)\s*(?:runner|běžc|závodn|účastn|startuj)/i)
            ?? bodyText.match(/kapacit[ay][\s:]*(\d[\d\s]*\d)/i);
        if (capacityMatch) {
            return parseInt(capacityMatch[1].replace(/\s/g, ''), 10) || null;
        }
        return null;
    });

    // Extract cover image
    const coverUrl = await page.$eval(
        'meta[property="og:image"]',
        (el) => (el as HTMLMetaElement).content || null,
    ).catch(() => null);

    // Build the RaceInput object
    const slug = generateSlug(name, dateStart);
    const region = getRegion(normalizedCity);

    const race: RaceInput = {
        slug,
        name,
        description,
        date_start: dateStart,
        date_end: dateEnd,
        time_start: null,
        city: normalizedCity,
        region,
        country: 'CZ',
        distances: distances.length > 0 ? distances : [{ label: 'Neuvedeno', km: 0 }],
        terrain,
        website: request.url,
        registration_url: registrationUrl,
        cover_url: coverUrl,
        organizer: 'RunCzech',
        organizer_url: 'https://www.runczech.com',
        status: 'confirmed',
        source: 'runczech',
        source_id: request.url.split('/').pop() ?? null,
        capacity,
        tags: ['runczech'],
    };

    collectedRaces.push(race);
    log.info(`Collected race: ${name} (${dateStart}, ${normalizedCity}, ${distances.length} distances)`);
});

// ── DEFAULT handler (fallback) ───────────────────────────────────────────────

router.addDefaultHandler(async ({ request }: PlaywrightCrawlingContext) => {
    log.warning(`Unhandled route: ${request.url}`);
});
