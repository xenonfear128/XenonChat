import { describe, expect, it } from 'vitest';
import { detectMimeFromBuffer } from './magic';

describe('magic byte detection', () => {
  it('detects png', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeFromBuffer(buf)?.mime).toBe('image/png');
  });

  it('detects jpeg', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeFromBuffer(buf)?.mime).toBe('image/jpeg');
  });

  it('returns null for unknown', () => {
    expect(detectMimeFromBuffer(Buffer.from([1, 2, 3, 4]))).toBeNull();
  });
});
