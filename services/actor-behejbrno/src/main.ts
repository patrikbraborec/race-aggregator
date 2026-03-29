import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';
import { uploadRaces } from '@race-aggregator/shared';
import { router, collectedRaces } from './routes.js';

interface Input {
    supabaseUrl: string;
    supabaseServiceKey: string;
    proxyConfig?: object;
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? ({} as Input);

const supabaseUrl = input.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials — running in dry-run mode (data saved to dataset only).');
}

const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfig);

const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxRequestsPerCrawl: 20,
    maxConcurrency: 2,
});

log.info('Starting BehejBrno scraper...');

await crawler.run(['https://www.behejbrno.com/']);

log.info(`Crawl complete. Collected ${collectedRaces.length} races.`);

if (collectedRaces.length > 0) {
    await Actor.pushData(collectedRaces);
    if (hasSupabase) {
        const result = await uploadRaces(collectedRaces);
        log.info(`Upload result: ${result.inserted} inserted/updated, ${result.errors} errors`);
    } else {
        log.info(`Dry-run complete. ${collectedRaces.length} races saved to dataset.`);
    }
} else {
    log.warning('No races collected — nothing to upload.');
}

await Actor.exit();
