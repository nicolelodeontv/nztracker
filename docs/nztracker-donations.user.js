// ==UserScript==
// @name         NZTracker Clan Donations
// @namespace    https://github.com/nicolelodeontv/nztracker
// @version      1.0.0
// @description  Reads the ClanService.getMemberList AMF response already fetched by Ninja Zenshin and sends only donation fields to NZTracker.
// @match        https://ninjazenshin.online/*
// @grant        GM_xmlhttpRequest
// @connect      chaoszenshintracker.vercel.app
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = true;
  const debugLog = (...args) => {
    if (DEBUG) console.debug('[nztracker]', ...args);
  };

  const AMF_ORIGIN = 'https://amf.ninjazenshin.online/';
  const TRACKER_ENDPOINT = 'https://chaoszenshintracker.vercel.app/api/donations';

  // Replace this placeholder locally. Never commit the real key.
  const INGEST_KEY = 'REPLACE_WITH_VERCEL_INGEST_KEY';

  const seen = new Set();
  let amfResponsesSeen = 0;

  class Reader {
    constructor(bytes) {
      this.data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
      this.offset = 0;
      this.references = [];
      this.decoder = new TextDecoder();
    }
    ensure(count) { if (this.offset + count > this.data.byteLength) throw new Error('AMF response is truncated.'); }
    u8() { this.ensure(1); return this.view.getUint8(this.offset++); }
    u16() { this.ensure(2); const value = this.view.getUint16(this.offset); this.offset += 2; return value; }
    u32() { this.ensure(4); const value = this.view.getUint32(this.offset); this.offset += 4; return value; }
    f64() { this.ensure(8); const value = this.view.getFloat64(this.offset); this.offset += 8; return value; }
    bytes(count) { this.ensure(count); const value = this.data.slice(this.offset, this.offset + count); this.offset += count; return value; }
    string16() { return this.decoder.decode(this.bytes(this.u16())); }
    string32() { return this.decoder.decode(this.bytes(this.u32())); }
    amf0() {
      const type = this.u8();
      switch (type) {
        case 0x00: return this.f64();
        case 0x01: return this.u8() === 1;
        case 0x02: return this.string16();
        case 0x03: return this.object();
        case 0x05:
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
        default: throw new Error(`Unsupported AMF0 type 0x${type.toString(16)}.`);
      }
    }
    object() {
      const result = {};
      this.references.push(result);
      while (true) {
        const keyLength = this.u16();
        if (keyLength === 0) {
          if (this.u8() === 0x09) break;
          throw new Error('Invalid AMF object terminator.');
        }
        const key = this.decoder.decode(this.bytes(keyLength));
        result[key] = this.amf0();
      }
      return result;
    }
    array() {
      const length = this.u32();
      const result = [];
      this.references.push(result);
      for (let index = 0; index < length; index += 1) result.push(this.amf0());
      return result;
    }
  }

  function decodePacket(bytes) {
    const reader = new Reader(bytes);
    const version = reader.u8();
    reader.u8();
    if (version !== 0) throw new Error('Expected AMF0.');
    const headerCount = reader.u16();
    for (let index = 0; index < headerCount; index += 1) {
      reader.string16();
      reader.u8();
      reader.u32();
      reader.amf0();
    }
    const bodyCount = reader.u16();
    if (bodyCount < 1) throw new Error('AMF response contained no body.');
    const bodies = [];
    for (let index = 0; index < bodyCount; index += 1) {
      const target = reader.string16();
      const response = reader.string16();
      const length = reader.u32();
      const data = reader.amf0();
      bodies.push({ target, response, length, data });
    }
    return bodies[0]?.data;
  }

  function responseBytes(value) {
    if (!value) return null;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (typeof value === 'string') return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    return null;
  }

  async function toBytes(value) {
    const direct = responseBytes(value);
    if (direct) return direct;
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    return null;
  }

  async function decodeRequestClanId(body) {
    const bytes = await toBytes(body);
    if (!bytes?.length) return null;
    try {
      const reader = new Reader(bytes);
      const version = reader.u8();
      reader.u8();
      if (version !== 0) return null;
      const headerCount = reader.u16();
      for (let index = 0; index < headerCount; index += 1) {
        reader.string16();
        reader.u8();
        reader.u32();
        reader.amf0();
      }
      const bodyCount = reader.u16();
      if (bodyCount < 1) return null;
      const target = reader.string16();
      reader.string16();
      reader.u32();
      const args = reader.amf0();
      if (target !== 'ClanService.getMemberList' || !Array.isArray(args)) return null;
      return String(args[0] ?? '').trim() || null;
    } catch { return null; }
  }

  function detectSeason() {
    const text = document.body?.innerText || '';
    return text.match(/Season\s+\d+/i)?.[0] || 'Season 3';
  }

  function normalizeMember(member) {
    const name = String(member?.name ?? member?.username ?? member?.player ?? member?.character ?? '').trim();
    const id = String(member?.id ?? member?.memberId ?? member?.member_id ?? name).trim();
    const level = Number(member?.level);
    const stamina = Number(member?.stamina ?? member?.current_stamina ?? member?.currentStamina);
    const reputationGain = Number(member?.reputation_gain ?? member?.reputationGain);
    const gold = Number(member?.donated_gold ?? member?.donatedGold ?? member?.gold_donated);
    const token = Number(member?.donated_token ?? member?.donatedToken ?? member?.token_donated);
    if (!name || !Number.isSafeInteger(gold) || gold < 0 || !Number.isSafeInteger(token) || token < 0) return null;
    return {
      id,
      name,
      level: Number.isFinite(level) ? Math.trunc(level) : 0,
      stamina: Number.isFinite(stamina) ? Math.trunc(stamina) : null,
      reputation_gain: Number.isFinite(reputationGain) ? Math.trunc(reputationGain) : null,
      donated_gold: gold,
      donated_token: token,
    };
  }

  function extractMembers(body) {
    if (!body || typeof body !== 'object') return [];
    if (body.status && String(body.status) !== '1') return [];
    const raw = Array.isArray(body.result) ? body.result : Array.isArray(body.members) ? body.members : [];
    return raw.map(normalizeMember).filter(Boolean);
  }

  function signature(clanId, members) {
    return `${clanId}:${members.map((m) => [m.id, m.donated_gold, m.donated_token]).join('|')}`;
  }

  function sendSnapshot(clanId, members) {
    if (!clanId || !members.length || !INGEST_KEY || INGEST_KEY === 'REPLACE_WITH_VERCEL_INGEST_KEY') return;
    const key = signature(clanId, members);
    if (seen.has(key)) return;
    seen.add(key);
    while (seen.size > 10) seen.delete(seen.values().next().value);

    GM_xmlhttpRequest({
      method: 'POST',
      url: TRACKER_ENDPOINT,
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': INGEST_KEY },
      data: JSON.stringify({ clanId, season: detectSeason(), members }),
      timeout: 15000,
      onload: (response) => {
        debugLog(`POST status: ${response.status}`);
      },
      onerror: (error) => {
        debugLog(`POST error: ${error?.error || error?.message || 'request failed'}`);
      },
      ontimeout: () => {
        debugLog('POST timeout');
      },
    });
  }

  async function processResponse(url, bytes, requestBody) {
    if (!url || !url.startsWith(AMF_ORIGIN) || !bytes?.length) return;
    amfResponsesSeen += 1;
    debugLog(`AMF responses seen: ${amfResponsesSeen}`);
    try {
      const body = decodePacket(bytes);
      const members = extractMembers(body);
      if (!members.length) return;
      debugLog(`parsed ${members.length} members`);
      const clanId = await decodeRequestClanId(requestBody);
      if (clanId) sendSnapshot(clanId, members);
    } catch (error) {
      debugLog(`decode error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const requestBodyPromise = input instanceof Request
      ? input.clone().arrayBuffer().catch(() => null)
      : Promise.resolve(init?.body ?? null);
    const response = await originalFetch.apply(this, arguments);
    if (requestUrl.startsWith(AMF_ORIGIN)) {
      try {
        const clone = response.clone();
        const bytes = new Uint8Array(await clone.arrayBuffer());
        const requestBody = await requestBodyPromise;
        processResponse(requestUrl, bytes, requestBody);
      } catch (error) {
        debugLog(`response read error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__nztrackerUrl = String(url || '');
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    this.__nztrackerBody = body;
    this.addEventListener('load', () => {
      if (!this.__nztrackerUrl.startsWith(AMF_ORIGIN)) return;
      toBytes(this.response)
        .then((bytes) => processResponse(this.__nztrackerUrl, bytes, this.__nztrackerBody))
        .catch((error) => debugLog(`response read error: ${error instanceof Error ? error.message : String(error)}`));
    });
    return originalSend.apply(this, arguments);
  };
})();
