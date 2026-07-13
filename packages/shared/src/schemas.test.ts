import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './schemas';

describe('authentication schemas', () => {
  it('accepts both username and email login identifiers', () => {
    expect(
      loginSchema.parse({ identifier: 'Alice', password: 'Password123!' }),
    ).toMatchObject({ identifier: 'alice' });
    expect(
      loginSchema.parse({
        email: 'Alice@Example.com',
        password: 'Password123!',
      }),
    ).toMatchObject({ identifier: 'alice@example.com' });
  });

  it('rejects missing login identifiers', () => {
    expect(() => loginSchema.parse({ password: 'Password123!' })).toThrow();
  });

  it('rejects reserved and malformed registration usernames', () => {
    expect(() =>
      registerSchema.parse({
        email: 'new@example.com',
        password: 'Password123!',
        username: 'admin',
        nickname: 'New User',
      }),
    ).toThrow();
    expect(() =>
      registerSchema.parse({
        email: 'new@example.com',
        password: 'Password123!',
        username: 'bad-name',
        nickname: 'New User',
      }),
    ).toThrow();
  });
});
