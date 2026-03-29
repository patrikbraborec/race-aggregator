import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { router } from './routes.js';
import { uploadRaces } from '@race-aggregator/shared';
import type { RaceInput } from '@race-aggregator/shared';

/** Module-level array to collect all scraped races. */
export const collectedRaces: RaceInput[] = [];

await Actor.init();

interface Input {
    supabaseUrl: string;
    supabaseServiceKey: string;
    maxPages?: number;
    proxyConfig?: object;
}

const input = (await Actor.getInput<Input>()) ?? ({} as Input);

const supabaseUrl = input.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials provided — running in dry-run mode (data saved to dataset only).');
}

const maxPages = input.maxPages ?? 100;

log.info('Starting CeskyBeh scraper', { maxPages });

const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfig);

const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxRequestsPerCrawl: maxPages * 25, // ~25 races per page + detail pages
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 60,
});

await crawler.addRequests([
    {
        url: 'https://ceskybeh.cz/terminovka/?page=0',
        label: 'LIST',
        userData: { maxPages, currentPage: 0 },
    },
]);

await crawler.run();

log.info(`Crawling complete. Collected ${collectedRaces.length} races.`);

if (collectedRaces.length > 0) {
    await Actor.pushData(collectedRaces);
    if (hasSupabase) {
        const result = await uploadRaces(collectedRaces);
        log.info('Upload finished', result);
    } else {
        log.info(`Dry-run complete. ${collectedRaces.length} races saved to dataset.`);
    }
} else {
    log.warning('No races were collected. Skipping upload.');
}

await Actor.exit();
