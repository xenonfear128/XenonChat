import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Authentication state is persisted by the client and all sensitive data is
  // protected by the API. A previous version also copied the access token into
  // a JavaScript-readable cookie and used cookie presence for redirects. That
  // created redirect loops whenever cookie and localStorage diverged. Remove
  // the legacy cookie and let the authenticated app layout own navigation.
  const response = NextResponse.next();
  if (request.cookies.has('xc_access')) {
    response.cookies.delete('xc_access');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
