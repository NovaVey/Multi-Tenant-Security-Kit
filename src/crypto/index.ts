export type { EncryptedPayload, KeyProvider } from './types.js';
export { EnvKeyProvider, StaticKeyProvider, TenantEncryptor } from './tenant-keys.js';
export type { TenantEncryptorOptions } from './tenant-keys.js';

// Re-exported so consumers importing only this subpath can catch/narrow on
// the error type `TenantEncryptor.decrypt()` throws, without also importing
// from the package root.
export { DecryptionError } from '../errors.js';
