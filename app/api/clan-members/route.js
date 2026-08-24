export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const AMF_ORIGIN = 'https://amf.ninjazenshin.online/';
const LEGACY_MEMBER_API = 'https://ninjazenshin.online/clan-ranking/members';
const SERVICE = 'ClanService.getMemberList';
const RESPONSE_TARGET = '/1';
const DEFAULT_MAX_STAMINA = 200;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pushBytes(target, bytes) {
  for (const byte of bytes) target.push(byte);
}

function pushU16(target, value) {
  target.push((value >>> 8) & 0xff, value & 0xff);
}

function pushU32(target, value) {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushUtf(target, value) {
  const bytes = textEncoder.encode(String(value ?? ''));
  if (bytes.length > 0xffff) throw new Error('AMF string is too long.');
  pushU16(target, bytes.length);
  pushBytes(target, bytes);
}

function buildMemberRequest(clanId) {
  const output = [];
  output.push(0x00, 0x00);
  pushU16(output, 0);
  pushU16(output, 1);
  pushUtf(output, SERVICE);
  pushUtf(output, RESPONSE_TARGET);
  pushU32(output, 0xffffffff);
  output.push(0x0a);
  pushU32(output, 1);
  output.push(0x02);
  pushUtf(output, clanId);
  return new Uint8Array(output);
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
    this.references = [];
  }

  ensure(count) {
    if (this.offset + count > this.bytes.byteLength) throw new Error(`Invalid AMF response: truncated at byte ${this.offset}.`);
  }

  u8() { this.ensure(1); return this.view.getUint8(this.offset++); }

  u16() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  f64() {
    this.ensure(8);
    const value = this.view.getFloat64(this.offset);
    this.offset += 8;
    return value;
  }

  readBytes(count) {
    this.ensure(count);
    const value = this.bytes.slice(this.offset, this.offset + count);
    this.offset += count;
    return value;
  }

  string16() { return textDecoder.decode(this.readBytes(this.u16())); }
  string32() { return textDecoder.decode(this.readBytes(this.u32())); }

  amf0() {
    const type = this.u8();
    switch (type) {
      case 0x00: return this.f64();
      case 0x01: return this.u8() === 1;
      case 0x02: return this.string16();
      case 0x03: return this.object();
      case 0x05: return null;
      case 0x06: return null;
      case 0x07: return this.references[this.u16()] ?? null;
      case 0x08: this.u32(); return this.object();
      case 0x0a: return this.array();
      case 0x0b: this.f64(); this.u16(); return null;
      case 0x0c: return this.string32();
      case 0x10: {
        const className = this.string16();
        const value = this.object();
        if (value && typeof value === 'object') value.__className = className;
        return value;
      }
      case 0x11: throw new Error('Ninja Zenshin returned AMF3 data.');
      default: throw new Error(`Unsupported AMF0 type 0x${type.toString(16).padStart(2, '0')}.`);
    }
  }

  object() {
    const result = {};
    this.references.push(result);
    while (true) {
      const keyLength = this.u16();
      if (keyLength === 0) {
        const marker = this.u8();
        if (marker === 0x09) break;
        throw new Error(`Invalid AMF object terminator 0x${marker.toString(16)}.`);
      }
      const key = textDecoder.decode(this.readBytes(keyLength));
      result[key] = this.amf0();
    }
    return result;
  }

  array() {
    const length = this.u32();
    const result = [];
    this.references.push(result);
    for (let i = 0; i < length; i += 1) result.push(this.amf0());
    return result;
  }
}

function parseMemberResponse(buffer) {
  const reader = new Reader(buffer);
  const version = reader.u8();
  reader.u8();
  if (version !== 0) throw new Error(`Unsupported AMF message version ${version}.`);

  const headerCount = reader.u16();
  for (let i = 0; i < headerCount; i += 1) {
    reader.string16();
    reader.u8();
    reader.u32();
    reader.amf0();
  }

  const bodyCount = reader.u16();
  if (bodyCount < 1) throw new Error('Ninja Zenshin returned an AMF packet with no bodies.');

  const bodies = [];
  for (let i = 0; i < bodyCount; i += 1) {
    const target = reader.string16();
    const response = reader.string16();
    const length = reader.u32();
    const data = reader.amf0();
    bodies.push({ target, response, length, data });
  }
  return bodies[0]?.data;
}

