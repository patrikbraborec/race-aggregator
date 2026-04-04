import type { Race } from './types';

export interface CompletenessResult {
  score: number;
  level: 'high' | 'medium' | 'low';
  label: string;
}

const WEIGHTS: { field: keyof Race; weight: number; trailOnly?: boolean }[] = [
  { field: 'description', weight: 15 },
  { field: 'time_start', weight: 10 },
  { field: 'distances', weight: 10 },
  { field: 'price_from', weight: 10 },
  { field: 'website', weight: 10 },
  { field: 'registration_url', weight: 10 },
  { field: 'lat', weight: 10 },
  { field: 'elevation_gain', weight: 5, trailOnly: true },
  { field: 'cover_url', weight: 5 },
  { field: 'organizer', weight: 5 },
  { field: 'capacity', weight: 5 },
];

function isFilled(race: Race, field: keyof Race): boolean {
  const value = race[field];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function getCompleteness(race: Race): CompletenessResult {
  const isTrail = race.terrain === 'trail' || race.terrain === 'ultra';

  let maxScore = 0;
  let earned = 0;

  for (const { field, weight, trailOnly } of WEIGHTS) {
    if (trailOnly && !isTrail) continue;
    maxScore += weight;
    if (isFilled(race, field)) earned += weight;
  }

  const score = Math.round((earned / maxScore) * 100);

  if (score >= 75) return { score, level: 'high', label: 'Ověřené informace' };
  if (score >= 40) return { score, level: 'medium', label: 'Základní informace' };
  return { score, level: 'low', label: 'Málo informací' };
}
