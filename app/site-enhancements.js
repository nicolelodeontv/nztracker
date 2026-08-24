'use client';

import { useEffect } from 'react';

const WATCH_KEY = 'nztracker:watchlist:v1';
const REP_KEY = 'nztracker:command-rep:v1';
const REP_WINDOW = 10 * 60 * 1000;

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};
const text = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const num = (v) => Number(String(v || '').replace(/[^0-9.-]/g, '')) || 0;

const previousGain = new Map();

function installStyles() {
  if (document.querySelector('[data-command-center-style]')) return;
  const style = document.createElement('style');
  style.dataset.commandCenterStyle = 'true';
  style.textContent = `
    @keyframes nzGainPop{0%{transform:scale(1);opacity:.86}35%{transform:scale(1.18);opacity:1;text-shadow:0 0 12px rgba(93,229,173,.5)}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1;text-shadow:none}}
    @keyframes nzGainFloat{0%{transform:translateY(4px) scale(.9);opacity:0}18%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-24px) scale(1.03);opacity:0}}
    .gain.gain-pop,.total-gain.gain-pop{animation:nzGainPop .5s cubic-bezier(.2,.8,.2,1);transform-origin:left center}
    .nz-gain-float{position:absolute;left:0;top:-4px;z-index:50;pointer-events:none;color:#5de5ad;font:700 .72rem 'Space Mono',monospace;white-space:nowrap;text-shadow:0 0 11px rgba(93,229,173,.48);animation:nzGainFloat .82s cubic-bezier(.2,.75,.25,1) forwards}
    .command-center{display:grid;gap:8px;margin:8px 0 12px;padding:9px 10px;border:1px solid #1b2632;border-radius:12px;background:#080f17}
    .command-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .command-tab{height:32px;padding:0 11px;border:1px solid #26313d;border-radius:8px;background:#0a1119;color:#8794a6;font:700 .5rem 'Space Mono',monospace;cursor:pointer}
    .command-tab:hover,.command-tab.active{border-color:#315a70;color:#54d7ff;background:#0c1821}
    .command-tab.bleed.active{border-color:#7d3535;color:#ff9a9a;background:#1a0d0d}
    .command-status{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;color:#66758a;font:600 .47rem 'Space Mono',monospace}
    .command-bleed{display:flex;align-items:center;gap:6px;color:#ff9a9a}
    .command-bleed.ok{color:#7d8999}
    .command-changes{display:flex;gap:10px;flex-wrap:wrap;color:#9aa7b6}
    .command-change{white-space:nowrap}
    .command-change strong{color:#5de5ad}
    .potential-bleed-row{box-shadow:inset 3px 0 0 #ff6464;background:rgba(255,70,70,.025)!important}
    .recent-change-row .gain{position:relative}
    .last-change{display:block;margin-top:2px;color:#65758a;font:600 .4rem 'Space Mono',monospace}
    .settings-button{font-family:'Plus Jakarta Sans',system-ui,sans-serif}
  `;
  document.head.appendChild(style);
}

function cleanLabels() {
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

function removeAttackAnalytics(tracker) {
  [...tracker.querySelectorAll('.section')].forEach((section) => {
    if (text(section.querySelector('h2')?.textContent) === 'Attack Analytics') section.remove();
  });
}

function rowClan(row) {
  return text(row.children?.[1]?.querySelector('b')?.textContent || row.children?.[1]?.textContent);
}

function updateRepState(rows) {
  const state = read(REP_KEY, {});
  const now = Date.now();
  const recent = [];
  rows.forEach((row) => {
    const clan = rowClan(row);
    if (!clan) return;
    const rep = num(row.children?.[4]?.textContent);
    const prior = state[clan];
    if (prior && rep !== prior.rep) {
      const delta = rep - prior.rep;
      state[clan] = { rep, at: now, delta };
      recent.push({ clan, delta, at: now });
    } else if (!prior) {
      state[clan] = { rep, at: now, delta: 0 };
    }
  });
  Object.keys(state).forEach((clan) => {
    if (now - Number(state[clan]?.at || 0) > REP_WINDOW) delete state[clan];
  });
  write(REP_KEY, state);
  return state;
}

function addWatchlist(rows) {
  const watched = read(WATCH_KEY, []);
  rows.forEach((row) => {
    const clan = rowClan(row);
    if (!clan || row.dataset.watchReady) return;
    row.dataset.watchReady = '1';
    const cell = row.children[0];
    if (!cell) return;
    const star = document.createElement('button');
    star.className = 'watch-button';
    star.type = 'button';
    star.title = 'Watch clan';
    star.textContent = watched.includes(clan) ? '★' : '☆';
    star.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const list = read(WATCH_KEY, []);
      const index = list.indexOf(clan);
      if (index >= 0) list.splice(index, 1); else list.push(clan);
      write(WATCH_KEY, list);
      star.textContent = list.includes(clan) ? '★' : '☆';
      applyFilter(document.querySelector('.command-tab.active')?.dataset.view || 'all');
    });
    cell.prepend(star);
  });
}

