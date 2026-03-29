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

/**
 * Canonical name mappings for popular Czech races.
 * Maps known alternate names (lowercase, no diacritics) to a single canonical form.
 * This ensures the same race gets the same slug regardless of source language or naming.
 *
 * Key: pattern to match (after brand/edition stripping, lowercased, diacritics removed)
 * Value: canonical name used for slug generation
 */
const CANONICAL_NAMES: [RegExp, string][] = [
  // --- RunCzech series ---
  [/^(?:prague marathon|prazsky maraton|maraton praha)$/,                 'maraton praha'],
  [/^(?:prague half marathon|prazsky pulmaraton|pulmaraton praha)$/,      'pulmaraton praha'],
  [/^(?:karlovy vary half marathon|pulmaraton karlovy vary)$/,           'pulmaraton karlovy vary'],
  [/^(?:ceske budejovice half marathon|pulmaraton ceske budejovice)$/,   'pulmaraton ceske budejovice'],
  [/^(?:olomouc half marathon|pulmaraton olomouc)$/,                     'pulmaraton olomouc'],
  [/^(?:usti nad labem half marathon|pulmaraton usti nad labem)$/,      'pulmaraton usti nad labem'],
  [/^(?:liberec nature run|liberecky prirodni beh)$/,                    'liberecky prirodni beh'],

  // --- Major ultras & trail ---
  [/^(?:beskydsky ultra trail|but ultra trail|but)$/,                    'beskydsky ultra trail'],
  [/^(?:sumava ultra trail|sut)$/,                                       'sumava ultra trail'],
  [/^(?:jizerska padesatka|jizerska 50)$/,                              'jizerska padesatka'],
  [/^(?:vltava run|vltavsky beh)$/,                                     'vltava run'],
  [/^(?:krakonos[uv]* maraton|krakonosovy maraton)$/,                   'krakonosuv maraton'],
  [/^(?:znojmo ultra trail|zut)$/,                                       'znojmo ultra trail'],

  // --- Popular city races ---
  [/^(?:night run praha|nocni beh prahou|nocni praha)$/,                'nocni beh prahou'],
  [/^(?:night run brno|nocni beh brnem|nocni brno)$/,                   'nocni beh brnem'],
  [/^(?:night run ostrava|nocni beh ostravou|nocni ostrava)$/,          'nocni beh ostravou'],
  [/^(?:beh pro zivot|run for life|race for life)$/,                    'beh pro zivot'],
  [/^(?:color run praha|the color run prague)$/,                        'color run praha'],
  [/^(?:great ceskokrumlovsky maraton|maraton cesky krumlov)$/,         'maraton cesky krumlov'],
  [/^(?:brnensky pulmaraton|pulmaraton brno|brno half marathon)$/,      'pulmaraton brno'],

  // --- Obstacle races ---
  [/^(?:gladiator race.*brno|gladiator brno)$/,                         'gladiator race brno'],
  [/^(?:gladiator race.*praha|gladiator prague|gladiator praha)$/,      'gladiator race praha'],
  [/^(?:spartan race.*praha|spartan prague|spartan praha)$/,            'spartan race praha'],
  [/^(?:predator race|predator run)$/,                                  'predator race'],
  [/^(?:army run|armadni beh)$/,                                        'armadni beh'],

  // --- Relay & team events ---
  [/^(?:stafetovy maraton praha|prague relay marathon)$/,               'stafetovy maraton praha'],
  [/^(?:ekiden.*praha|ekiden prague)$/,                                 'ekiden praha'],

  // --- Well-known regional races ---
  [/^(?:dvaadvacitka|dvadvacitka|22vitka)$/,                            'dvaadvacitka'],
  [/^(?:velka kunraticka|kunraticka)$/,                                 'velka kunraticka'],
  [/^(?:hervis.*pul?maraton|hervis pulmaraton)$/,                       'hervis pulmaraton'],
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
 * Try to match a normalized, diacritics-free name against canonical race names.
 * Returns the canonical name if matched, or null.
 */
export function matchCanonical(nameNoDiacritics: string): string | null {
  for (const [pattern, canonical] of CANONICAL_NAMES) {
    if (pattern.test(nameNoDiacritics)) {
      return canonical;
    }
  }
  return null;
}

/**
 * Generate a deterministic slug from race name and start date.
 * Designed to produce identical slugs for the same race across different sources.
 * Uses canonical name mappings to handle cross-language/cross-source naming differences.
 */
export function generateSlug(name: string, dateStart: string): string {
  const normalized = normalizeRaceName(name);
  const noDiacritics = removeDiacritics(normalized).toLowerCase();

  // Try canonical mapping first — this handles cross-language duplicates
  const canonical = matchCanonical(noDiacritics.replace(/[^a-z0-9 ]/g, '').trim());

  const base = canonical ?? noDiacritics;
  const slug = base
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug}-${dateStart}`;
}