function normalizeMembers(rawMembers) {
  return (Array.isArray(rawMembers) ? rawMembers : []).map((member) => {
    const source = member && typeof member === 'object' ? member : {};
    const nested = source?.stats || source?.attributes || source?.status || {};
    const name = clean(source.name ?? source.username ?? source.player ?? source.character);
    const reputation = toNumber(source.reputation ?? source.rep ?? source.reputation_gain ?? source.points) ?? 0;
    const staminaValue = toNumber(source.stamina ?? source.currentStamina ?? source.staminaCurrent ?? source.sta ?? source.current_sta)
      ?? toNumber(nested.stamina ?? nested.currentStamina ?? nested.staminaCurrent ?? nested.sta ?? nested.current_sta);
    const maxStaminaValue = toNumber(source.maxStamina ?? source.staminaMax ?? source.max_stamina ?? source.staminaLimit ?? source.maxSta)
      ?? toNumber(nested.maxStamina ?? nested.staminaMax ?? nested.max_stamina ?? nested.staminaLimit ?? nested.maxSta);
    const maxStamina = maxStaminaValue ?? DEFAULT_MAX_STAMINA;
    const stamina = staminaValue ?? maxStamina;

    return {
      id: clean(source.id),
      name,
      level: toNumber(source.level) ?? 0,
      reputation,
      reputationGain: toNumber(source.reputation_gain),
      gain: 0,
      totalGain: 0,
      stamina,
      maxStamina,
      staminaKnown: staminaValue !== null,
      maxStaminaKnown: maxStaminaValue !== null,
      bleedingThreshold: maxStamina * 0.70,
      drainFloor: maxStamina * 0.50,
      bleeding: stamina <= maxStamina * 0.70
    };
  }).filter((member) => member.name);
}

async function fromAmf(clanId) {
  const response = await fetch(AMF_ORIGIN, {
    method: 'POST',
    cache: 'no-store',
    body: buildMemberRequest(clanId),
    headers: {
      Accept: '*/*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-amf',
      Origin: 'https://ninjazenshin.online',
      Pragma: 'no-cache',
      Referer: 'https://ninjazenshin.online/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'
    }
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) throw new Error(`AMF service returned HTTP ${response.status}.`);
  if (!bytes.length) throw new Error('AMF service returned an empty response.');

  const bodyData = parseMemberResponse(bytes);
  if (!bodyData || typeof bodyData !== 'object') throw new Error('AMF response did not contain an object result.');
  if (bodyData.status && String(bodyData.status) !== '1') throw new Error(`Ninja Zenshin member service returned status ${bodyData.status}.`);

  const rawMembers = Array.isArray(bodyData.result) ? bodyData.result : Array.isArray(bodyData.members) ? bodyData.members : [];
  const members = normalizeMembers(rawMembers);
  if (!members.length) throw new Error('AMF member result contained no members.');

  return {
    clanId,
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
    source: AMF_ORIGIN,
    service: SERVICE,
    stored: false,
    staminaSource: members.some((member) => member.staminaKnown) ? 'game-amf' : 'default-200'
  };
}

async function fromLegacy(clanId) {
  const target = `${LEGACY_MEMBER_API}/${encodeURIComponent(clanId)}`;
  const response = await fetch(target, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.1',
      Accept: 'application/json,text/plain,text/html,*/*'
    }
  });
  if (!response.ok) throw new Error(`Legacy member source returned HTTP ${response.status}.`);
  const text = await response.text();
  let rawMembers = [];
  try {
    const payload = JSON.parse(text);
    rawMembers = Array.isArray(payload?.members) ? payload.members : Array.isArray(payload) ? payload : [];
  } catch {
    const match = text.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    rawMembers = match.map((row) => ({ name: clean(row.replace(/<[^>]+>/g, ' ')) }));
  }
  const members = normalizeMembers(rawMembers);
  if (!members.length) throw new Error('Legacy member source returned no members.');
  return {
    clanId,
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
    source: target,
    service: 'legacy-fallback',
    stored: false,
    staminaSource: 'default-200'
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const clanId = clean(url.searchParams.get('clanId'));

  if (!clanId || !/^[a-zA-Z0-9_-]+$/.test(clanId)) {
    return Response.json({ error: 'A valid Ninja Zenshin clanId is required.' }, { status: 400 });
  }

  try {
    try {
      return Response.json(await fromAmf(clanId), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    } catch (amfError) {
      console.warn('Game AMF member request failed; using live fallback.', amfError);
      const fallback = await fromLegacy(clanId);
      return Response.json({ ...fallback, fallbackReason: amfError instanceof Error ? amfError.message : String(amfError) }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    }
  } catch (error) {
    console.error('All Ninja Zenshin member sources failed', error);
    return Response.json({
      error: 'Unable to fetch Ninja Zenshin clan members right now',
      details: error instanceof Error ? error.message : String(error),
      clanId,
      source: AMF_ORIGIN,
      service: SERVICE
    }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }
}
