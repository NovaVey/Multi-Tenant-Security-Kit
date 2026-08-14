# Per-tenant encryption

`@novavey/multi-tenant-security-kit/crypto`

Encrypts tenant data at rest with AES-256-GCM, where **every tenant gets a
cryptographically independent key.** Encrypting all tenants under one global
key means a single key leak exposes every tenant at once; this module avoids
that by deriving (or looking up) a distinct key per tenant. Built entirely on
Node's `node:crypto` — no external crypto dependency.

## Basic usage

```ts
import { EnvKeyProvider, TenantEncryptor } from '@novavey/multi-tenant-security-kit/crypto';

const keyProvider = new EnvKeyProvider(process.env.MASTER_SECRET!);
const encryptor = new TenantEncryptor({ keyProvider });

const payload = await encryptor.encrypt('acme', 'sensitive data');
// { ciphertext, iv, authTag } — all base64, safe to store as JSON/columns

const plaintext = await encryptor.decrypt('acme', payload);
// Buffer — .toString('utf8') to get the original string back
```

## How per-tenant keys are derived

`EnvKeyProvider` derives each tenant's 256-bit key from a single master
secret using HKDF (RFC 5869, SHA-256), with the tenant id as HKDF's "info"
parameter:

```ts
new EnvKeyProvider(process.env.MASTER_SECRET!); // string or Buffer, >= 16 bytes
```

The point of this indirection: you manage exactly **one** secret — fetched
once from a secrets manager at startup — while every tenant still gets an
independent key. Because HKDF is a one-way derivation, compromising or
misusing one tenant's derived key reveals nothing about another tenant's
key, and reveals nothing about the master secret itself.

This is the pragmatic default for getting started, not the ceiling. For
production deployments wanting real per-tenant key **rotation** (issuing a
brand-new, unrelated key for a single tenant without touching anyone else's)
and a centralized audit trail of key access, implement the `KeyProvider`
interface against a real KMS (AWS KMS, GCP KMS, HashiCorp Vault) instead —
`TenantEncryptor` doesn't care how a key was sourced:

```ts
import type { KeyProvider } from '@novavey/multi-tenant-security-kit/crypto';

class KmsKeyProvider implements KeyProvider {
  async getDataKey(tenantId: string): Promise<Buffer> {
    return kmsClient.decrypt(await tenantKeyStore.getWrappedKey(tenantId));
  }
}

const encryptor = new TenantEncryptor({ keyProvider: new KmsKeyProvider() });
```

`StaticKeyProvider` (a direct `tenantId -> key` map) is provided for tests
and fixtures where deterministic keys matter more than derivation.

## Associated data (AAD)

Bind a ciphertext to a specific context — e.g. a record id — so it can't be
silently moved or replayed elsewhere:

```ts
const aad = Buffer.from(invoice.id, 'utf8');
const payload = await encryptor.encrypt('acme', invoiceBody, aad);

// decrypting requires the exact same aad; anything else throws DecryptionError
await encryptor.decrypt('acme', payload, aad);
```

## Failure behavior

`decrypt` throws `DecryptionError` (never returns garbage) for any of:

- the wrong tenant id (its key won't match the one `encrypt` used),
- a tampered ciphertext or auth tag (even a single flipped byte),
- mismatched or missing `aad`.

This isn't reimplemented by this module — it relies entirely on AES-GCM's
built-in authentication-tag verification inside `decipher.final()`. Nothing
here does a manual tag comparison, which is an easy place to introduce a
timing side channel.

## API reference

| Export                   | Kind      | Summary                                                                                       |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| `KeyProvider`            | interface | `getDataKey(tenantId): Buffer \| Promise<Buffer>` — the extension point                       |
| `EncryptedPayload`       | type      | `{ ciphertext, iv, authTag, keyId? }` (all base64)                                            |
| `EnvKeyProvider`         | class     | HKDF-derives a per-tenant key from one master secret                                          |
| `StaticKeyProvider`      | class     | Fixed `tenantId -> key` map — tests/fixtures                                                  |
| `TenantEncryptorOptions` | type      | `{ keyProvider: KeyProvider }`                                                                |
| `TenantEncryptor`        | class     | `.encrypt(tenantId, plaintext, aad?)`, `.decrypt(tenantId, payload, aad?)`                    |
| `SecurityKitError`       | class     | Base class every error in this package extends; carries a stable `.code`                      |
| `DecryptionError`        | class     | Thrown by `.decrypt()` (bad key, tampered payload, wrong tenant); `code: 'DECRYPTION_FAILED'` |
