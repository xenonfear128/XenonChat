import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('local storage signed URLs', () => {
  const storage = new StorageService(
    new ConfigService({
      JWT_SECRET: 'test-signing-secret-at-least-32-characters',
      OBJECT_STORAGE_BUCKET: 'test',
    }),
  );

  it('signs and verifies a scoped local download token', async () => {
    const url = await storage.getSignedDownloadUrl(
      'uploads/user/file.png',
      60,
    );
    const token = url.split('/').at(-1)!;
    expect(storage.verifyLocalToken(token, 'read')).toBe(
      'uploads/user/file.png',
    );
    expect(() => storage.verifyLocalToken(token, 'write')).toThrow();
  });

  it('rejects tampered tokens and path traversal', async () => {
    const url = await storage.getSignedDownloadUrl(
      'uploads/user/file.png',
      60,
    );
    const token = url.split('/').at(-1)!;
    expect(() =>
      storage.verifyLocalToken(`${token.slice(0, -1)}x`, 'read'),
    ).toThrow();
    await expect(storage.readLocal('../../etc/passwd')).rejects.toThrow(
      'Invalid storage path',
    );
  });
});
