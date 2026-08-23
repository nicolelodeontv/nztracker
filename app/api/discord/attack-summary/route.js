export const revalidate = 0;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function POST(request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return Response.json({ error: 'DISCORD_WEBHOOK_URL is not configured.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const type = clean(body?.type) || 'attack';
  const clan = clean(body?.clan) || 'Ninja Zenshin clan';
  const attacker = clean(body?.attacker) || 'Unknown member';
  const reputationGain = Number(body?.reputationGain || 0);
  const reputationLoss = Number(body?.reputationLoss || 0);
  const previousReputation = Number(body?.previousReputation || 0);
  const currentReputation = Number(body?.currentReputation || 0);
  const timestamp = clean(body?.timestamp) || new Date().toISOString();
  const bleeding = type === 'bleeding';

  const payload = { embeds: [{
    title: bleeding ? '🩸 Ninja Zenshin Clan Bleeding' : '⚔️ Ninja Zenshin Attack',
    description: bleeding ? `**${clan}** lost reputation since the previous live sync.` : `**${clan}** recorded a new attack.`,
    color: bleeding ? 16729116 : 5556223,
    fields: bleeding ? [
      { name: 'Reputation Lost', value: `-${reputationLoss.toLocaleString('en-US')}`, inline: true },
      { name: 'Previous', value: previousReputation.toLocaleString('en-US'), inline: true },
      { name: 'Current', value: currentReputation.toLocaleString('en-US'), inline: true },
      { name: 'Detected', value: timestamp, inline: false }
    ] : [
      { name: 'Member', value: attacker, inline: true },
      { name: 'Reputation Gain', value: `+${reputationGain.toLocaleString('en-US')}`, inline: true },
      { name: 'Time', value: timestamp, inline: false }
    ],
    footer: { text: 'Ninja Zenshin Clan Tracker' }
  }] };

  try {
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) return Response.json({ error: `Discord webhook returned ${response.status}.` }, { status: 502 });
    return Response.json({ ok: true, sentAt: new Date().toISOString(), type });
  } catch (error) {
    return Response.json({ error: 'Unable to post Discord notification.', details: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
