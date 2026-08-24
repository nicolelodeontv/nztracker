'use client';

import { useEffect } from 'react';

const WATCH_KEY = 'nztracker:watchlist:v1';
const REP_KEY = 'nztracker:command-rep:v5';
const FEED_KEY = 'nztracker:live-feed:v3';
const FEED_LIMIT = 18;
const REP_WINDOW = 10 * 60 * 1000;

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const num = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const previous = new Map();

function cellNum(row, index) {
  const cell = row?.children?.[index];
  if (!cell) return 0;
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('.last-change,.watch-button,.nz-last-change,.nz-watch').forEach((node) => node.remove());
  return num(clone.textContent);
}

function validFeedItem(item) {
  const delta = Number(item?.delta);
  return !!item?.clan && Number.isSafeInteger(delta) && Math.abs(delta) <= Number.MAX_SAFE_INTEGER && Number.isFinite(Number(item?.at));
}

function injectStyles() {
  if (document.querySelector('[data-nz-enhancement-style]')) return;
  const style = document.createElement('style');
  style.dataset.nzEnhancementStyle = 'true';
  style.textContent = `
    @keyframes nzGainPop{0%{transform:scale(1);opacity:.85}35%{transform:scale(1.16);opacity:1;text-shadow:0 0 10px rgba(93,229,173,.45)}100%{transform:scale(1);opacity:1}}
    @keyframes nzFloat{0%{transform:translateY(3px);opacity:0}15%{opacity:1}100%{transform:translateY(-22px);opacity:0}}
    .gain.nz-pop,.total-gain.nz-pop{animation:nzGainPop .45s ease-out;transform-origin:left center}
    .nz-rep-float{position:absolute;left:0;top:-4px;z-index:30;pointer-events:none;color:#5de5ad;font:700 .68rem 'Space Mono',monospace;white-space:nowrap;animation:nzFloat .8s ease-out forwards}
    .command-center{display:grid;gap:8px;margin:8px 0 10px;padding:9px 10px;border:1px solid #1b2632;border-radius:12px;background:#080f17}
    .command-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .command-tab{height:32px;padding:0 11px;border:1px solid #26313d;border-radius:8px;background:#0a1119;color:#8794a6;font:700 .5rem 'Space Mono',monospace;cursor:pointer}
    .command-tab:hover,.command-tab.active{border-color:#315a70;color:#54d7ff;background:#0c1821}
    .command-tab.bleed.active{border-color:#7d3535;color:#ff9a9a;background:#1a0d0d}
    .command-status{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;color:#66758a;font:600 .47rem 'Space Mono',monospace}
    .command-bleed{color:#ff9a9a}.command-bleed.ok{color:#7d8999}
    .nz-feed{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(230px,.8fr);gap:8px;margin:0 0 11px}
    .nz-feed-panel{background:#080f17;border:1px solid #1b2632;border-radius:13px;min-width:0;overflow:hidden}
    .nz-feed-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;border-bottom:1px solid #17212b}
    .nz-feed-head h3{margin:0;font:700 .72rem 'Plus Jakarta Sans',system-ui,sans-serif}
    .nz-feed-head span{color:#637186;font:600 .43rem 'Space Mono',monospace}
    .nz-feed-list,.nz-top-list{max-height:300px;overflow:auto}
    .nz-feed-item{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:8px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}
    .nz-feed-time{color:#5f6e80}.nz-feed-clan{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-feed-value{font-weight:700;white-space:nowrap}.nz-feed-value.up{color:#5de5ad}.nz-feed-value.down{color:#ff8e8e}
    .nz-top-item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:7px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}.nz-top-rank{color:#54d7ff}.nz-top-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-top-gain{color:#5de5ad;white-space:nowrap}
    .last-change{display:block;margin-top:2px;color:#65758a;font:600 .4rem 'Space Mono',monospace}
    .potential-bleed-row{box-shadow:inset 3px 0 0 #ff6464;background:rgba(255,70,70,.025)!important}
    .watch-button{width:25px;height:24px;margin-right:4px;padding:0;border:0;background:none;color:#536276;font-size:15px;cursor:pointer}.watch-button:hover{color:#ffd768}
    @media(max-width:760px){.nz-feed{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function clanName(row) {
  return text(row?.children?.[1]?.querySelector('b')?.textContent || row?.children?.[1]?.textContent);
}
function getRows() {
  return [...document.querySelectorAll('.table-wrap .table-row')];
}

function cleanLegacy() {
  document.querySelectorAll('.tracker .section').forEach((section) => {
    if (text(section.querySelector('h2')?.textContent) === 'Attack Analytics') section.remove();
  });
  document.querySelectorAll('.section .eyebrow,.section-head .eyebrow').forEach((node) => {
    if (text(node.textContent).toUpperCase() === 'REFERENCE ANALYTICS') node.remove();
  });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (text(node.nodeValue).toUpperCase() === '30M GAIN') node.nodeValue = 'GAIN';
  });
}

function capture(rows) {
  const state = read(REP_KEY, {});
  const stored = read(FEED_KEY, []);
  const feed = Array.isArray(stored) ? stored.filter(validFeedItem) : [];
  const now = Date.now();

  rows.forEach((row) => {
    const clan = clanName(row);
    if (!clan) return;

    const rep = cellNum(row, 4);
    if (!Number.isSafeInteger(rep) || rep < 0) return;

    const old = state[clan];
    if (old && Number.isSafeInteger(Number(old.rep)) && rep !== Number(old.rep)) {
      const delta = rep - Number(old.rep);
      if (Number.isSafeInteger(delta)) {
        const event = { clan, delta, rep, at: now };
        const duplicate = feed[0] && feed[0].clan === clan && Number(feed[0].delta) === delta && now - Number(feed[0].at || 0) < 2000;
        if (!duplicate) feed.unshift(event);
        state[clan] = event;
      }
    } else if (!old) {
      state[clan] = { rep, delta: 0, at: now };
    } else {
      state[clan] = { ...old, rep: Number.isSafeInteger(rep) ? rep : old.rep };
    }
  });

  const recent = feed.filter((item) => now - Number(item?.at || 0) <= 24 * 60 * 60 * 1000).slice(0, FEED_LIMIT);
  write(REP_KEY, state);
  write(FEED_KEY, recent);
  return { state, feed: recent };
}

function applyFilter(view) {
  const rows = getRows();
  const watched = read(WATCH_KEY, []);
  const state = read(REP_KEY, {});
  const topWar = new Set(rows.map((row) => ({ clan: clanName(row), gain: cellNum(row, 5), rep: cellNum(row, 4) }))
    .sort((a, b) => b.gain - a.gain || b.rep - a.rep).slice(0, 6).map((item) => item.clan));

  rows.forEach((row) => {
    const clan = clanName(row);
    const bleeding = Number(state[clan]?.delta || 0) < 0 && Date.now() - Number(state[clan]?.at || 0) <= REP_WINDOW;
    row.classList.toggle('potential-bleed-row', bleeding);
    row.style.display = view === 'watch' ? (watched.includes(clan) ? '' : 'none') : view === 'war' ? (topWar.has(clan) ? '' : 'none') : view === 'bleed' ? (bleeding ? '' : 'none') : '';
  });
}

function setupCommand(tracker, state, feed) {
  const hero = tracker.querySelector('.hero');
  if (!hero) return;
  let bar = tracker.querySelector('[data-command-center]');
  if (!bar) {
    bar = document.createElement('section');
    bar.className = 'command-center';
    bar.dataset.commandCenter = 'true';
    bar.innerHTML = '<div class="command-tabs"><button class="command-tab active" data-view="all">ALL</button><button class="command-tab" data-view="watch">★ WATCHLIST</button><button class="command-tab" data-view="war">⚔ CLAN WAR</button><button class="command-tab bleed" data-view="bleed">🔴 BLEEDING</button></div><div class="command-status"><span class="command-bleed ok" data-bleed-status>⚪ Bleeding state: unknown</span><span>● LIVE SOURCE</span><span data-recent-changes>Recent: —</span></div>';
    hero.after(bar);
    bar.querySelectorAll('.command-tab').forEach((button) => button.addEventListener('click', () => {
      bar.querySelectorAll('.command-tab').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      applyFilter(button.dataset.view);
    }));
  }

  const potential = Object.values(state).filter((item) => Number(item?.delta || 0) < 0 && Date.now() - Number(item?.at || 0) <= REP_WINDOW).length;
  const status = bar.querySelector('[data-bleed-status]');
  if (status) {
    status.className = potential ? 'command-bleed' : 'command-bleed ok';
    status.textContent = potential ? `🔴 Potential bleed: ${potential}` : '⚪ Bleeding state: unknown';
  }

  const recent = feed.slice(0, 3).map((item) => `${item.clan} ${item.delta >= 0 ? '+' : '−'}${Math.abs(item.delta).toLocaleString('en-US')}`).join(' · ');
  const recentNode = bar.querySelector('[data-recent-changes]');
  if (recentNode) recentNode.textContent = recent ? `Recent: ${recent}` : 'Recent: —';
  applyFilter(bar.querySelector('.command-tab.active')?.dataset.view || 'all');
}

function addWatchButtons(rows) {
  const watched = read(WATCH_KEY, []);
  rows.forEach((row) => {
    const clan = clanName(row);
    const cell = row.children?.[0];
    if (!clan || !cell || row.dataset.nzWatchReady) return;
    row.dataset.nzWatchReady = 'true';
    const button = document.createElement('button');
    button.className = 'watch-button';
    button.type = 'button';
    button.title = 'Watch clan';
    button.textContent = watched.includes(clan) ? '★' : '☆';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const list = read(WATCH_KEY, []);
      const index = list.indexOf(clan);
      if (index >= 0) list.splice(index, 1); else list.push(clan);
      write(WATCH_KEY, list);
      button.textContent = list.includes(clan) ? '★' : '☆';
      applyFilter(document.querySelector('.command-tab.active')?.dataset.view || 'all');
    });
    cell.prepend(button);
  });
}

function addLastChange(rows, state) {
  rows.forEach((row) => {
    const clan = clanName(row);
    const cell = row.children?.[4];
    if (!clan || !cell) return;
    let label = cell.querySelector('.last-change');
    if (!label) {
      label = document.createElement('span');
      label.className = 'last-change';
      cell.appendChild(label);
    }
    const item = state[clan];
    if (!item?.at || !item?.delta) {
      label.textContent = '';
      return;
    }
    const seconds = Math.max(0, Math.floor((Date.now() - Number(item.at)) / 1000));
    label.textContent = `${item.delta >= 0 ? '+' : '−'}${Math.abs(Number(item.delta)).toLocaleString('en-US')} · ${seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`}`;
  });
}

