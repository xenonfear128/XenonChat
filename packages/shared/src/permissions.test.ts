import { describe, expect, it } from 'vitest';
import {
  canGroupAction,
  canKickMember,
  computeExpiresAt,
  isMessageTypeAllowed,
  isPrivateIp,
  isSafePreviewUrl,
} from './permissions';

describe('group permissions', () => {
  it('owner can revoke admin', () => {
    expect(canGroupAction('owner', 'revoke_admin')).toBe(true);
    expect(canGroupAction('admin', 'revoke_admin')).toBe(false);
  });

  it('admin cannot kick admin or owner', () => {
    expect(canKickMember('admin', 'admin').allowed).toBe(false);
    expect(canKickMember('admin', 'owner').allowed).toBe(false);
    expect(canKickMember('admin', 'member').allowed).toBe(true);
    expect(canKickMember('owner', 'admin').allowed).toBe(true);
  });
});

describe('message type allowlist', () => {
  it('respects receiver allowlist', () => {
    expect(isMessageTypeAllowed(['text', 'voice'], 'image')).toBe(false);
    expect(isMessageTypeAllowed(['text', 'voice'], 'text')).toBe(true);
  });
});

describe('ttl', () => {
  it('computes expires_at', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(computeExpiresAt(created, 0)).toBeNull();
    expect(computeExpiresAt(created, 60)?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });
});

describe('ssrf helpers', () => {
  it('blocks private hosts', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('example.com')).toBe(false);
    expect(isSafePreviewUrl('http://localhost/x')).toBe(false);
    expect(isSafePreviewUrl('file:///etc/passwd')).toBe(false);
    expect(isSafePreviewUrl('https://example.com/a')).toBe(true);
  });
});
