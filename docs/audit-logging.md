# Audit logging

`@novavey/multi-tenant-security-kit/audit`

Structured, multi-sink audit event logging with one hard guarantee: **`log()`
never throws, and one failing sink never blocks or affects another.** Audit
logging is inherently best-effort side work — a webhook timeout or a queue
outage should never take down the request it's describing.

## Basic usage

```ts
import {
  AuditLogger,
  ConsoleAuditSink,
  AuditAction,
} from '@novavey/multi-tenant-security-kit/audit';

const auditLog = new AuditLogger({ sinks: [new ConsoleAuditSink()] });

auditLog.log({
  action: AuditAction.RbacPermissionDenied,
  actorId: user.id,
  targetId: invoice.id,
  outcome: 'denied',
  metadata: { permission: 'invoices:write' },
});
```

`AuditAction` is a small set of recommended action-name constants for
consistency across an application (`TenantIsolationViolation`,
`RbacPermissionDenied`, `RateLimitExceeded`, `AuthLoginSucceeded`,
`AuthLoginFailed`) — it's not a closed enum, `action` accepts any string.

## What gets filled in automatically

- **`timestamp`** — always stamped as `new Date().toISOString()` at call
  time. Callers can't accidentally omit or backdate it.
- **`tenantId`** — resolution order is: an explicit value on the event you
  pass to `log()`, then a `child()` logger's defaults (see below), then the
  ambient [tenant context](./tenant-isolation.md) via `getCurrentTenantId()`.
  It's left `undefined` if none apply — audit events outside any tenant
  context (e.g. platform-level actions) are still valid events.

## Composing multiple sinks

`AuditLogger` fans every event out to every configured sink. Ship your own
by implementing the one-method `AuditSink` interface, or use the built-ins:

```ts
import {
  AuditLogger,
  ConsoleAuditSink,
  InMemoryAuditSink,
  callbackAuditSink,
} from '@novavey/multi-tenant-security-kit/audit';

const auditLog = new AuditLogger({
  sinks: [
    new ConsoleAuditSink(), // one JSON line per event, via console.log
    callbackAuditSink(async (event) => {
      await sendToLogPipeline(event); // your own webhook, queue, SIEM, etc.
    }),
  ],
});
```

`InMemoryAuditSink` (accumulates events in `.events`, `.clear()` to reset)
is meant for tests and short-lived debugging, not production use.

A sink that throws synchronously or returns a rejected promise never
escapes `log()` or blocks sibling sinks — its error is wrapped in
`AuditSinkError` (carrying `sinkName` and the original error as `cause`) and
handed to `onSinkError` (default: `console.error`):

```ts
new AuditLogger({
  sinks: [webhookSink, consoleSink],
  onSinkError: (error) =>
    alerting.notify(`audit sink failed: ${error.sinkName}`, { cause: error.cause }),
});
```

## Redacting sensitive data

```ts
new AuditLogger({
  sinks: [new ConsoleAuditSink()],
  redact: (event) => ({
    ...event,
    metadata: event.metadata ? { ...event.metadata, password: undefined } : event.metadata,
  }),
});
```

`redact` runs once per `log()` call, before any sink sees the event — every
sink gets the same redacted version, so you never have to duplicate
redaction logic per sink.

## Child loggers

`child()` returns a new logger sharing the same sinks/`onSinkError`/`redact`,
whose `log()` merges the given defaults _underneath_ each call's own fields
— useful for a per-request logger that should always stamp a fixed
`actorId` without every call site repeating it:

```ts
app.use((req, res, next) => {
  req.auditLog = auditLog.child({ actorId: req.user?.id });
  next();
});

// later, in a route:
req.auditLog.log({ action: 'invoices.exported', outcome: 'success' });
// -> actorId is already set from the child's defaults
```

An explicit field on a given `log()` call always wins over the child's
defaults, and `child()` can itself be chained.

## API reference

| Export                  | Kind      | Summary                                                                        |
| ----------------------- | --------- | ------------------------------------------------------------------------------ |
| `AuditOutcome`          | type      | `'success' \| 'failure' \| 'denied'`                                           |
| `AuditEvent`            | type      | `{ action, tenantId?, actorId?, targetId?, outcome, metadata?, timestamp }`    |
| `AuditEventInput`       | type      | What you pass to `log()` — `AuditEvent` minus `timestamp`, optional `tenantId` |
| `AuditSink`             | interface | `write(event): void \| Promise<void>`                                          |
| `AuditAction`           | const     | Recommended action-name constants (not a closed set)                           |
| `ConsoleAuditSink`      | class     | Writes one JSON line per event via `console.log`                               |
| `InMemoryAuditSink`     | class     | Accumulates events; `.events`, `.clear()` — tests/debugging only               |
| `callbackAuditSink(fn)` | function  | Wraps an arbitrary function as a sink                                          |
| `AuditLoggerOptions`    | type      | `{ sinks, onSinkError?, redact? }`                                             |
| `AuditLogger`           | class     | `new AuditLogger(options)`; `.log(event)`; `.child(defaults)`                  |
