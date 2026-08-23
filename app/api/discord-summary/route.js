export const dynamic = 'force-dynamic';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  return Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
}

export async function POST(request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: 'DISCORD_WEBHOOK_URL is not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const clan = clean(body?.clan || 'Ninja Zenshin');
    const member = clean(body?.member || 'Unknown member');
    const gain = toNumber(body?.gain);
    const rank = toNumber(body?.rank);
    const reputation = toNumber(body?.reputation);
    const time = clean(body?.time) || new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

    const payload = {
      username: 'Ninja Zenshin Tracker',
      embeds: [{
        title: '⚔️ Ninja Zenshin Attack',
        color: 0x54d7ff,
        fields: [
          { name: 'Clan', value: clan, inline: true },
          { name: 'Member', value: member, inline: true },
          { name: 'Reputation Gain', value: `+${gain.toLocaleString('en-US')}`, inline: true },
          { name: 'Current Rank', value: rank ? `#${rank}` : '—', inline: true },
          { name: 'Current Reputation', value: reputation.toLocaleString('en-US'), inline: true },
          { name: 'Time', value: time, inline: true }
        ],
        footer: { text: 'NZTracker • Live clan tracker' },
        timestamp: new Date().toISOString()
      }]
    };

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    if (!response.ok) {
      return Response.json({ error: `Discord webhook returned ${response.status}.` }, { status: 502 });
    }

    return Response.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
