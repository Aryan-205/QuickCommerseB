import { OutOfServiceAreaError } from '../../platform/errors/index.js'
import * as storesRepository from './stores.repository.js'

/**
 * Implemented as your reference for what a service layer looks like: it owns
 * decisions and vocabulary, calls repositories for data, and knows nothing
 * about HTTP. Compare it against inventory/orders, which are yours to write.
 */

/** Picking, packing, handover. Independent of distance. */
const BASE_PREP_MINUTES = 6
/** ~18 km/h average for a two-wheeler through city traffic. */
const RIDER_SPEED_M_PER_MIN = 300

/**
 * Straight-line distance underestimates road distance by roughly 25-40% in a
 * gridded city. This fudge factor is a placeholder for a real routing service.
 * Being explicit that it is a guess beats burying an optimistic number.
 */
const ROAD_DISTANCE_FACTOR = 1.35

export function estimateEtaMinutes(distanceM: number): number {
  const travelMinutes = (distanceM * ROAD_DISTANCE_FACTOR) / RIDER_SPEED_M_PER_MIN
  return Math.ceil(BASE_PREP_MINUTES + travelMinutes)
}

export interface ServiceabilityResult {
  serviceable: boolean
  store: {
    id: string
    code: string
    name: string
    distanceM: number
    etaMinutes: number
  } | null
}

/**
 * Soft check — used by the storefront to decide what to render. Returns a
 * negative answer rather than throwing, because "we do not deliver here yet" is
 * a normal outcome, not an error.
 */
export async function checkServiceability(lat: number, lng: number): Promise<ServiceabilityResult> {
  const store = await storesRepository.findServingStore(lat, lng)

  if (!store) {
    return { serviceable: false, store: null }
  }

  return {
    serviceable: true,
    store: {
      id: store.id,
      code: store.code,
      name: store.name,
      distanceM: Math.round(store.distance_m),
      etaMinutes: estimateEtaMinutes(store.distance_m),
    },
  }
}

/**
 * Hard check — used on paths that cannot proceed without a store (browsing a
 * catalogue, checking out). Throws so the caller does not have to handle a null
 * it cannot do anything with.
 *
 * Two functions rather than one with a boolean flag: the callers genuinely want
 * different behaviour, and a `throwIfMissing` parameter makes the return type
 * lie about nullability.
 */
export async function resolveStoreOrThrow(lat: number, lng: number): Promise<string> {
  const store = await storesRepository.findServingStore(lat, lng)

  if (!store) {
    throw new OutOfServiceAreaError(lat, lng)
  }

  return store.id
}

export async function listStores() {
  return storesRepository.listActiveStores()
}
