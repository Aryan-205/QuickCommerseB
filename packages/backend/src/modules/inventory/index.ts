export * as inventoryService from './inventory.service.js'
export type { ReservationRequest } from './inventory.service.js'

/**
 * No controller. Inventory has no public HTTP surface — stock is manipulated
 * only as a side effect of cart and order operations, plus admin restocking
 * (which belongs in an admin module).
 *
 * Resisting the urge to give every module a REST resource is part of designing
 * an API rather than exposing a schema. `POST /inventory/reserve` would let any
 * client hold stock indefinitely with no order attached.
 */
