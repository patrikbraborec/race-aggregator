const DIACRITICS_MAP: Record<string, string> = {
  á: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n',
  ó: 'o', ř: 'r', š: 's', ť: 't', ú: 'u', ů: 'u', ý: 'y', ž: 'z',
  Á: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Í: 'I', Ň: 'N',
  Ó: 'O', Ř: 'R', Š: 'S', Ť: 'T', Ú: 'U', Ů: 'U', Ý: 'Y', Ž: 'Z',
};

/** Remove Czech diacritics from a string. */
export function removeDiacritics(s: string): string {
  return s.replace(/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch);
}

/** Brand prefixes to strip for cross-source deduplication. */
const BRAND_PREFIXES = [
  'volkswagen', 'mattoni', 'runczech', 't-mobile', 'craft',
  'sportisimo', 'nature\'s spirit', 'birell',
];

/** Edition patterns to strip (e.g., "42. ročník", "XII.", "15th"). */
const EDITION_PATTERNS = [
  /\b\d{1,3}\.\s*ročník\b/gi,
  /\b\d{1,3}\.\s*ročníku?\b/gi,
  /\bX{0,3}(?:IX|IV|V?I{0,3})\.\s*/g, // Roman numerals with dot
  /\b\d{1,3}(?:st|nd|rd|th)\b/gi,
];

/**
 * Normalize a race name for slug generation.
 * Strips brand prefixes, year numbers, and edition markers.
 */
export function normalizeRaceName(name: string): string {
  let normalized = name.trim().toLowerCase();

  // Strip brand prefixes
  for (const prefix of BRAND_PREFIXES) {
    if (normalized.startsWith(prefix + ' ')) {
      normalized = normalized.slice(prefix.length).trim();
    }
  }

  // Strip edition patterns
  for (const pattern of EDITION_PATTERNS) {
    normalized = normalized.replace(pattern, '').trim();
  }

  // Strip trailing year (4 digits at end)
  normalized = normalized.replace(/\s+\d{4}\s*$/, '').trim();

  return normalized;
}

/**
 * Generate a deterministic slug from race name and start date.
 * Designed to produce identical slugs for the same race across different sources.
 */
export function generateSlug(name: string, dateStart: string): string {
  const normalized = normalizeRaceName(name);
  const slug = removeDiacritics(normalized)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug}-${dateStart}`;
}
