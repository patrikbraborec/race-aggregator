import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { uploadRaces } from '@race-aggregator/shared';
import { router, state } from './routes.js';

interface Input {
    supabaseUrl: string;
    supabaseServiceKey: string;
    maxPages?: number;
    proxyConfig?: object;
}

await Actor.init();

const input = await Actor.getInput<Input>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials — running in dry-run mode (data saved to dataset only).');
}

// Configure shared state for route handlers
state.maxPages = input?.maxPages ?? 100;

const proxyConfiguration = await Actor.createProxyConfiguration(input?.proxyConfig);

const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxConcurrency: 5,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 60,
});

log.info('Starting bezeckyzavod.cz scraper');

await crawler.run([
    { url: 'https://www.bezeckyzavod.cz/', label: 'HOMEPAGE' },
]);

log.info(`Crawling finished. Collected ${state.races.length} races.`);

if (state.races.length > 0) {
    await Actor.pushData(state.races);
    if (hasSupabase) {
        const result = await uploadRaces(state.races);
        log.info(`Upload complete: ${result.inserted} inserted/updated, ${result.errors} errors`);
    } else {
        log.info(`Dry-run complete. ${state.races.length} races saved to dataset.`);
    }
} else {
    log.warning('No races collected, skipping upload.');
}

await Actor.exit();
