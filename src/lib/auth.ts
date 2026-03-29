/**
 * Client-side auth module.
 * All functions in this file must only be called from <script> tags (browser context).
 * Uses a singleton Supabase client so auth state is shared across all components.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/** Get the singleton Supabase client (client-side only). */
export function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _client;
}

/** Get the current authenticated user, or null. */
export async function getUser(): Promise<User | null> {
  const { data } = await getClient().auth.getSession();
  return data.session?.user ?? null;
}

/** Sign up with email and password. */
export async function signUp(email: string, password: string) {
  const { data, error } = await getClient().auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/** Sign in with email and password. */
export async function signIn(email: string, password: string) {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Sign in with magic link (OTP). */
export async function signInWithMagicLink(email: string) {
  const { error } = await getClient().auth.signInWithOtp({ email });
  if (error) throw error;
}

/** Sign out. */
export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
}

/** Listen for auth state changes. Returns an unsubscribe function. */
export function onAuthStateChange(callback: (user: User | null) => void) {
  const { data } = getClient().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return data.subscription.unsubscribe;
}

/** Register interest in a race (authenticated). */
export async function registerInterest(raceId: string, referredBy?: string | null) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, string> = { race_id: raceId, user_id: user.id };
  if (referredBy) row.referred_by = referredBy;

  const { error } = await getClient().from('race_interest').insert(row);
  // Ignore unique constraint violation (user already registered interest)
  if (error && error.code !== '23505') throw error;
}

/** Remove interest in a race (authenticated). */
export async function removeInterest(raceId: string) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await getClient()
    .from('race_interest')
    .delete()
    .eq('race_id', raceId)
    .eq('user_id', user.id);

  if (error) throw error;
}

/** Check if the current user has registered interest in a race. */
export async function hasInterest(raceId: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const { count, error } = await getClient()
    .from('race_interest')
    .select('*', { count: 'exact', head: true })
    .eq('race_id', raceId)
    .eq('user_id', user.id);

  if (error) return false;
  return (count ?? 0) > 0;
}

/** Fetch the current user's races (for "My Races" page). */
export async function getUserRaces() {
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await getClient()
    .from('race_interest')
    .select('race_id, created_at, races(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Record a referral event. */
export async function recordReferral(referrerId: string, raceId: string) {
  const user = await getUser();
  if (!user) return;

  const { error } = await getClient().from('referral_events').insert({
    referrer_id: referrerId,
    referred_id: user.id,
    race_id: raceId,
  });
  // Silently ignore errors (referral tracking is non-critical)
  if (error) console.warn('Referral tracking failed:', error.message);
}
