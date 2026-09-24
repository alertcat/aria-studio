import { storeFor, type TenantStore } from './store'
import { tenantFromRequest, PILOT } from './tenant'

/** Resolve the tenant store for a request. In pilot mode an unauthenticated request gets null. */
export function storeForRequest(req: Request): TenantStore | null {
  const t = tenantFromRequest(req)
  if (!t) return null
  return storeFor(t)
}

export function unauthorized() {
  return Response.json({ error: PILOT ? 'login required' : 'no tenant' }, { status: 401 })
}
