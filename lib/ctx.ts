import { storeFor, type TenantStore } from './store'
import { tenantFromRequest, keyFromRequest, tenantIdFor, PILOT } from './tenant'

/** Resolve the tenant store for a request. In pilot mode an unauthenticated request gets null. */
export function storeForRequest(req: Request): TenantStore | null {
  const t = tenantFromRequest(req)
  if (!t) return null
  return storeFor(t)
}

export function unauthorized(msg = PILOT ? 'login required' : 'no tenant') {
  return Response.json({ error: msg }, { status: 401 })
}

/**
 * For routes that spend the customer's balance. In pilot mode the key must be in
 * the Authorization header and must belong to the cookie's tenant; it is used for
 * this request only and never stored. Demo mode returns no key (server key applies).
 */
export function spendKey(req: Request, st: TenantStore): { key?: string; error?: Response } {
  if (!PILOT) return {}
  const key = keyFromRequest(req)
  if (!key) return { error: Response.json({ error: 'key required' }, { status: 401 }) }
  if (tenantIdFor(key) !== st.tenant.id) {
    return { error: Response.json({ error: 'key does not match this session' }, { status: 403 }) }
  }
  return { key }
}
