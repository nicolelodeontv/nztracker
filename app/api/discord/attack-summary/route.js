export const revalidate = 0;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function minutesLeft(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.ceil(value / 60));
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
  const remainingSeconds = Number(body?.remainingSeconds || 0);
  const stage = clean(body?.stage) || 'detected';
  const timestamp = clean(body?.timestamp) || new Date().toISOString();
  const bleeding = type === 'bleeding';
  const mins = minutesLeft(remainingSeconds);
  const urgent = mins !== null && mins <= 6;

  const payload = {
    username: 'CW Tracker - Bot',
    embeds: [{
      title: bleeding
        ? `${urgent ? '🔴' : '⚠️'} BLEED! ${clan}${mins !== null ? ` — ~${mins} min` : ''}`
        : '⚔️ Ninja Zenshin Attack',
      description: bleeding
        ? (mins !== null
            ? `${urgent ? `~${mins} mins left!` : `Approximately ${mins} minutes left in the attack.`} **${clan}** is still bleeding!`
            : `**${clan}** is still bleeding!`)
        : `**${clan}** recorded a new attack.`,
      color: bleeding ? (urgent ? 14423178 : 16753920) : 5556223,
      fields: bleeding ? [
        ...(mins !== null ? [{ name: 'Attack Time Remaining', value: `~${mins} min`, inline: true }] : []),
        { name: 'Reminder', value: stage === '6m' ? '6-minute bleed reminder' : stage === '12m' ? '12-minute bleed reminder' : 'Bleed detected', inline: true },
        { name: 'Detected', value: timestamp, inline: false }
      ] : [
        { name: 'Member', value: attacker, inline: true },
        { name: 'Reputation Gain', value: `+${reputationGain.toLocaleString('en-US')}`, inline: true },
        { name: 'Time', value: timestamp, inline: false }
      ],
      footer: { text: 'CW Tracker - Bot' }
    }]
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return Response.json({ error: `Discord webhook returned ${response.status}.` }, { status: 502 });
    return Response.json({ ok: true, sentAt: new Date().toISOString(), type, stage });
  } catch (error) {
    return Response.json({ error: 'Unable to post Discord notification.', details: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
