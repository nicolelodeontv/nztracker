export const revalidate = 0;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function POST(request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: 'DISCORD_WEBHOOK_URL is not configured.' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const clan = clean(body?.clan) || 'Ninja Zenshin clan';
  const attacker = clean(body?.attacker) || 'Unknown member';
  const reputationGain = Number(body?.reputationGain || 0);
  const timestamp = clean(body?.timestamp) || new Date().toISOString();

  const payload = {
    embeds: [
      {
        title: '⚔️ Ninja Zenshin Attack',
        description: `**${clan}** recorded a new attack.`,
        color: 5556223,
        fields: [
          { name: 'Member', value: attacker, inline: true },
          { name: 'Reputation Gain', value: `+${reputationGain.toLocaleString('en-US')}`, inline: true },
          { name: 'Time', value: timestamp, inline: false }
        ],
        footer: { text: 'Ninja Zenshin Clan Tracker' }
      }
    ]
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return Response.json({ error: `Discord webhook returned ${response.status}.` }, { status: 502 });
    }

    return Response.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({
      error: 'Unable to post attack summary to Discord.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}
