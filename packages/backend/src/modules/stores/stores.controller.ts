import { OpenAPIHono, createRoute } from '@hono/zod-openapi'

import type { AppBindings } from '../../platform/http/context.js'
import { jsonError } from '../../platform/http/schemas.js'
import { ServiceabilityQuery, ServiceabilityResponse, StoreSummary } from './stores.schema.js'
import * as storesService from './stores.service.js'

export const storesController = new OpenAPIHono<AppBindings>()

const serviceabilityRoute = createRoute({
  method: 'get',
  path: '/serviceability',
  tags: ['Stores'],
  summary: 'Which dark store serves this location?',
  description:
    'Public. Called before login so the storefront knows whether it can show a catalogue at all.',
  request: { query: ServiceabilityQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: ServiceabilityResponse } },
      description: 'Serviceability result (serviceable may be false)',
    },
    422: jsonError('Invalid coordinates'),
  },
})

const listStoresRoute = createRoute({
  method: 'get',
  path: '/stores',
  tags: ['Stores'],
  summary: 'List active dark stores',
  responses: {
    200: {
      content: { 'application/json': { schema: StoreSummary.array() } },
      description: 'Active stores',
    },
  },
})

storesController.openapi(serviceabilityRoute, async (c) => {
  const { lat, lng } = c.req.valid('query')
  return c.json(await storesService.checkServiceability(lat, lng), 200)
})

storesController.openapi(listStoresRoute, async (c) => {
  const stores = await storesService.listStores()

  // Mapping snake_case rows to camelCase JSON happens HERE, at the edge.
  // The database speaks snake_case, the API speaks camelCase, and the
  // translation lives in exactly one layer rather than leaking both ways.
  return c.json(
    stores.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      serviceRadiusM: s.service_radius_m,
      opensAt: s.opens_at,
      closesAt: s.closes_at,
    })),
    200,
  )
})
