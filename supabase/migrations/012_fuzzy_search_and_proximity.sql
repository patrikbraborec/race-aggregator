-- Fuzzy text search (pg_trgm) and proximity search (PostGIS) for natural language queries.
-- Replaces client-side text ranking with database-side word_similarity().
-- Adds city coordinates lookup for "okolo Brna" style proximity queries.

-- 1. Enable pg_trgm for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Helper: strip Czech diacritics and lowercase (IMMUTABLE for index usage)
CREATE OR REPLACE FUNCTION normalize_czech(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
AS $$
  SELECT lower(translate(input,
    'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽäëïöüÄËÏÖÜ',
    'acdeeinorstuuyzACDEEINORSTUUYZaeiouAEIOU'
  ))
$$;

-- 3. City coordinates for proximity search
CREATE TABLE IF NOT EXISTS city_coordinates (
  name text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  region text
);

INSERT INTO city_coordinates (name, lat, lng, region) VALUES
  ('Praha', 50.0755, 14.4378, 'Praha'),
  ('Brno', 49.1951, 16.6068, 'Jihomoravský'),
  ('Ostrava', 49.8209, 18.2625, 'Moravskoslezský'),
  ('Plzeň', 49.7384, 13.3736, 'Plzeňský'),
  ('Liberec', 50.7671, 15.0562, 'Liberecký'),
  ('Olomouc', 49.5938, 17.2509, 'Olomoucký'),
  ('České Budějovice', 48.9745, 14.4746, 'Jihočeský'),
  ('Hradec Králové', 50.2104, 15.8252, 'Královéhradecký'),
  ('Pardubice', 50.0343, 15.7812, 'Pardubický'),
  ('Ústí nad Labem', 50.6607, 14.0323, 'Ústecký'),
  ('Karlovy Vary', 50.2325, 12.8714, 'Karlovarský'),
  ('Zlín', 49.2248, 17.6670, 'Zlínský'),
  ('Jihlava', 49.3961, 15.5913, 'Vysočina'),
  ('Kladno', 50.1487, 14.1031, 'Středočeský'),
  ('Opava', 49.9388, 17.9029, 'Moravskoslezský'),
  ('Frýdek-Místek', 49.6880, 18.3534, 'Moravskoslezský'),
  ('Karviná', 49.8545, 18.5419, 'Moravskoslezský'),
  ('Třebíč', 49.2148, 15.8815, 'Vysočina'),
  ('Prostějov', 49.4715, 17.1134, 'Olomoucký'),
  ('Příbram', 49.6855, 14.0109, 'Středočeský'),
  ('Tábor', 49.4144, 14.6578, 'Jihočeský'),
  ('Havířov', 49.7797, 18.4370, 'Moravskoslezský'),
  ('Znojmo', 48.8555, 16.0488, 'Jihomoravský'),
  ('Chomutov', 50.4593, 13.4178, 'Ústecký'),
  ('Děčín', 50.7814, 14.2148, 'Ústecký'),
  ('Mladá Boleslav', 50.4113, 14.9064, 'Středočeský'),
  ('Jablonec nad Nisou', 50.7243, 15.1710, 'Liberecký'),
  ('Přerov', 49.4559, 17.4513, 'Olomoucký'),
  ('Beroun', 49.9638, 14.0722, 'Středočeský'),
  ('Kolín', 50.0283, 15.2004, 'Středočeský')
ON CONFLICT (name) DO NOTHING;

-- RLS: public read
ALTER TABLE city_coordinates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "City coordinates are publicly readable"
  ON city_coordinates FOR SELECT USING (true);

-- 4. Main search RPC: structural filters + fuzzy text + proximity
CREATE OR REPLACE FUNCTION search_races(
  p_terrain text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_month int DEFAULT NULL,
  p_km numeric DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_proximity boolean DEFAULT false,
  p_search_text text DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS SETOF races
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_prox boolean := COALESCE(p_proximity, false);
  v_city_lat double precision;
  v_city_lng double precision;
  v_city_region text;
  v_safe_city text;
  v_month_start date;
  v_month_end date;
  v_year int;
  v_radius_m int := 40000; -- 40 km
  v_norm_search text;
BEGIN
  -- Normalize search text once
  IF p_search_text IS NOT NULL AND p_search_text != '' THEN
    v_norm_search := normalize_czech(p_search_text);
  END IF;

  -- Sanitize city for ILIKE (strip wildcard chars)
  IF p_city IS NOT NULL THEN
    v_safe_city := replace(replace(p_city, '%', ''), '_', '');
  END IF;

  -- Resolve city coordinates for proximity search
  IF v_prox AND p_city IS NOT NULL THEN
    -- Try city_coordinates lookup first
    SELECT cc.lat, cc.lng, cc.region
    INTO v_city_lat, v_city_lng, v_city_region
    FROM city_coordinates cc
    WHERE cc.name = p_city;

    -- Fallback: average coordinates from races in that city
    IF v_city_lat IS NULL THEN
      SELECT AVG(r.lat), AVG(r.lng)
      INTO v_city_lat, v_city_lng
      FROM races r
      WHERE normalize_czech(r.city) = normalize_czech(p_city)
        AND r.lat IS NOT NULL;
    END IF;

    -- Fallback: get region from races in that city
    IF v_city_region IS NULL THEN
      SELECT r.region INTO v_city_region
      FROM races r
      WHERE normalize_czech(r.city) = normalize_czech(p_city)
        AND r.region IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Calculate month date range
  IF p_month IS NOT NULL AND p_month BETWEEN 1 AND 12 THEN
    v_year := EXTRACT(YEAR FROM v_today)::int;
    v_month_start := make_date(v_year, p_month, 1);
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF v_month_end < v_today THEN
      v_year := v_year + 1;
      v_month_start := make_date(v_year, p_month, 1);
      v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM races r
  WHERE r.status = 'confirmed'
    AND r.country = 'CZ'
    AND r.extraction_status IN ('extracted', 'complete')
    AND r.date_start >= v_today
    -- Terrain
    AND (p_terrain IS NULL OR r.terrain::text = p_terrain)
    -- Region
    AND (p_region IS NULL OR r.region = p_region)
    -- Month range
    AND (p_month IS NULL OR (r.date_start >= v_month_start AND r.date_start <= v_month_end))
    -- City: proximity or exact
    AND (
      p_city IS NULL
      -- Proximity with PostGIS coordinates
      OR (v_prox AND v_city_lat IS NOT NULL AND (
        ST_DWithin(
          r.location,
          ST_SetSRID(ST_MakePoint(v_city_lng, v_city_lat), 4326)::geography,
          v_radius_m
        )
        OR (r.location IS NULL AND v_city_region IS NOT NULL AND r.region = v_city_region)
      ))
      -- Proximity without coordinates: region fallback
      OR (v_prox AND v_city_lat IS NULL AND v_city_region IS NOT NULL
          AND r.region = v_city_region)
      -- Proximity without coordinates or region: ILIKE fallback
      OR (v_prox AND v_city_lat IS NULL AND v_city_region IS NULL AND (
        r.city ILIKE '%' || v_safe_city || '%'
        OR r.region ILIKE '%' || v_safe_city || '%'
      ))
      -- Exact city match (non-proximity)
      OR (NOT v_prox AND (
        r.name ILIKE '%' || v_safe_city || '%'
        OR r.city ILIKE '%' || v_safe_city || '%'
        OR r.region ILIKE '%' || v_safe_city || '%'
      ))
    )
    -- Distance (JSONB array, server-side)
    AND (
      p_km IS NULL
      OR CASE
        WHEN p_km >= 50 THEN EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.distances) d
          WHERE d->>'km' IS NOT NULL AND (d->>'km')::numeric >= 50
        )
        ELSE EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.distances) d
          WHERE d->>'km' IS NOT NULL
            AND ABS((d->>'km')::numeric - p_km) <= p_km * 0.15
        )
      END
    )
    -- Fuzzy text search (pg_trgm word_similarity)
    AND (
      v_norm_search IS NULL
      OR GREATEST(
        word_similarity(v_norm_search, normalize_czech(r.name)),
        word_similarity(v_norm_search, normalize_czech(r.city))
      ) > 0.15
    )
  ORDER BY
    CASE
      WHEN v_norm_search IS NOT NULL THEN
        GREATEST(
          word_similarity(v_norm_search, normalize_czech(r.name)),
          word_similarity(v_norm_search, normalize_czech(r.city))
        )
      ELSE 0
    END DESC,
    r.date_start ASC
  LIMIT p_limit;
END;
$$;
