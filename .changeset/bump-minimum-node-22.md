---
'@novavey/multi-tenant-security-kit': minor
---

Raise the minimum supported Node.js version from `>=20.19` to `>=22`. Node 20 ("Iron") LTS has reached its own end-of-life; per `docs/versioning-policy.md`, raising `engines.node` is a `minor` bump, not `major` — it's driven by upstream Node's own release schedule, not a change to this package's API, but can still break a consumer running an old runtime. The CI matrix, `.nvmrc`, and `README.md`'s stated requirement all move to Node 22 in the same change.
