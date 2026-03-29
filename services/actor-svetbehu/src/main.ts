import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { uploadRaces } from '@race-aggregator/shared';
import { router, collectedRaces } from './routes.js';

await Actor.init();

const input = await Actor.getInput<{
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    maxPages?: number;
    proxyConfig?: object;
}>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const maxPages = input?.maxPages ?? 25;

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials — running in dry-run mode (data saved to dataset only).');
}

const proxyConfiguration = await Actor.createProxyConfiguration(input?.proxyConfig);

// Build the list of start URLs for all pages up to maxPages
const startUrls = [
    { url: 'https://www.svetbehu.cz/terminovka/', label: 'LIST', userData: { page: 1 } },
];

for (let page = 2; page <= maxPages; page++) {
    startUrls.push({
        url: `https://www.svetbehu.cz/terminovka/strana/${page}/`,
        label: 'LIST',
        userData: { page },
    });
}

const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxConcurrency: 3,
    maxRequestsPerMinute: 60,
    requestHandlerTimeoutSecs: 30,
});

log.info(`Starting Svet Behu scraper (up to ${maxPages} pages)...`);

await crawler.run(startUrls);

log.info(`Crawling finished. Collected ${collectedRaces.length} races.`);

if (collectedRaces.length > 0) {
    await Actor.pushData(collectedRaces);
    if (hasSupabase) {
        const result = await uploadRaces(collectedRaces);
        log.info(`Upload complete: ${result.inserted} inserted/updated, ${result.errors} errors.`);
    } else {
        log.info(`Dry-run complete. ${collectedRaces.length} races saved to dataset.`);
    }
} else {
    log.warning('No races collected. Nothing to upload.');
}

await Actor.exit();
