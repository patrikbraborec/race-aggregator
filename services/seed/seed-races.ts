import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const races = [
  {
    slug: 'maraton-praha-2026',
    name: 'Volkswagen Maraton Praha 2026',
    description:
      'Nejstarší a nejprestižnější maraton v České republice. Trasa vede historickým centrem Prahy podél Vltavy.',
    date_start: '2026-05-10',
    time_start: '09:00',
    city: 'Praha',
    region: 'Praha',
    lat: 50.0755,
    lng: 14.4378,
    venue: 'Staroměstské náměstí',
    distances: [
      { label: 'Maraton', km: 42.195 },
      { label: 'Štafeta', km: 42.195 },
    ],
    terrain: 'road' as const,
    price_from: 1200,
    price_to: 2500,
    website: 'https://www.runczech.com/cs/udalosti/volkswagen-maraton-praha/',
    registration_url: 'https://www.runczech.com/cs/udalosti/volkswagen-maraton-praha/registrace/',
    organizer: 'RunCzech',
    organizer_url: 'https://www.runczech.com',
    status: 'confirmed' as const,
    capacity: 10000,
    tags: ['maraton', ' iaaf', 'worldathletics'],
  },
  {
    slug: 'pulmaraton-ceske-budejovice-2026',
    name: 'Půlmaraton České Budějovice 2026',
    description:
      'Rovný a rychlý půlmaraton v jihočeské metropoli. Ideální na osobní rekord.',
    date_start: '2026-06-06',
    time_start: '10:00',
    city: 'České Budějovice',
    region: 'Jihočeský',
    lat: 48.9745,
    lng: 14.4746,
    venue: 'Náměstí Přemysla Otakara II.',
    distances: [{ label: 'Půlmaraton', km: 21.1 }],
    terrain: 'road' as const,
    price_from: 600,
    price_to: 900,
    website: 'https://www.pulmaratonbudejovice.cz',
    organizer: 'Běžecký klub ČB',
    status: 'confirmed' as const,
    tags: ['pulmaraton'],
  },
  {
    slug: 'vltava-run-2026',
    name: 'Vltava Run 2026',
    description:
      'Legendární ultramaratonský závod podél Vltavy z Českého Krumlova do Prahy. 350 km přes 4 dny.',
    date_start: '2026-08-18',
    date_end: '2026-08-21',
    time_start: '06:00',
    city: 'Český Krumlov',
    region: 'Jihočeský',
    lat: 48.8127,
    lng: 14.3175,
    distances: [
      { label: '350 km', km: 350 },
      { label: '200 km', km: 200 },
      { label: '100 km', km: 100 },
    ],
    terrain: 'ultra' as const,
    elevation_gain: 4500,
    price_from: 3500,
    price_to: 8000,
    website: 'https://www.vltavarun.cz',
    registration_url: 'https://www.vltavarun.cz/registrace',
    organizer: 'Vltava Run s.r.o.',
    status: 'confirmed' as const,
    capacity: 500,
    tags: ['ultra', 'vicedenni'],
  },
  {
    slug: 'jizerska-50-2026',
    name: 'Jizerská 50 Trail 2026',
    description:
      'Tradiční trail závod v Jizerských horách. Krásná příroda a náročný terén.',
    date_start: '2026-09-12',
    time_start: '08:00',
    city: 'Bedřichov',
    region: 'Liberecký',
    lat: 50.7847,
    lng: 15.1506,
    distances: [
      { label: '50 km', km: 50 },
      { label: '25 km', km: 25 },
    ],
    terrain: 'trail' as const,
    elevation_gain: 1800,
    price_from: 800,
    price_to: 1400,
    website: 'https://www.jizerska50.cz',
    organizer: 'SKI Klub Jizerská 50',
    status: 'confirmed' as const,
    tags: ['trail', 'hory'],
  },
  {
    slug: 'runczech-pulmaraton-olomouc-2026',
    name: 'RunCzech Půlmaraton Olomouc 2026',
    description:
      'Půlmaraton v historickém centru Olomouce. Součást série RunCzech.',
    date_start: '2026-06-20',
    time_start: '10:00',
    city: 'Olomouc',
    region: 'Olomoucký',
    lat: 49.5938,
    lng: 17.2509,
    venue: 'Horní náměstí',
    distances: [{ label: 'Půlmaraton', km: 21.1 }],
    terrain: 'road' as const,
    price_from: 700,
    price_to: 1200,
    website: 'https://www.runczech.com/cs/udalosti/pulmaraton-olomouc/',
    organizer: 'RunCzech',
    organizer_url: 'https://www.runczech.com',
    status: 'confirmed' as const,
    capacity: 6000,
    tags: ['pulmaraton', 'runczech'],
  },
  {
    slug: 'beskydy-trail-2026',
    name: 'Beskydský Ultra Trail 2026',
    description:
      'Náročný ultra trailový závod přes hlavní hřeben Beskyd. Překonáte Lysou horu, Smrk i Radhošť.',
    date_start: '2026-07-25',
    time_start: '05:00',
    city: 'Frenštát pod Radhoštěm',
    region: 'Moravskoslezský',
    lat: 49.5481,
    lng: 18.2108,
    distances: [
      { label: 'Ultra 70 km', km: 70 },
      { label: 'Trail 35 km', km: 35 },
    ],
    terrain: 'trail' as const,
    elevation_gain: 3200,
    price_from: 900,
    price_to: 1800,
    website: 'https://www.beskydytrail.cz',
    organizer: 'Beskydský spolek',
    status: 'confirmed' as const,
    tags: ['ultra', 'trail', 'hory'],
  },
  {
    slug: 'pardubicky-vinobrani-10k-2026',
    name: 'Pardubický vinařský 10K 2026',
    description: 'Populární městská desítka v Pardubicích s občerstvením na trati.',
    date_start: '2026-09-26',
    time_start: '10:00',
    city: 'Pardubice',
    region: 'Pardubický',
    lat: 50.0343,
    lng: 15.7812,
    venue: 'Třída Míru',
    distances: [
      { label: '10 km', km: 10 },
      { label: '5 km', km: 5 },
    ],
    terrain: 'road' as const,
    price_from: 350,
    price_to: 500,
    organizer: 'AK Pardubice',
    status: 'confirmed' as const,
    tags: ['10k', '5k'],
  },
  {
    slug: 'karlovy-vary-pulmaraton-2026',
    name: 'Mattoni Půlmaraton Karlovy Vary 2026',
    description:
      'Půlmaraton lázeňským městem. Součást série Mattoni.',
    date_start: '2026-05-23',
    time_start: '10:00',
    city: 'Karlovy Vary',
    region: 'Karlovarský',
    lat: 50.2325,
    lng: 12.8714,
    distances: [{ label: 'Půlmaraton', km: 21.1 }],
    terrain: 'road' as const,
    price_from: 650,
    price_to: 1100,
    website: 'https://www.runczech.com/cs/udalosti/mattoni-pulmaraton-karlovy-vary/',
    organizer: 'RunCzech',
    organizer_url: 'https://www.runczech.com',
    status: 'confirmed' as const,
    capacity: 4000,
    tags: ['pulmaraton', 'runczech'],
  },
];

async function seed() {
  console.log(`Seeding ${races.length} races...`);

  const { data, error } = await supabase
    .from('races')
    .upsert(races, { onConflict: 'slug' })
    .select('slug');

  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }

  console.log(`Seeded ${data.length} races successfully.`);
  data.forEach((r) => console.log(`  - ${r.slug}`));
}

seed();
