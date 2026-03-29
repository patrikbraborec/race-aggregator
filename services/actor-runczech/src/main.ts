import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { uploadRaces } from '@race-aggregator/shared';
import { router, collectedRaces } from './routes.js';

await Actor.init();

const input = await Actor.getInput<{
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    proxyConfig?: object;
}>();

const supabaseUrl = input?.supabaseUrl ?? process.env.SUPABASE_URL;
const supabaseServiceKey = input?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
if (hasSupabase) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
} else {
    log.warning('No Supabase credentials — running in dry-run mode (data saved to dataset only).');
}

const proxyConfiguration = await Actor.createProxyConfiguration(input?.proxyConfig);

const crawler = new PlaywrightCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    headless: true,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu'],
        },
    },
    preNavigationHooks: [
        async ({ page }) => {
            // Block unnecessary resources to speed up crawling
            await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,eot}', (route) => route.abort());
        },
    ],
});

log.info('Starting RunCzech scraper...');

await crawler.run([{ url: 'https://www.runczech.com/cs/akce', label: 'LISTING' }]);

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
