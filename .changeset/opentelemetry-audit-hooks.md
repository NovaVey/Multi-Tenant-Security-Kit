---
'@novavey/multi-tenant-security-kit': minor
---

Add optional OpenTelemetry integration to the audit module: `openTelemetrySink` (records every audit event as a span event on the active span, marking the span an error for non-`'success'` outcomes) and `traceContextTransform` (a `redact`-compatible transform stamping `traceId`/`spanId` from the active span onto every event's `metadata`, so any sink can be trace-correlated, not just OpenTelemetry-aware ones).

Both accept a `getActiveSpan` callback instead of importing `@opentelemetry/api` directly — this package keeps its zero-runtime-dependency footprint; a real OpenTelemetry `Span` satisfies the small structural `OtelSpanLike` interface with no adapter or cast needed. See `docs/audit-logging.md`'s new "OpenTelemetry integration" section.
