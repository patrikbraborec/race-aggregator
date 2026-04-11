import { PlaywrightCrawler, purgeDefaultStorages } from '@crawlee/playwright';
import { beforeAll, describe, expect, it } from 'vitest';

import { router } from '../src/routes.js';

describe('CeskybehCrawler', () => {
    beforeAll(async () => {
        await purgeDefaultStorages();
    });

    it('should crawl list and detail pages and push structured data', async () => {
        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: 5,
            requestHandler: router,
        });

        await crawler.run(['https://ceskybeh.cz/terminovka/?page=0']);

        expect(crawler.stats.state.requestsFinished).toBeGreaterThanOrEqual(2);

        const { items } = await crawler.getData();
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].url).toBeDefined();
        expect(items[0].title).toBeDefined();
        expect(items[0].date).toBeDefined();
        expect(items[0].city).toBeDefined();
    }, 60_000);
});
