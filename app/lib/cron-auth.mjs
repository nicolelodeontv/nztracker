const warnedRoutes = new Set();

export function requireCronSecret(request, routeName) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (!warnedRoutes.has(routeName)) {
      console.warn(
        `CRON_SECRET is not configured; authorization remains disabled for ${routeName}.`
      );
      warnedRoutes.add(routeName);
    }
    return null;
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }

  return null;
}


export function requireRequiredCronSecret(request, routeName) {
  const secret = process.env.CRON_SECRET;

  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }

  return null;
}
