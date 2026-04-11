import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor } from 'apify';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { firefox } from 'playwright';

import { router } from './routes.js';

const START_URL = 'https://www.behej.com/races/index/list';

interface Input {
    maxRequestsPerCrawl: number;
}

await Actor.init();

const { maxRequestsPerCrawl = 0 } = (await Actor.getInput<Input>()) ?? ({} as Input);

const isLocal = !process.env.APIFY_IS_AT_HOME;

let proxyConfiguration;
let proxyUrl: string | undefined;

if (!isLocal) {
    proxyConfiguration = await Actor.createProxyConfiguration({ checkAccess: true });
    proxyUrl = await proxyConfiguration?.newUrl();
}

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: maxRequestsPerCrawl || undefined,
    requestHandler: router,
    // Disable the built-in 403 block detection — camoufox handles anti-bot evasion
    sessionPoolOptions: {
        blockedStatusCodes: [],
    },
    launchContext: {
        launcher: firefox,
        launchOptions: await camoufoxLaunchOptions({
            headless: true,
            proxy: proxyUrl,
            geoip: true,
        }),
    },
});

await crawler.run([START_URL]);

await Actor.exit();
