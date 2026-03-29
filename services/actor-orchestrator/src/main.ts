import { Actor, log } from 'apify';
import { ApifyClient } from 'apify-client';

/**
 * Race Pipeline Orchestrator
 *
 * Runs the full pipeline in strict order:
 *   1. All 7 scrapers in parallel (wait for all to finish)
 *   2. Deduplication actor (wait for completion)
 *   3. Enricher actor (wait for completion)
 *
 * Schedule this single actor daily instead of scheduling each actor separately.
 * This guarantees correct ordering and prevents enriched data from being overwritten.
 */

const SCRAPERS = [
    'actor-behej',
    'actor-behejbrno',
    'actor-bezeckyzavod',
    'actor-ceskybeh',
    'actor-finishers',
    'actor-runczech',
    'actor-svetbehu',
];

const DEDUP_ACTOR = 'actor-dedup';
const ENRICHER_ACTOR = 'actor-enricher';

const POLL_INTERVAL_MS = 10_000; // 10 seconds

interface StageResult {
    actor: string;
    status: 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
    durationSecs: number;
    runId?: string;
}

/**
 * Resolve an actor name to its full ID.
 * Tries the current user's namespace first (e.g., "username/actor-behej").
 * If the actor name already contains a slash, use it as-is.
 */
async function resolveActorId(client: ApifyClient, name: string): Promise<string> {
    if (name.includes('/')) return name;

    const user = await client.user().get();
    if (!user) throw new Error('Failed to get Apify user info');

    return `${user.username}/${name}`;
}

/**
 * Start an actor run and wait for it to finish, with a timeout.
 */
async function runAndWait(
    client: ApifyClient,
    actorName: string,
    timeoutSecs: number,
): Promise<StageResult> {
    const start = Date.now();
    const actorId = await resolveActorId(client, actorName);

    log.info(`Starting ${actorName}...`);

    const run = await client.actor(actorId).start();
    const runId = run.id;

    log.info(`  ${actorName} started (run: ${runId})`);

    // Poll until finished or timeout
    const deadline = Date.now() + timeoutSecs * 1000;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const status = await client.run(runId).get();
        if (!status) {
            log.error(`  ${actorName}: run ${runId} not found`);
            return { actor: actorName, status: 'FAILED', durationSecs: elapsed(start), runId };
        }

        if (status.status === 'SUCCEEDED') {
            const dur = elapsed(start);
            log.info(`  ${actorName} succeeded in ${dur}s`);
            return { actor: actorName, status: 'SUCCEEDED', durationSecs: dur, runId };
        }

        if (status.status === 'FAILED' || status.status === 'ABORTED') {
            const dur = elapsed(start);
            log.error(`  ${actorName} ${status.status} after ${dur}s`);
            return { actor: actorName, status: status.status as StageResult['status'], durationSecs: dur, runId };
        }

        // Still running — continue polling
    }

    // Timeout — abort the run
    log.warning(`  ${actorName} timed out after ${timeoutSecs}s, aborting...`);
    await client.run(runId).abort();
    return { actor: actorName, status: 'TIMED-OUT', durationSecs: elapsed(start), runId };
}

function elapsed(start: number): number {
    return Math.round((Date.now() - start) / 1000);
}

// --- Main ---

await Actor.init();

const input = await Actor.getInput<{
    scraperTimeoutSecs?: number;
    dedupTimeoutSecs?: number;
    enricherTimeoutSecs?: number;
    skipEnricher?: boolean;
}>();

const scraperTimeout = input?.scraperTimeoutSecs ?? 1800;
const dedupTimeout = input?.dedupTimeoutSecs ?? 600;
const enricherTimeout = input?.enricherTimeoutSecs ?? 1800;
const skipEnricher = input?.skipEnricher ?? false;

const token = process.env.APIFY_TOKEN;
if (!token) {
    log.error('Missing APIFY_TOKEN environment variable.');
    await Actor.exit({ exitCode: 1 });
    process.exit(1);
}

const client = new ApifyClient({ token });
const pipelineStart = Date.now();
const report: StageResult[] = [];

// --- Stage 1: Run all scrapers in parallel ---
log.info('=== Stage 1: Scrapers (parallel) ===');

const scraperResults = await Promise.all(
    SCRAPERS.map((name) => runAndWait(client, name, scraperTimeout)),
);
report.push(...scraperResults);

const succeeded = scraperResults.filter((r) => r.status === 'SUCCEEDED').length;
const failed = scraperResults.filter((r) => r.status !== 'SUCCEEDED').length;
log.info(`Scrapers done: ${succeeded} succeeded, ${failed} failed.`);

// Continue even if some scrapers fail — partial data is better than none

// --- Stage 2: Deduplication ---
log.info('=== Stage 2: Deduplication ===');

const dedupResult = await runAndWait(client, DEDUP_ACTOR, dedupTimeout);
report.push(dedupResult);

if (dedupResult.status !== 'SUCCEEDED') {
    log.warning(`Dedup ${dedupResult.status} — continuing to enricher anyway.`);
}

// --- Stage 3: Enrichment ---
if (skipEnricher) {
    log.info('=== Stage 3: Enricher (skipped) ===');
} else {
    log.info('=== Stage 3: Enrichment ===');

    const enricherResult = await runAndWait(client, ENRICHER_ACTOR, enricherTimeout);
    report.push(enricherResult);
}

// --- Summary ---
const totalDuration = elapsed(pipelineStart);
const allSucceeded = report.every((r) => r.status === 'SUCCEEDED');

log.info('=== Pipeline Complete ===');
log.info(`Total duration: ${totalDuration}s`);
log.info(`Overall status: ${allSucceeded ? 'ALL SUCCEEDED' : 'SOME FAILURES'}`);

for (const r of report) {
    log.info(`  ${r.actor}: ${r.status} (${r.durationSecs}s)`);
}

await Actor.pushData({
    pipelineStatus: allSucceeded ? 'SUCCEEDED' : 'PARTIAL_FAILURE',
    totalDurationSecs: totalDuration,
    stages: report,
    timestamp: new Date().toISOString(),
});

await Actor.exit({ exitCode: allSucceeded ? 0 : 1 });
