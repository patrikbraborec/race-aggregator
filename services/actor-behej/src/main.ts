import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { uploadRaces } from '@race-aggregator/shared';
import { router, collectedRaces } from './routes.js';

await Actor.init();

const input = await Actor.getInput<{
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    filter?: string;
    proxyConfig?: object;
}>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const filter = input?.filter ?? '12-months';

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials — running in dry-run mode (data saved to dataset only).');
}

const proxyConfiguration = await Actor.createProxyConfiguration(input?.proxyConfig);

const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxConcurrency: 1,
    additionalMimeTypes: ['application/json'],
});

const apiUrl = `https://www.behej.com/races/index/testraces?filter=${filter}&sport=1`;
log.info(`Starting Behej.com scraper with filter="${filter}"...`);

await crawler.run([{ url: apiUrl, label: 'API' }]);

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
