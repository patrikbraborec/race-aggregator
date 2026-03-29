# Race Aggregator — Product Description

## Problem

Runners in the Czech Republic struggle to find races. Information is scattered across 5+ outdated websites (behej.com, svetbehu.cz, ceskybeh.cz, bezeckyzavod.cz, bezvabeh.cz), which are also cluttered with ads and offer no modern UX, race reviews, pricing info, or a functional map. International aggregators (Finishers, RaceRaves, World's Marathons) solve this well abroad but have minimal Czech coverage.

## Solution

A modern, mobile-first race aggregator for the Czech market — one place to find, compare, and review running races.

## Core Value Proposition

- **Find races near you** — map + geolocation (no Czech competitor has this)
- **See the price** — entry fee directly in the listing (no one does this)
- **Read reviews** — ratings from real runners (RaceRaves model, nonexistent in CZ)
- **Modern UX** — fast, mobile-first, clean design vs. 2010-era competitors

---

## Market Research

### Search Demand (Google Trends, CZ, last 12 months)

| Keyword              | Relative Interest | Note                                  |
| -------------------- | ----------------- | ------------------------------------- |
| maraton              | 20 (avg)          | Highest volume, peak in May (100)     |
| pulmaraton           | 9 (avg)           | Second highest, seasonal              |
| bezecke zavody       | 1 (avg)           | Very low — people search specifically |
| ultra trail          | 1 (avg)           | Low volume, niche audience            |
| maraton Praha        | 12 (avg)          | Branded query > generic               |
| Vltava Run           | 6 (avg)           | Strong for a single race              |
| RunCzech             | 4 (avg)           | Brand awareness                       |
| prazsky maraton      | 2 (avg)           | People prefer "maraton Praha"         |
| pulmaraton Olomouc   | 1 (avg)           | Local races = low individual volume   |

**Key insight:** People search for specific race names + city, not generic terms. SEO strategy must target individual race pages (`/maraton-praha-2026`) and long-tail queries.

### Czech Running Market

- ~1,800 races/year, 300+ organizers, ~35 races/week
- ~540,000 Czechs participate in at least one race per year
- Top 16 organizers = 107,000+ runners (2024)
- 57 ultra trail races in 2026 calendar
- Women reaching ~40% of participants, growing youth segment
- Registrations for popular races sell out immediately after opening

### Czech Competitors

| Feature            | SvetBehu | BezeckyZavod | CeskyBeh | BezvaBEH | Behej.com |
| ------------------ | -------- | ------------ | -------- | -------- | --------- |
| Fulltext search    | No       | No           | Yes      | No       | ?         |
| Date filter        | Month    | No           | Range    | Month    | ?         |
| Location filter    | Regions  | No           | Regions  | Districts| ?         |
| Distance filter    | Yes      | Type only    | Yes      | No       | ?         |
| Terrain filter     | Yes      | No           | Yes      | No       | ?         |
| Map                | Broken   | No           | No       | No       | ?         |
| Entry price        | No       | No           | No       | No       | No        |
| Reviews/ratings    | No       | No           | No       | No       | No        |
| Photos             | No       | No           | No       | No       | No        |
| Mobile UX          | Weak     | Basic        | OK       | Weak     | ?         |
| Race count         | ~500     | 1,116        | Large    | Medium   | Large     |

**Common weaknesses across ALL Czech competitors:**
1. No functional map / "races near me"
2. No entry price in listing
3. No reviews or ratings
4. No calendar view — just lists
5. Outdated UX (looks like 2010)
6. No personalization (my races, notifications)
7. Poor race detail pages (no route profile, photos, capacity, registration link)

### International Competitors (Benchmarks)

#### Finishers.com
- 60,000+ races in 194 countries
- Map view, 50+ thematic filters (castles, forests, volcanic...)
- Photos, confirmed/unconfirmed dates, booking
- Business model: race registration sales

#### RaceRaves.com
- "TripAdvisor for races" — reviews are the core feature
- Rating system: Overall, Difficulty, Scenery, Production, Swag (1-5 scale)
- Top Rated badge (4.7+ with 10+ reviews)
- User profiles with race history, PBs, bucket list
- 10,000+ races, 50 states + 60 countries

#### World's Marathons (worldsmarathons.com)
- End-to-end: find → register → pay (Race Office booking system)
- Bucket list, results storage, community
- Revenue: $5M/year (2025)
- Merged with Ahotu — market consolidation

#### FindARace.com
- Simple and functional: date, location, terrain, distance, month filters
- **Price directly in listing**
- Reviews + "Maybe" / "Doing" lists
- Business model: zero-risk listing for organizers

---

## Product Strategy

### URL Structure (SEO-driven)

```
/zavody                        → main listing (filters, map)
/zavody/maraton                → category filter
/zavody/trail                  → category filter
/zavody/ultra                  → category filter
/zavody/praha                  → location filter
/zavody/beskydy                → location filter
/zavod/maraton-praha-2026      → individual race page (SEO landing)
/zavod/vltava-run-2026         → individual race page
/treneri                       → "find a coach" section
/treneri/patrik-braborec       → coach profile
/blog/jak-vybrat-prvni-zavod   → informational content
```

Each race page targets branded search queries and serves as an independent SEO landing page.

### MVP Features (v1)

1. Race listing with filters (date, location, distance, terrain, price)
2. Map view with geolocation ("races near me")
3. Entry price in listing
4. Individual race pages with details (date, location, price, distance, route, registration link)
5. Mobile-first responsive design
6. Basic search

### v2 Features

1. Review and rating system (Overall, Difficulty, Scenery, Organization)
2. User accounts (my races, bucket list)
3. Coach section (starting with Patrik)
4. Blog with SEO content

### v3 Features

1. Race results integration
2. Notifications ("registration opens for X")
3. Strava integration
4. Calendar view
5. Organizer self-service portal

---

## Monetization

| Phase   | Revenue Stream                                     |
| ------- | -------------------------------------------------- |
| Phase 1 | Coach profile (Patrik = first coach)               |
| Phase 2 | Additional coaches (monthly fee or commission)     |
| Phase 3 | Featured race listings for organizers              |
| Phase 3 | Affiliate/commission on race registrations         |
| Phase 3 | Discount codes / partner deals                     |

The aggregator serves as a natural funnel: runner finds race → sees "prepare with a coach" CTA → Patrik's profile. Scalable to multiple coaches later.

---

## Growth Strategy

### Phase 1: Launch (0–500 users)

Goal: prove that one registration can create another visit.

**Acquisition**
- Populate DB with 200-300 races (scraping + manual entry) with prices, dates, photos
- Bring first users from Patrik's coaching clients, Instagram, and local running communities
- Focus on a few races people already know and talk about

**Growth loop**
```
Runner lands on a race page
  → registers through the platform
  → gets a simple shareable "I'm running [race]" post
  → shares it on Instagram / Facebook / Strava
  → friends click the post
  → they visit the same race page or a similar race
  → some of them register too
```

**What to measure**
- Visitor → registration rate
- Registration → share rate
- Share → click rate
- Click → registration rate
- Number of new visitors generated per registration

### Phase 2: Traction (500–5,000 users)

Goal: make the same loop work without manual founder effort.

**Acquisition**
- Offer free race profile management to organizers so they keep race pages accurate
- Let organizers link directly to their page on the platform
- Start ranking individual race pages and comparison pages in Google

**Growth loop**
```
Runner finds a race page from Google or organizer link
  → registers through the platform
  → gets a better branded share post with race name, date, and photo
  → shares it on social media
  → friends click through
  → they browse related races
  → some of them register
```

**What to measure**
- Share rate by traffic source
- Click-through rate from shared posts
- Number of secondary visitors per shared post
- Registration rate of referred visitors
- % of total signups coming from shared posts

### Phase 3: Growth loops (5,000+ users)

Goal: make the loop strong enough that sharing becomes a habit.

**Acquisition**
- Add post-race results pages and review pages
- Give runners more reasons to share: result card, finisher badge, review badge
- Use social proof on race pages so shared traffic converts better

**Growth loop**
```
Runner registers or finds their race result on the platform
  → gets a polished result / finisher / review post
  → shares it on social media
  → friends click through
  → they discover the race or similar races
  → they register
  → after their own race, they share too
```

**What to measure**
- % of registered runners who share at least once
- Average clicks per shared post
- Average registrations generated per shared post
- Viral coefficient: new registrations generated by one registration
- Retention of users acquired from shared posts

### Channel Priority

| Channel               | Effort | Impact                      | When                       |
| --------------------- | ------ | --------------------------- | -------------------------- |
| Personal network      | Low    | Low, but quality feedback   | Day 1                      |
| SEO (race pages)      | High   | Highest long-term           | Day 1, results in 3-6 mo   |
| Race organizers       | Medium | High (data + distribution)  | Post-launch                |
| FB groups             | Low    | Medium, spike traffic       | Post-launch                |
| Race results          | High   | Very high                   | Phase 2                    |
| Review loop           | Medium | High (UGC + retention)      | After 1,000+ users         |
| Instagram/TikTok      | Medium | Unpredictable               | Ongoing                    |

---

## Domain Strategy

**Do NOT host on patrikbraborec.cz** — personal brand domain hurts aggregator SEO:
- Lower CTR in SERPs (users skip personal domains for info queries)
- Dilutes topical authority (coach site ≠ race directory)
- Limits scalability and brand perception

**Recommended:** New domain (e.g., `zavodyvcr.cz`, `bezeckyzavod.cz`, or similar).
Cross-link between patrikbraborec.cz (coach) and the aggregator for mutual SEO benefit.

---

## Key Risks

1. **Chicken-and-egg problem** — no races = no runners, no runners = no reviews. Solution: seed content manually before launch.
2. **Data maintenance** — race info changes (dates, prices). Solution: organizer self-service portal in v2.
3. **Competing on race count** — bezeckyzavod.cz has 1,116 races. Don't compete on quantity — compete on data quality and UX.
4. **Review adoption** — getting first reviews is hard. Solution: seed from personal network, incentivize early adopters.
