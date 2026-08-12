import { describe, expect, it } from 'vitest';

import { DecryptionError } from '../../src/errors.js';
import { EnvKeyProvider, StaticKeyProvider, TenantEncryptor } from '../../src/crypto/index.js';
import type { EncryptedPayload } from '../../src/crypto/index.js';

const MASTER_SECRET = 'a-sufficiently-long-master-secret-for-testing';

describe('EnvKeyProvider', () => {
  it('throws TypeError when the master secret is shorter than 16 bytes', () => {
    expect(() => new EnvKeyProvider('short')).toThrow(TypeError);
  });

  it('accepts a master secret of exactly 16 bytes', () => {
    expect(() => new EnvKeyProvider('0123456789abcdef')).not.toThrow();
  });

  it('accepts a Buffer master secret', () => {
    expect(() => new EnvKeyProvider(Buffer.from(MASTER_SECRET, 'utf8'))).not.toThrow();
  });

  it('throws TypeError for a too-short Buffer master secret', () => {
    expect(() => new EnvKeyProvider(Buffer.from('tiny'))).toThrow(TypeError);
  });

  it('derives a 32-byte key for a tenant', () => {
    const provider = new EnvKeyProvider(MASTER_SECRET);
    const key = provider.getDataKey('tenant-a');
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('derives the same key for the same tenant id (deterministic)', () => {
    const provider = new EnvKeyProvider(MASTER_SECRET);
    const key1 = provider.getDataKey('tenant-a');
    const key2 = provider.getDataKey('tenant-a');
    expect(key1.equals(key2)).toBe(true);
  });

  it('derives different keys for different tenants', () => {
    const provider = new EnvKeyProvider(MASTER_SECRET);
    const keyA = provider.getDataKey('tenant-a');
    const keyB = provider.getDataKey('tenant-b');
    expect(keyA.equals(keyB)).toBe(false);
  });
});

describe('StaticKeyProvider', () => {
  it('returns the configured key for a known tenant', () => {
    const key = Buffer.alloc(32, 7);
    const provider = new StaticKeyProvider({ 'tenant-a': key });
    expect(provider.getDataKey('tenant-a')).toBe(key);
  });

  it('throws a plain Error with a clear message for an unconfigured tenant', () => {
    const provider = new StaticKeyProvider({});
    expect(() => provider.getDataKey('tenant-missing')).toThrow(
      'no encryption key configured for tenant tenant-missing',
    );
  });

  it('the thrown error is not a DecryptionError (it is a configuration error)', () => {
    const provider = new StaticKeyProvider({});
    try {
      provider.getDataKey('tenant-missing');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(DecryptionError);
    }
  });
});

describe('TenantEncryptor', () => {
  it('round-trips a string plaintext through encrypt/decrypt', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload = await encryptor.encrypt('tenant-a', 'hello, world');
    const decrypted = await encryptor.decrypt('tenant-a', payload);
    expect(decrypted.toString('utf8')).toBe('hello, world');
  });

  it('round-trips a Buffer plaintext through encrypt/decrypt', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const original = Buffer.from([0, 1, 2, 3, 255, 254, 253]);
    const payload = await encryptor.encrypt('tenant-a', original);
    const decrypted = await encryptor.decrypt('tenant-a', payload);
    expect(decrypted.equals(original)).toBe(true);
  });

  it('produces an EncryptedPayload with base64 fields and no keyId', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload = await encryptor.encrypt('tenant-a', 'data');
    expect(typeof payload.ciphertext).toBe('string');
    expect(typeof payload.iv).toBe('string');
    expect(typeof payload.authTag).toBe('string');
    expect(payload.keyId).toBeUndefined();
    // IV must decode to 12 bytes, authTag to 16 bytes.
    expect(Buffer.from(payload.iv, 'base64').length).toBe(12);
    expect(Buffer.from(payload.authTag, 'base64').length).toBe(16);
  });

  it('produces different ciphertext for the same plaintext across different tenants', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payloadA = await encryptor.encrypt('tenant-a', 'identical plaintext');
    const payloadB = await encryptor.encrypt('tenant-b', 'identical plaintext');
    expect(payloadA.ciphertext).not.toBe(payloadB.ciphertext);
  });

  it('produces different ciphertext across repeated encryptions of the same plaintext (random IV)', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload1 = await encryptor.encrypt('tenant-a', 'same plaintext');
    const payload2 = await encryptor.encrypt('tenant-a', 'same plaintext');
    expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
    expect(payload1.iv).not.toBe(payload2.iv);
  });

  it('throws DecryptionError when decrypting tenant A payload with tenant B key (StaticKeyProvider)', async () => {
    const keyA = Buffer.alloc(32, 1);
    const keyB = Buffer.alloc(32, 2);
    const encryptor = new TenantEncryptor({
      keyProvider: new StaticKeyProvider({ 'tenant-a': keyA, 'tenant-b': keyB }),
    });
    const payload = await encryptor.encrypt('tenant-a', 'secret data');
    await expect(encryptor.decrypt('tenant-b', payload)).rejects.toThrow(DecryptionError);
  });

  it('the DecryptionError from a cross-tenant decrypt carries the original cause', async () => {
    const keyA = Buffer.alloc(32, 1);
    const keyB = Buffer.alloc(32, 2);
    const encryptor = new TenantEncryptor({
      keyProvider: new StaticKeyProvider({ 'tenant-a': keyA, 'tenant-b': keyB }),
    });
    const payload = await encryptor.encrypt('tenant-a', 'secret data');
    try {
      await encryptor.decrypt('tenant-b', payload);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DecryptionError);
      const error = err as DecryptionError;
      expect(error.code).toBe('DECRYPTION_FAILED');
      expect(error.cause).toBeDefined();
    }
  });

  it('throws DecryptionError when the ciphertext is tampered with', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload = await encryptor.encrypt('tenant-a', 'secret data');
    const tampered: EncryptedPayload = { ...payload, ciphertext: flipLastByte(payload.ciphertext) };
    await expect(encryptor.decrypt('tenant-a', tampered)).rejects.toThrow(DecryptionError);
  });

  it('throws DecryptionError when the authTag is tampered with', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload = await encryptor.encrypt('tenant-a', 'secret data');
    const tampered: EncryptedPayload = { ...payload, authTag: flipLastByte(payload.authTag) };
    await expect(encryptor.decrypt('tenant-a', tampered)).rejects.toThrow(DecryptionError);
  });

  it('round-trips successfully when matching AAD is supplied to both encrypt and decrypt', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const aad = Buffer.from('record-123', 'utf8');
    const payload = await encryptor.encrypt('tenant-a', 'aad-protected data', aad);
    const decrypted = await encryptor.decrypt('tenant-a', payload, aad);
    expect(decrypted.toString('utf8')).toBe('aad-protected data');
  });

  it('throws DecryptionError when AAD is provided on encrypt but omitted on decrypt', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const aad = Buffer.from('record-123', 'utf8');
    const payload = await encryptor.encrypt('tenant-a', 'aad-protected data', aad);
    await expect(encryptor.decrypt('tenant-a', payload)).rejects.toThrow(DecryptionError);
  });

  it('throws DecryptionError when AAD mismatches between encrypt and decrypt', async () => {
    const encryptor = new TenantEncryptor({ keyProvider: new EnvKeyProvider(MASTER_SECRET) });
    const payload = await encryptor.encrypt(
      'tenant-a',
      'aad-protected data',
      Buffer.from('record-123'),
    );
    await expect(encryptor.decrypt('tenant-a', payload, Buffer.from('record-456'))).rejects.toThrow(
      DecryptionError,
    );
  });

  it('throws TypeError when the KeyProvider returns a key that is too short', async () => {
    const badProvider = { getDataKey: () => Buffer.alloc(16) };
    const encryptor = new TenantEncryptor({ keyProvider: badProvider });
    await expect(encryptor.encrypt('tenant-a', 'data')).rejects.toThrow(TypeError);
  });

  it('throws TypeError when the KeyProvider returns a key that is too long', async () => {
    const badProvider = { getDataKey: () => Buffer.alloc(64) };
    const encryptor = new TenantEncryptor({ keyProvider: badProvider });
    await expect(encryptor.encrypt('tenant-a', 'data')).rejects.toThrow(TypeError);
  });

  it('throws TypeError on decrypt when the KeyProvider returns a wrong-length key', async () => {
    const goodProvider = new EnvKeyProvider(MASTER_SECRET);
    const encryptor = new TenantEncryptor({ keyProvider: goodProvider });
    const payload = await encryptor.encrypt('tenant-a', 'data');

    const badProvider = { getDataKey: () => Buffer.alloc(10) };
    const badEncryptor = new TenantEncryptor({ keyProvider: badProvider });
    await expect(badEncryptor.decrypt('tenant-a', payload)).rejects.toThrow(TypeError);
  });

  it('supports an async KeyProvider (getDataKey returning a Promise<Buffer>)', async () => {
    const key = Buffer.alloc(32, 9);
    const asyncProvider = {
      getDataKey: async (_tenantId: string) => key,
    };
    const encryptor = new TenantEncryptor({ keyProvider: asyncProvider });
    const payload = await encryptor.encrypt('tenant-a', 'async provider works');
    const decrypted = await encryptor.decrypt('tenant-a', payload);
    expect(decrypted.toString('utf8')).toBe('async provider works');
  });
});

/** Flips the low bit of the last byte of a base64 string, re-encoding the result. */
function flipLastByte(base64: string): string {
  const buffer = Buffer.from(base64, 'base64');
  buffer[buffer.length - 1] = (buffer[buffer.length - 1] ?? 0) ^ 0x01;
  return buffer.toString('base64');
}