function renderCommandCenter(rows) {
  const tracker = document.querySelector('.tracker');
  const hero = tracker?.querySelector('.hero');
  if (!tracker || !hero) return;

  let bar = tracker.querySelector('[data-command-center]');
  if (!bar) {
    bar = document.createElement('section');
    bar.className = 'command-center';
    bar.dataset.commandCenter = 'true';
    bar.innerHTML = `
      <div class="command-tabs">
        <button class="command-tab active" data-view="all">ALL</button>
        <button class="command-tab" data-view="watch">★ WATCHLIST</button>
        <button class="command-tab" data-view="war">⚔ CLAN WAR</button>
        <button class="command-tab bleed" data-view="bleed">🔴 BLEEDING</button>
      </div>
      <div class="command-status">
        <span class="command-bleed" data-bleed-status>🔴 Potential bleed: 0</span>
        <span data-freshness>Source checking…</span>
        <span class="command-changes" data-recent-changes>Recent changes: —</span>
      </div>`;
    hero.after(bar);
    bar.querySelectorAll('.command-tab').forEach((button) => {
      button.addEventListener('click', () => {
        bar.querySelectorAll('.command-tab').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        applyFilter(button.dataset.view);
      });
    });
  }

  const state = updateRepState(rows);
  const now = Date.now();
  const entries = Object.entries(state).filter(([, value]) => now - Number(value?.at || 0) <= REP_WINDOW);
  const potentialBleed = entries.filter(([, value]) => Number(value?.delta || 0) < 0);
  const bleed = bar.querySelector('[data-bleed-status]');
  if (bleed) {
    if (potentialBleed.length) {
      bleed.className = 'command-bleed';
      bleed.textContent = `🔴 Potential bleed: ${potentialBleed.length}`;
    } else {
      bleed.className = 'command-bleed ok';
      bleed.textContent = '⚪ Bleeding state: unknown';
    }
  }

  const updated = document.querySelector('.toolbar .eyebrow')?.textContent || '';
  const freshness = bar.querySelector('[data-freshness]');
  if (freshness) freshness.textContent = updated ? `● ${updated.replace(/^UPDATED\s*/i, 'Updated ')}` : '● Live source';

  const changes = potentialBleed.slice(0, 3).map(([clan, value]) => `<span class="command-change">${clan} <strong>−${Math.abs(Number(value.delta || 0)).toLocaleString('en-US')}</strong></span>`).join('');
  bar.querySelector('[data-recent-changes]').innerHTML = changes ? `Recent: ${changes}` : 'Recent changes: —';

  applyFilter(bar.querySelector('.command-tab.active')?.dataset.view || 'all');
}

function applyFilter(view) {
  const rows = [...document.querySelectorAll('.table-wrap .table-row')];
  const watched = read(WATCH_KEY, []);
  const state = read(REP_KEY, {});
  const ranked = rows.map((row) => ({ row, clan: rowClan(row), gain: num(row.children?.[5]?.textContent), rep: num(row.children?.[4]?.textContent) }));
  const topWar = new Set(ranked.sort((a, b) => b.gain - a.gain || b.rep - a.rep).slice(0, 6).map((item) => item.clan));

  rows.forEach((row) => {
    const clan = rowClan(row);
    const recentLoss = Number(state[clan]?.delta || 0) < 0 && Date.now() - Number(state[clan]?.at || 0) <= REP_WINDOW;
    row.classList.toggle('potential-bleed-row', recentLoss);
    row.style.display =
      view === 'watch' ? (watched.includes(clan) ? '' : 'none') :
      view === 'war' ? (topWar.has(clan) ? '' : 'none') :
      view === 'bleed' ? (recentLoss ? '' : 'none') : '';
  });

  const tab = document.querySelector('.command-tab.active');
  if (tab) tab.setAttribute('aria-pressed', 'true');
}

function animateGains() {
  document.querySelectorAll('.gain,.total-gain').forEach((node) => {
    const row = node.closest('.table-row,.member-row,.podium');
    const clan = text(row?.querySelector('.clan-cell b,.clan-name b')?.textContent);
    const member = text(row?.querySelector('b')?.textContent);
    const key = `${member || clan || row?.textContent || ''}:${node.classList.contains('total-gain') ? 'total' : 'gain'}`;
    const value = num(node.textContent);
    const old = previousGain.get(key);
    previousGain.set(key, value);
    if (old === undefined || value <= old) return;
    node.classList.remove('gain-pop');
    void node.offsetWidth;
    node.classList.add('gain-pop');
    window.setTimeout(() => node.classList.remove('gain-pop'), 540);
    const host = node.parentElement;
    if (!host) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.querySelectorAll('.nz-gain-float').forEach((el) => el.remove());
    const pop = document.createElement('span');
    pop.className = 'nz-gain-float';
    pop.textContent = `+${(value - old).toLocaleString('en-US')}`;
    host.appendChild(pop);
    window.setTimeout(() => pop.remove(), 850);
  });
}

function enhance() {
  installStyles();
  const tracker = document.querySelector('.tracker');
  const table = tracker?.querySelector('.table-wrap');
  if (!tracker || !table) return;
  removeAttackAnalytics(tracker);
  cleanLabels();
  const rows = [...table.querySelectorAll('.table-row')];
  addWatchlist(rows);
  renderCommandCenter(rows);
  animateGains();
}

export default function SiteEnhancements() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(enhance); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = setInterval(schedule, 1200);
    schedule();
    return () => { observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
