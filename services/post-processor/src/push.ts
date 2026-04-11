import { createClient } from '@supabase/supabase-js';
import type { MergedRace } from './types.js';

const BATCH_SIZE = 100;

/**
 * Upsert merged races into Supabase.
 * Uses official_url as the primary conflict key, falling back to slug.
 */
export async function pushToSupabase(races: MergedRace[]): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment. '
      + 'Set them in .env at the repo root.',
    );
  }

  const supabase = createClient(url, key);

  // Split into two sets: with and without official_url
  const withUrl = races.filter(r => r.official_url);
  const withoutUrl = races.filter(r => !r.official_url);

  let inserted = 0;
  let errors = 0;

  // Batch upsert races with official_url (conflict on official_url)
  for (let i = 0; i < withUrl.length; i += BATCH_SIZE) {
    const batch = withUrl.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('races')
      .upsert(batch, { onConflict: 'official_url', ignoreDuplicates: false });

    if (error) {
      console.error(`[push] Batch ${i / BATCH_SIZE + 1} (with URL) error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  // Batch upsert races without official_url (conflict on slug)
  for (let i = 0; i < withoutUrl.length; i += BATCH_SIZE) {
    const batch = withoutUrl.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('races')
      .upsert(batch, { onConflict: 'slug', ignoreDuplicates: false });

    if (error) {
      console.error(`[push] Batch ${i / BATCH_SIZE + 1} (no URL) error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[push] Done: ${inserted} upserted, ${errors} failed`);
}
