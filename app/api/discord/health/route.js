export const revalidate = 0;

export async function GET() {
  const configured = Boolean(process.env.DISCORD_WEBHOOK_URL);
  return Response.json({
    configured,
    provider: 'discord',
    checkedAt: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store' } });
}
