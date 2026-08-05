import type { Generated, Insertable, JSONColumnType, Selectable, Updateable } from 'kysely'

import type { DB as GeneratedDB } from './generated.js'

/**
 * Hand-written overrides on top of the GENERATED schema.
 *
 * The workflow:
 *     write a migration  ->  bun run db:migrate  ->  bun run db:codegen
 *
 * `generated.ts` is machine output — never edit it, it is rewritten every time.
 * This file is where you correct and enrich what introspection cannot know.
 *
 * ── Why overrides are needed at all ───────────────────────────────────────
 *
 * 1. BIGINT. Introspection sees `bigint` and types it as `string`, which is
 *    node-postgres's default because a 64-bit integer does not fit in a JS
 *    number. But db/index.ts installs an INT8 type parser that converts these
 *    to `number`. Without the override here, the generated type would say
 *    `string` while the runtime hands you a `number` — and TypeScript would
 *    confidently let you write `total_paise + delivery_fee_paise` as string
 *    concatenation. Two sources of truth that disagree is worse than either.
 *
 *    If you ever remove that type parser, delete these overrides too. They are
 *    a matched pair.
 *
 * 2. JSONB. Introspection can only say "some JSON". It cannot know the shape.
 *    `delivery_address` is typed properly below.
 */

/** Frozen copy of the address as it was at checkout. See orders.delivery_address. */
export interface DeliveryAddressSnapshot {
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  lat: number
  lng: number
}

type OrdersTable = Omit<
  GeneratedDB['orders'],
  'subtotal_paise' | 'discount_paise' | 'delivery_fee_paise' | 'total_paise' | 'delivery_address'
> & {
  subtotal_paise: number
  discount_paise: Generated<number>
  delivery_fee_paise: Generated<number>
  total_paise: number
  delivery_address: JSONColumnType<DeliveryAddressSnapshot>
}

type OrderItemsTable = Omit<GeneratedDB['order_items'], 'line_total_paise'> & {
  line_total_paise: number
}

type PaymentsTable = Omit<GeneratedDB['payments'], 'amount_paise'> & {
  amount_paise: number
}

type InventoryLedgerTable = Omit<GeneratedDB['inventory_ledger'], 'id'> & {
  id: Generated<number>
}

type OrderStatusHistoryTable = Omit<GeneratedDB['order_status_history'], 'id'> & {
  id: Generated<number>
}

/**
 * The interface handed to `new Kysely<DB>()`. Everything not listed here passes
 * through from the generated schema untouched, so new tables appear
 * automatically after a codegen run.
 */
export interface DB
  extends Omit<
    GeneratedDB,
    'orders' | 'order_items' | 'payments' | 'inventory_ledger' | 'order_status_history'
  > {
  orders: OrdersTable
  order_items: OrderItemsTable
  payments: PaymentsTable
  inventory_ledger: InventoryLedgerTable
  order_status_history: OrderStatusHistoryTable
}

/** Postgres enums, re-exported so nothing imports from generated.ts directly. */
export type {
  CartStatus,
  CouponKind,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  Timestamp,
  UserRole,
} from './generated.js'

/**
 * Row-shape helpers. `Selectable` strips Generated<>, `Insertable` makes
 * generated columns optional, `Updateable` makes everything optional.
 *
 * Note `available` is deliberately absent from the inventory row: it is
 * `quantity - reserved`, derived per query, never stored.
 */
export type User = Selectable<DB['users']>
export type NewUser = Insertable<DB['users']>
export type UserUpdate = Updateable<DB['users']>

export type Store = Selectable<DB['stores']>
export type Product = Selectable<DB['products']>
export type InventoryRow = Selectable<DB['inventory']>
export type Order = Selectable<DB['orders']>
export type NewOrder = Insertable<DB['orders']>
export type OrderItem = Selectable<DB['order_items']>
export type Reservation = Selectable<DB['reservations']>
