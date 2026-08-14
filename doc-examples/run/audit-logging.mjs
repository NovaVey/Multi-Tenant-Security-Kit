// Mirrors docs/audit-logging.md's redact example (and basic usage, via
// InMemoryAuditSink for assertions). Keep in sync — see
// doc-examples/README.md for the convention this file is part of.
import assert from 'node:assert/strict';
import {
  AuditLogger,
  InMemoryAuditSink,
  AuditAction,
} from '@novavey/multi-tenant-security-kit/audit';

// "Basic usage"
const sink = new InMemoryAuditSink();
const auditLog = new AuditLogger({ sinks: [sink] });

auditLog.log({
  action: AuditAction.RbacPermissionDenied,
  actorId: 'user_1',
  targetId: 'invoice_1',
  outcome: 'denied',
  metadata: { permission: 'invoices:write' },
});

assert.equal(sink.events.length, 1);
assert.equal(sink.events[0].action, AuditAction.RbacPermissionDenied);
assert.equal(typeof sink.events[0].timestamp, 'string'); // stamped automatically

// "Redacting sensitive data"
const redactedSink = new InMemoryAuditSink();
const redactedLog = new AuditLogger({
  sinks: [redactedSink],
  redact: (event) => ({
    ...event,
    metadata: event.metadata ? { ...event.metadata, password: undefined } : event.metadata,
  }),
});

redactedLog.log({
  action: 'auth.login',
  outcome: 'success',
  metadata: { username: 'alice', password: 'hunter2' },
});

assert.equal(redactedSink.events[0].metadata.username, 'alice');
// `password: undefined` still leaves the *key* present (the redact example
// overwrites the value, not the key) — checking the value is what actually
// matters for "did this stop leaking the password".
assert.equal(redactedSink.events[0].metadata.password, undefined);

// "Child loggers": defaults merge underneath each call's own fields.
const childSink = new InMemoryAuditSink();
const childLog = new AuditLogger({ sinks: [childSink] }).child({ actorId: 'user_2' });
childLog.log({ action: 'invoices.exported', outcome: 'success' });
assert.equal(childSink.events[0].actorId, 'user_2');
// An explicit field on the call always wins over the child's defaults.
childLog.log({ action: 'invoices.exported', outcome: 'success', actorId: 'user_3' });
assert.equal(childSink.events[1].actorId, 'user_3');

console.log('OK audit-logging.md: basic usage + redact + child logger examples');