function ensureFeed() {
  if (document.querySelector('[data-nz-feed]')) return;
  const section = document.querySelector('.table-wrap')?.closest('.section');
  if (!section) return;
  const feed = document.createElement('section');
  feed.className = 'nz-feed';
  feed.dataset.nzFeed = 'true';
  feed.innerHTML = '<div class="nz-feed-panel"><div class="nz-feed-head"><h3>⚡ LIVE FEED</h3><span>LAST 18 CHANGES</span></div><div class="nz-feed-list"></div></div><div class="nz-feed-panel"><div class="nz-feed-head"><h3>📈 TOP GAINERS</h3><span>LIVE GAIN</span></div><div class="nz-top-list"></div></div>';
  section.before(feed);
}

function renderFeed(rows, feed) {
  const root = document.querySelector('[data-nz-feed]');
  if (!root) return;
  const list = root.querySelector('.nz-feed-list');
  const top = root.querySelector('.nz-top-list');
  if (!list || !top) return;

  list.textContent = '';
  if (!feed.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Waiting for the first reputation change…';
    list.appendChild(empty);
  } else {
    feed.forEach((event) => {
      const item = document.createElement('div');
      item.className = 'nz-feed-item';
      const time = document.createElement('span');
      time.className = 'nz-feed-time';
      time.textContent = new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const clan = document.createElement('span');
      clan.className = 'nz-feed-clan';
      clan.textContent = event.clan;
      const value = document.createElement('span');
      value.className = `nz-feed-value ${event.delta >= 0 ? 'up' : 'down'}`;
      value.textContent = `${event.delta >= 0 ? '+' : '−'}${Math.abs(event.delta).toLocaleString('en-US')} REP`;
      item.append(time, clan, value);
      list.appendChild(item);
    });
  }

  top.textContent = '';
  rows.slice().sort((a, b) => cellNum(b, 5) - cellNum(a, 5)).slice(0, 5).forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'nz-top-item';
    const rank = document.createElement('span');
    rank.className = 'nz-top-rank';
    rank.textContent = `#${index + 1}`;
    const name = document.createElement('span');
    name.className = 'nz-top-name';
    name.textContent = clanName(row);
    const gain = document.createElement('span');
    gain.className = 'nz-top-gain';
    gain.textContent = `+${cellNum(row, 5).toLocaleString('en-US')}`;
    item.append(rank, name, gain);
    top.appendChild(item);
  });
}

