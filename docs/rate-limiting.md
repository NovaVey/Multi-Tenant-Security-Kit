# Per-tenant rate limiting

`@novavey/multi-tenant-security-kit/rate-limit`

Protects shared backend capacity from any single noisy tenant, using a
token-bucket algorithm keyed per tenant. This is not a substitute for
edge/network-layer DDoS protection — it's about fairness between tenants
sharing the same backend, not about defending your edge.

## Basic usage

```ts
import {
  TenantRateLimiter,
  createRateLimitMiddleware,
} from '@novavey/multi-tenant-security-kit/rate-limit';

const limiter = new TenantRateLimiter({
  limit: 100, // bucket capacity: max points a tenant can hold/spend at once
  windowMs: 60_000, // fully refills over 60 seconds
});

app.use(createRateLimitMiddleware({ limiter }));
```

Mount this after [`createTenantMiddleware`](./tenant-isolation.md) (unless
you supply your own `getTenantId`) — by default the middleware resolves the
tenant via `requireCurrentTenantId()`.

On **every** request — allowed or not — the middleware sets
`RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` response
headers (per the
[IETF RateLimit-Headers draft](https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-08.html)
convention: `Reset` is whole seconds until refill, not an epoch timestamp),
so well-behaved clients can self-throttle even on successful requests. When
the budget is exhausted, the default response is `429` with a `Retry-After`
header and `{ error: 'rate_limit_exceeded', retryAfterMs }`.

## Variable request cost

Not every request should cost the same. `createRateLimitMiddleware` is
generic over the request type (defaulting to the framework-agnostic
`MinimalRequest`, which only has `headers`/`hostname`/`method`/`url`) — pass
your framework's request type as the type argument to get its properties
(`req.path`, `req.params`, etc.) in these callbacks:

```ts
import type { Request } from 'express';

createRateLimitMiddleware<Request>({
  limiter,
  points: (req) => (req.path === '/export' ? 20 : 1),
});
```

## Custom tenant resolution

```ts
createRateLimitMiddleware<Request>({
  limiter,
  // `String(...)`: Express 5 types route params as `string | string[]` (to
  // support repeated-segment patterns).
  getTenantId: (req) => String(req.params.tenantId), // instead of the active tenant context
});
```

## Customizing the limited response

```ts
createRateLimitMiddleware({
  limiter,
  onLimited: (req, res, next, result) => {
    res.status(429).json({ code: 'TOO_MANY_REQUESTS', resetAt: new Date(result.resetMs) });
  },
});
```

## Outside HTTP: background jobs, RPC, GraphQL resolvers

`createRateLimitMiddleware` deliberately never _throws_ — an HTTP middleware
should respond `429` directly rather than force every caller to install an
error-handling middleware. For call sites that want exception-based flow
instead — background jobs, queue consumers, RPC/GraphQL resolvers, or any
code calling `TenantRateLimiter.consume` directly — use
`assertNotRateLimited`:

```ts
import { assertNotRateLimited } from '@novavey/multi-tenant-security-kit/rate-limit';

const result = await limiter.consume(tenantId);
assertNotRateLimited(result); // throws RateLimitExceededError if result.allowed is false
```

## Multiple independent limiters

Give each limiter its own `keyPrefix` so unrelated limits (e.g. "API calls"
vs. "exports") don't collide, even if they happen to share a store:

```ts
const apiLimiter = new TenantRateLimiter({ limit: 1000, windowMs: 60_000, keyPrefix: 'api' });
const exportLimiter = new TenantRateLimiter({ limit: 5, windowMs: 3_600_000, keyPrefix: 'export' });
```

## Scaling past one process

The default `store` is `MemoryRateLimitStore` — a lazy, timer-free
token-bucket keyed by wall-clock elapsed time, kept in a `Map`. It's
process-local: correct and dependency-free for a single instance (or for
tests), but each process gets its own independent budget in a multi-instance
deployment, which effectively multiplies every tenant's real limit by the
instance count.

For multi-instance deployments, implement the small `RateLimitStore`
interface against a shared backend (Redis is the natural choice) and pass it
to `TenantRateLimiter`:

```ts
import type {
  RateLimitStore,
  RateLimitResult,
} from '@novavey/multi-tenant-security-kit/rate-limit';

class RedisRateLimitStore implements RateLimitStore {
  async consume(
    key: string,
    points: number,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    // Needs to be atomic (a Lua script, e.g. via ioredis's `defineCommand`,
    // is the standard way) so concurrent requests across instances don't
    // race on a read-modify-write. See the full, runnable reference
    // implementation at examples/redis-rate-limit-store.ts — it mirrors
    // MemoryRateLimitStore's token-bucket math exactly, just computed
    // atomically inside Redis.
    throw new Error('not implemented — see examples/redis-rate-limit-store.ts');
  }
}

const limiter = new TenantRateLimiter({
  store: new RedisRateLimitStore(),
  limit: 100,
  windowMs: 60_000,
});
```

This package intentionally ships no Redis dependency — implementing the
interface is a small, explicit choice you make, not something bundled in.

## API reference

| Export                               | Kind      | Summary                                                                       |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| `RateLimitResult`                    | type      | `{ allowed, remaining, limit, resetMs }`                                      |
| `RateLimitStore`                     | interface | `consume(key, points, limit, windowMs)`; optional `reset(key)`                |
| `MemoryRateLimitStore`               | class     | Default in-memory, process-local store                                        |
| `TenantRateLimiterOptions`           | type      | `{ store?, limit, windowMs, keyPrefix? }`                                     |
| `TenantRateLimiter`                  | class     | `new TenantRateLimiter(options)`; `.consume(tenantId, points?)`               |
| `RateLimitMiddlewareOptions<Req>`    | type      | Options for `createRateLimitMiddleware`                                       |
| `createRateLimitMiddleware(options)` | function  | Builds the enforcement middleware                                             |
| `assertNotRateLimited(result)`       | function  | Throws `RateLimitExceededError` if `!result.allowed`, for non-HTTP call sites |
