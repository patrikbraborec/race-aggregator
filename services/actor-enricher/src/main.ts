import { Actor, log } from 'apify';
import { ApifyClient } from 'apify-client';
import { getSupabaseClient } from '@race-aggregator/shared';

interface EnricherInput {
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    apifyToken?: string;
    maxRaces?: number;
    maxCrawlPages?: number;
    dryRun?: boolean;
}

interface CrawlResult {
    url: string;
    text?: string;
    markdown?: string;
    metadata?: {
        title?: string;
        description?: string;
        author?: string;
        languageCode?: string;
    };
}

interface RaceRow {
    id: string;
    slug: string;
    name: string;
    website: string;
    description: string | null;
    registration_url: string | null;
    time_start: string | null;
    price_from: number | null;
    cover_url: string | null;
    elevation_gain: number | null;
    organizer: string | null;
    terrain: string;
}

await Actor.init();

const input = await Actor.getInput<EnricherInput>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const apifyToken = input?.apifyToken ?? process.env.APIFY_TOKEN;
const maxRaces = input?.maxRaces ?? 20;
const maxCrawlPages = input?.maxCrawlPages ?? 2;
const dryRun = input?.dryRun ?? false;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!apifyToken) {
    throw new Error('Missing APIFY_TOKEN — needed to call website-content-crawler');
}

process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;

const supabase = getSupabaseClient();
const apifyClient = new ApifyClient({ token: apifyToken });

// --- Step 1: Find races that need enrichment ---
log.info('Fetching races with websites that need enrichment...');

const today = new Date().toISOString().slice(0, 10);
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const { data: races, error } = await supabase
    .from('races')
    .select('id, slug, name, website, description, registration_url, time_start, price_from, cover_url, elevation_gain, organizer, terrain')
    .eq('status', 'confirmed')
    .not('website', 'is', null)
    .gte('date_start', today)
    .lt('updated_at', sevenDaysAgo) // skip races updated in the last 7 days (already attempted)
    .order('date_start', { ascending: true })
    .limit(200);

if (error) throw error;

// Score each race to find the ones with lowest completeness
function completenessScore(race: RaceRow): number {
    let score = 0;
    if (race.description) score += 15;
    if (race.time_start) score += 10;
    if (race.price_from) score += 10;
    if (race.registration_url) score += 10;
    if (race.cover_url) score += 5;
    if (race.elevation_gain) score += 5;
    if (race.organizer) score += 5;
    return score;
}

const scoredRaces = (races as RaceRow[])
    .map((r) => ({ ...r, score: completenessScore(r) }))
    .filter((r) => r.score < 40) // Only enrich races that are missing significant data
    .sort((a, b) => a.score - b.score)
    .slice(0, maxRaces);

log.info(`Found ${scoredRaces.length} races to enrich (from ${races?.length ?? 0} total with websites).`);

if (scoredRaces.length === 0) {
    log.info('All races are already well-populated. Nothing to do.');
    await Actor.exit();
    process.exit(0);
}

// --- Step 2: Crawl each race website ---
let enriched = 0;
let errors = 0;

