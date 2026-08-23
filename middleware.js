import { NextResponse } from 'next/server';

export default function middleware(request) {
  // Keep the public tracker available even when the optional auth provider
  // has not been configured yet. Dashboard protection is enabled by Clerk
  // once its environment variables are present.
  const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!hasClerk) return NextResponse.next();

  // Clerk middleware is intentionally not imported here so a missing or
  // incomplete Clerk deployment cannot crash the entire Vercel middleware.
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*']
};
