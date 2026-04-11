import type { MergedRace } from './types.js';
import { normalizeText } from './normalize.js';

/**
 * Generate a URL-friendly slug from a race name and date.
 * Example: "Jarní běh Pávov" + "2026-04-10" → "jarni-beh-pavov-2026"
 */
function generateSlug(name: string, dateStart: string): string {
  const year = dateStart.slice(0, 4);
  const base = normalizeText(name)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${base}-${year}`;
}

/**
 * Assign unique slugs to all merged races.
 * Handles collisions by appending -2, -3, etc.
 */
export function assignSlugs(races: Omit<MergedRace, 'slug'>[]): MergedRace[] {
  const slugCounts = new Map<string, number>();
  const result: MergedRace[] = [];

  for (const race of races) {
    const baseSlug = generateSlug(race.name, race.date_start);

    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);

    const slug = count > 1 ? `${baseSlug}-${count}` : baseSlug;
    result.push({ ...race, slug });
  }

  return result;
}
