import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('authentication middleware compatibility', () => {
  it('does not redirect public routes when a stale legacy cookie exists', () => {
    const request = new NextRequest('http://localhost/login', {
      headers: { cookie: 'xc_access=stale-token' },
    });
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain('xc_access=');
    expect(response.headers.get('set-cookie')).toContain('Expires=');
  });

  it('lets protected UI routes reach the client-side auth boundary', () => {
    const response = middleware(
      new NextRequest('http://localhost/chats/private-conversation'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
