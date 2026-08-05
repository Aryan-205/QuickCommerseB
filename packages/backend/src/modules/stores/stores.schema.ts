import { z } from '@hono/zod-openapi'

export const ServiceabilityQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .openapi('ServiceabilityQuery')

export const ServiceabilityResponse = z
  .object({
    serviceable: z.boolean(),
    store: z
      .object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        distanceM: z.number(),
        etaMinutes: z.number().int(),
      })
      .nullable(),
  })
  .openapi('ServiceabilityResponse')

export const StoreSummary = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    serviceRadiusM: z.number().int(),
    opensAt: z.string(),
    closesAt: z.string(),
  })
  .openapi('StoreSummary')

export type ServiceabilityInput = z.infer<typeof ServiceabilityQuery>
