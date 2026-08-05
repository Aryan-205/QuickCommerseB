import { z } from '@hono/zod-openapi'

/**
 * Contracts shared by every module.
 *
 * These live in platform/, not in whichever module happened to need them first.
 * A module importing another module's schema file is exactly the boundary
 * violation that turns a modular monolith back into a big ball of mud.
 */

/** Must stay in lockstep with platform/http/error-handler.ts. */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'INSUFFICIENT_STOCK' }),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .openapi('ErrorResponse')

export const jsonError = (description: string) => ({
  content: { 'application/json': { schema: ErrorResponse } },
  description,
})

/**
 * Cursor pagination.
 *
 * Not offset pagination, on purpose. `OFFSET 10000` makes Postgres fetch and
 * discard 10,000 rows before returning anything, so page 500 is dramatically
 * slower than page 1. Worse, it is INCORRECT under writes: if a row is inserted
 * while a user pages, every subsequent page shifts and an item is silently
 * skipped.
 *
 * A cursor encodes "where I stopped" — typically the sort key of the last row —
 * so the query becomes `WHERE (sort_key, id) < (cursor)`, which is an index
 * seek at constant cost regardless of depth.
 *
 * The tradeoff: no "jump to page 47". Infinite scroll does not need it.
 */
export const CursorQuery = z.object({
  cursor: z.string().optional().openapi({ description: 'Opaque cursor from a previous page' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}