for (const race of scoredRaces) {
    try {
        log.info(`Enriching "${race.name}" (${race.website})...`);

        // Run website-content-crawler on the race website
        const run = await apifyClient.actor('apify/website-content-crawler').call(
            {
                startUrls: [{ url: race.website }],
                crawlerType: 'playwright:adaptive',
                maxCrawlDepth: 1,
                maxCrawlPages,
                maxResults: maxCrawlPages,
                saveMarkdown: true,
                removeCookieWarnings: true,
                blockMedia: true,
                htmlTransformer: 'readableText',
                proxyConfiguration: { useApifyProxy: true },
            },
            {
                waitSecs: 120,
                memory: 1024,
            },
        );

        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        const results = items as unknown as CrawlResult[];

        if (results.length === 0) {
            log.warning(`  No content extracted for "${race.name}". Marking as attempted.`);
            await supabase.from('races').update({ updated_at: new Date().toISOString() }).eq('id', race.id);
            continue;
        }

        // --- Step 3: Extract enrichment data from crawled content ---
        const updates: Record<string, unknown> = {};
        const allText = results.map((r) => r.text ?? r.markdown ?? '').join('\n');
        const mainPage = results[0];

        // Description: use metadata description or first meaningful paragraph
        if (!race.description && mainPage?.metadata?.description) {
            updates.description = mainPage.metadata.description.slice(0, 500);
        }

        // Registration URL: look for common patterns
        if (!race.registration_url) {
            const regMatch = allText.match(
                /https?:\/\/[^\s"')]+(?:registr|prihlask|prihlas|signup|entry|entries)[^\s"')]*|https?:\/\/[^\s"')]*(?:is\.)?(?:racetiming|eventival|orgsu|sportchef|stopwatch|myrace|timechip)[^\s"')]*/i,
            );
            if (regMatch) {
                updates.registration_url = regMatch[0].replace(/[.,;:!?)]+$/, '');
            }
        }

        // Price: look for CZK/Kč amounts
        if (!race.price_from) {
            const priceMatches = allText.match(/(\d{2,4})\s*(?:Kč|CZK|,-)/g);
            if (priceMatches) {
                const prices = priceMatches
                    .map((m) => parseInt(m.replace(/[^\d]/g, ''), 10))
                    .filter((p) => p >= 50 && p <= 10000)
                    .sort((a, b) => a - b);
                if (prices.length > 0) {
                    updates.price_from = prices[0];
                    if (prices.length > 1) {
                        updates.price_to = prices[prices.length - 1];
                    }
                }
            }
        }

        // Start time: look for common patterns like "start v 9:00" or "09:00"
        if (!race.time_start) {
            const timeMatch = allText.match(/(?:start|začátek|začíná)[^\n]{0,30}(\d{1,2})[:\.](\d{2})/i);
            if (timeMatch) {
                const hours = timeMatch[1].padStart(2, '0');
                const minutes = timeMatch[2];
                updates.time_start = `${hours}:${minutes}`;
            }
        }

        // Elevation gain for trail/ultra
        if (!race.elevation_gain && (race.terrain === 'trail' || race.terrain === 'ultra')) {
            const elevMatch = allText.match(/(\d{2,5})\s*(?:m\s*)?(?:D\+|d\+|převýšení|elevation|výškové metre|výškový)/i);
            if (elevMatch) {
                const gain = parseInt(elevMatch[1], 10);
                if (gain >= 50 && gain <= 20000) {
                    updates.elevation_gain = gain;
                }
            }
        }

        // Organizer
        if (!race.organizer && mainPage?.metadata?.author) {
            updates.organizer = mainPage.metadata.author;
        }

        // Cover image: try OG image from crawled metadata
        // (website-content-crawler doesn't return OG image directly,
        // but we can try to find it in the HTML or markdown)
        if (!race.cover_url) {
            const imgMatch = allText.match(/https?:\/\/[^\s"')]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"')]*)?/i);
            if (imgMatch) {
                const imgUrl = imgMatch[0];
                // Only use if it looks like a hero/banner image (not an icon)
                if (!imgUrl.includes('favicon') && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
                    updates.cover_url = imgUrl;
                }
            }
        }

        const fieldCount = Object.keys(updates).length;
        if (fieldCount === 0) {
            log.info(`  No new data found for "${race.name}". Marking as attempted.`);
            await supabase.from('races').update({ updated_at: new Date().toISOString() }).eq('id', race.id);
            continue;
        }

        log.info(`  Found ${fieldCount} new fields: ${Object.keys(updates).join(', ')}`);

        if (dryRun) {
            log.info(`  [DRY RUN] Would update "${race.name}" with:`, updates);
            await Actor.pushData({ race_id: race.id, slug: race.slug, name: race.name, updates });
        } else {
            const { error: updateError } = await supabase
                .from('races')
                .update(updates)
                .eq('id', race.id);

            if (updateError) {
                log.error(`  Failed to update "${race.name}": ${updateError.message}`);
                errors++;
            } else {
                log.info(`  Updated "${race.name}" successfully.`);
                enriched++;
                await Actor.pushData({ race_id: race.id, slug: race.slug, name: race.name, updates, status: 'enriched' });
            }
        }
    } catch (err) {
        log.error(`  Error enriching "${race.name}": ${err}`);
        errors++;
    }
}

log.info(`\nEnrichment complete: ${enriched} enriched, ${errors} errors, ${scoredRaces.length - enriched - errors} unchanged.`);

await Actor.exit();
