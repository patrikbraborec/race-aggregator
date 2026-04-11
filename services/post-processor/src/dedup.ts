import type { NormalizedItem } from './types.js';
import { normalizeText, normalizeUrlForDedup } from './normalize.js';

/**
 * Groups normalized items that represent the same race.
 * Returns an array of groups — each group is 1+ items that are duplicates.
 *
 * Strategy:
 * 1. Primary: group by normalized website URL (cross-source, high confidence)
 * 2. Fallback: group by normalized name + date + city tokens (for items without website)
 * 3. Fuzzy: within the fallback groups, merge near-matches using token similarity
 */
export function deduplicateItems(items: NormalizedItem[]): NormalizedItem[][] {
  const groups: NormalizedItem[][] = [];
  const assigned = new Set<number>();

  // Phase 1: Group by website URL
  const byWebsite = new Map<string, number[]>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.website) continue;

    const urlKey = normalizeUrlForDedup(item.website);
    if (!urlKey) continue;

    // Use website + date as key: a series website (e.g. bezecvysociny.cz)
    // hosts races on different dates — those are separate events.
    const key = `${urlKey}|${item.date}`;

    const existing = byWebsite.get(key);
    if (existing) {
      existing.push(i);
    } else {
      byWebsite.set(key, [i]);
    }
  }

  for (const indices of byWebsite.values()) {
    groups.push(indices.map(i => items[i]));
    for (const i of indices) assigned.add(i);
  }

  // Phase 2: For remaining items, group by name + date + city
  const remaining = items
    .map((item, i) => ({ item, index: i }))
    .filter(({ index }) => !assigned.has(index));

  const byComposite = new Map<string, { item: NormalizedItem; index: number }[]>();

  for (const entry of remaining) {
    const key = compositeKey(entry.item);
    const existing = byComposite.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      byComposite.set(key, [entry]);
    }
  }

  // Phase 3: Within composite groups, also try fuzzy merging across groups
  const compositeGroups = Array.from(byComposite.values());
  const mergedComposite = fuzzyMergeGroups(compositeGroups);

  for (const group of mergedComposite) {
    groups.push(group.map(e => e.item));
    for (const e of group) assigned.add(e.index);
  }

  return groups;
}

/** Build a composite dedup key: normalized name | date | normalized city */
function compositeKey(item: NormalizedItem): string {
  return `${normalizeText(item.title)}|${item.date}|${normalizeText(item.city)}`;
}

/**
 * Attempt to merge composite groups that are likely the same race
 * but have slight name/city differences.
 *
 * Uses token-based Jaccard similarity on name, requires same date,
 * and requires overlapping city tokens.
 */
function fuzzyMergeGroups(
  groups: { item: NormalizedItem; index: number }[][],
): { item: NormalizedItem; index: number }[][] {
  const result: { item: NormalizedItem; index: number }[][] = [];
  const merged = new Set<number>();

  for (let i = 0; i < groups.length; i++) {
    if (merged.has(i)) continue;

    const current = [...groups[i]];
    const rep = groups[i][0].item;

    for (let j = i + 1; j < groups.length; j++) {
      if (merged.has(j)) continue;

      const candidate = groups[j][0].item;

      // Must share the same date
      if (rep.date !== candidate.date) continue;

      // Name similarity (Jaccard on tokens)
      const nameSim = jaccardSimilarity(
        tokenize(normalizeText(rep.title)),
        tokenize(normalizeText(candidate.title)),
      );

      // City token overlap
      const cityOverlap = tokensOverlap(
        tokenize(normalizeText(rep.city)),
        tokenize(normalizeText(candidate.city)),
      );

      if (nameSim >= 0.6 && cityOverlap) {
        current.push(...groups[j]);
        merged.add(j);
      }
    }

    result.push(current);
    merged.add(i);
  }

  return result;
}

function tokenize(text: string): Set<string> {
  return new Set(text.split(/\s+/).filter(t => t.length > 1));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function tokensOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return true; // empty city = no constraint
  for (const token of a) {
    if (b.has(token)) return true;
  }
  return false;
}
