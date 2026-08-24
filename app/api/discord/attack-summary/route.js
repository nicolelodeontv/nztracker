import { getRewardForDifference } from '../../../clan-war-rules';

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
  if (!webhook) return Response.json({ ok: false, error: 'DISCORD_WEBHOOK_URL is not configured.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 }); }

  const type = clean(body?.type) || 'attack';
  const clan = clean(body?.clan) || 'Ninja Zenshin clan';
  const attacker = clean(body?.attacker) || 'Unknown member';
  const reputationGain = Number(body?.reputationGain || 0);
  const remainingSeconds = Number(body?.remainingSeconds || 0);
  const stage = clean(body?.stage) || 'detected';
  const timestamp = clean(body?.timestamp) || new Date().toISOString();
  const bleeding = type === 'bleeding';
  const cleared = type === 'bleed_cleared';
  const rankChange = type === 'rank';
  const test = type === 'test';
  const mins = minutesLeft(remainingSeconds);
  const urgent = mins !== null && mins <= 6;

  const difference = Number(body?.reputationDifference);
  const expectedReward = body?.expectedReward ?? (Number.isFinite(difference) ? getRewardForDifference(difference) : null);

  const payload = {
    username: 'CHAOS Tracker - Bot',
    embeds: [{
      title: test
        ? '🧪 CHAOS Tracker Test Alert'
        : bleeding
          ? `${urgent ? '🔴' : '⚠️'} BLEED! ${clan}${mins !== null ? ` — ~${mins} min` : ''}`
          : cleared
            ? `🟢 BLEED CLEARED — ${clan}`
            : rankChange
              ? `📈 RANK CHANGE — ${clan}`
              : '⚔️ Ninja Zenshin Attack',
      description: test
        ? 'Discord webhook is connected. This is a test message from **nztracker**.'
        : bleeding
          ? (mins !== null ? `${urgent ? `~${mins} mins left!` : `Approximately ${mins} minutes left in the attack.`} **${clan}** is still bleeding!` : `**${clan}** is still bleeding!`)
          : cleared
            ? `**${clan}** is no longer bleeding. All known members have recovered.`
            : rankChange
              ? `**${clan}** changed rank: **${clean(body?.oldRank)} → ${clean(body?.newRank)}**.`
              : `**${clan}** recorded a new attack.`,
      color: test ? 5556223 : bleeding ? (urgent ? 14423178 : 16753920) : cleared ? 5763719 : rankChange ? 5556223 : 5556223,
      fields: test ? [
        { name: 'Status', value: 'Webhook delivered successfully', inline: true },
        { name: 'Time', value: timestamp, inline: true }
      ] : bleeding ? [
        ...(mins !== null ? [{ name: 'Attack Time Remaining', value: `~${mins} min`, inline: true }] : []),
        { name: 'Reminder', value: stage === '6m' ? '6-minute bleed reminder' : stage === '12m' ? '12-minute bleed reminder' : 'Bleed detected', inline: true },
        { name: 'Detected', value: timestamp, inline: false }
      ] : cleared ? [
        { name: 'Cleared At', value: timestamp, inline: true },
        { name: 'State', value: 'Fully recovered', inline: true }
      ] : rankChange ? [
        { name: 'Old Rank', value: clean(body?.oldRank) || '—', inline: true },
        { name: 'New Rank', value: clean(body?.newRank) || '—', inline: true },
        { name: 'Time', value: timestamp, inline: false }
      ] : [
        { name: 'Member', value: attacker, inline: true },
        { name: 'Reputation Gain', value: `+${reputationGain.toLocaleString('en-US')}`, inline: true },
        ...(Number.isFinite(difference) ? [{ name: 'Rep Difference', value: `${difference >= 0 ? '+' : '−'}${Math.abs(difference).toLocaleString('en-US')}`, inline: true }] : []),
        ...(expectedReward !== null && expectedReward !== undefined ? [{ name: 'Expected Victory Reward', value: `${expectedReward} Rep`, inline: true }] : []),
        { name: 'Time', value: timestamp, inline: false }
      ],
      footer: { text: 'CHAOS Tracker - Bot' }
    }]
  };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return Response.json({ ok: false, error: `Discord webhook returned ${response.status}.` }, { status: 502 });
    return Response.json({ ok: true, sentAt: new Date().toISOString(), type, stage });
  } catch (error) {
    return Response.json({ ok: false, error: 'Unable to post Discord notification.', details: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