function animateGains() {
  document.querySelectorAll('.gain,.total-gain').forEach((node) => {
    const row = node.closest('.table-row,.member-row,.podium');
    const key = `${clanName(row)}:${node.classList.contains('total-gain') ? 'total' : 'gain'}`;
    const value = num(node.textContent);
    const old = previous.get(key);
    previous.set(key, value);
    if (old === undefined || value <= old) return;
    node.classList.remove('nz-pop');
    void node.offsetWidth;
    node.classList.add('nz-pop');
    const parent = node.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.querySelector('.nz-rep-float')?.remove();
    const pop = document.createElement('span');
    pop.className = 'nz-rep-float';
    pop.textContent = `+${(value - old).toLocaleString('en-US')} REP`;
    parent.appendChild(pop);
    window.setTimeout(() => pop.remove(), 850);
  });
}

function enhance() {
  injectStyles();
  const tracker = document.querySelector('.tracker');
  const table = tracker?.querySelector('.table-wrap');
  if (!tracker || !table) return;
  cleanLegacy();
  const rows = getRows();
  if (!rows.length) return;
  const snapshot = capture(rows);
  ensureFeed();
  setupCommand(tracker, snapshot.state, snapshot.feed);
  addWatchButtons(rows);
  addLastChange(rows, snapshot.state);
  renderFeed(rows, snapshot.feed);
  animateGains();
}

export default function SiteEnhancements() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(enhance);
    };
    const interval = window.setInterval(run, 1500);
    run();
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
