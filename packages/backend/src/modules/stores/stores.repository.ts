import { sql } from 'kysely'

import { db } from '../../platform/db/index.js'

/**
 * Serviceability: which dark store covers a delivery point?
 *
 * The haversine formula gives great-circle distance between two lat/lng pairs.
 * It runs in SQL rather than TypeScript for one reason: doing it in JS means
 * pulling every store row into the process on every request.
 *
 * Note the subquery. Postgres evaluates WHERE before SELECT, so the
 * `distance_m` alias is not visible to WHERE — you either wrap the SELECT (as
 * here) or repeat the whole expression in the predicate. Wrapping keeps the
 * formula written once.
 *
 * Honest limitations of this v1, all worth naming in your ADR:
 *
 *  - It cannot use an index. Every active store is scanned and scored. Fine at
 *    a few hundred stores, not at tens of thousands.
 *  - A circle is not a real catchment: it will happily claim an address across
 *    a river with no bridge. Real catchments are hand-drawn polygons.
 *  - Straight-line distance, not road distance, so any ETA derived from it is
 *    optimistic.
 *
 * The upgrade, when you want it: PostGIS `geography(Point, 4326)` columns, a
 * GiST index, `ST_DWithin` for the radius test and `ST_Contains` against a real
 * service-area polygon. That version is both correct and indexable.
 */
const EARTH_RADIUS_M = 6_371_000

export interface ServingStore {
  id: string
  code: string
  name: string
  distance_m: number
}

export async function findServingStore(
  lat: number,
  lng: number,
): Promise<ServingStore | undefined> {
  const result = await sql<ServingStore>`
    SELECT id, code, name, distance_m
    FROM (
      SELECT
        s.id,
        s.code,
        s.name,
        s.service_radius_m,
        (${EARTH_RADIUS_M} * acos(
          -- Clamped to [-1, 1]: floating-point drift can push the argument a
          -- hair outside acos's domain for near-identical points, and acos()
          -- then returns NaN.
          least(1, greatest(-1,
            cos(radians(${lat})) * cos(radians(s.lat))
              * cos(radians(s.lng) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(s.lat))
          ))
        )) AS distance_m
      FROM stores s
      WHERE s.is_active
    ) scored
    -- Nearest is not sufficient: the point must fall inside that store's own
    -- radius, and radii differ per store.
    WHERE distance_m <= service_radius_m
    ORDER BY distance_m ASC
    LIMIT 1
  `.execute(db)

  return result.rows[0]
}

export async function listActiveStores() {
  return db
    .selectFrom('stores')
    .select(['id', 'code', 'name', 'lat', 'lng', 'service_radius_m', 'opens_at', 'closes_at'])
    .where('is_active', '=', true)
    .orderBy('name')
    .execute()
}
