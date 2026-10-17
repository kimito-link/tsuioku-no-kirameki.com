/**
 * 会場モード(src/extension/venueBar.js)の【実ブラウザ・ランタイム監査】。
 *
 * 静的テストでは捕まらず、実ブラウザで測って初めて分かる類(hidden 属性が CSS の display に負ける・
 * 全面レイヤーがクリックを奪う・狭い幅でボタンが画面外へ出る・タイルのクリックが効かない 等)を網羅的に洗う。
 *
 * 使い方:
 *   node scripts/audit/runtime-venue-audit.mjs [--lv lv351612268] [--widths 420,640,900,1280] [--hwidths 1280,420]
 *                                              [--out scripts/audit/reports/runtime-venue-audit-2026-10-17] [--skip H,G]
 *
 * ★既存の拡張(extension/dist)を【そのまま】読み込む(build はしない)。一時プロファイルで起動するので端末の本物の Chrome には触れない。
 * ★項目ごとに独立 try/catch。1 項目の失敗で全体は止まらない。
 *
 * 監査項目:
 *  A hidden 属性なのに display が none でない要素   B 押せるはずなのに中心が覆われている要素
 *  C 画面外へはみ出す要素                           D 幅/高さ0なのに中身がある・opacity0/visibility:hidden のまま残る要素
 *  E パネル/ホバーカード/PICK UP/3キャラの重なり順    F 映像・再生ボタン・コメント入力欄へのクリック透過(退行検知)
 *  G 会場と popup(inline iframe) の同役割要素の computed style 差   H 全インタラクティブ要素の実クリック結果
 *  I console error / pageerror / 失敗リクエスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchWithExtension, enableAutoshow, sleep, shutdown, parseArgs, REPO_ROOT } from '../perf-ab/common.mjs';

const args = parseArgs();
const WIDTHS = String(args.widths || '420,640,900,1280').split(',').map(Number);
const H_WIDTHS = String(args.hwidths || '1280,420').split(',').map(Number);
const SKIP = new Set(String(args.skip || '').split(',').filter(Boolean));
const OUT_BASE = path.resolve(REPO_ROOT, String(args.out || 'scripts/audit/reports/runtime-venue-audit-2026-10-17'));
const H_CELL_CAP = Number(args.hcells || 30);
const H_POPUP_CAP = Number(args.hpopup || 40);

// ---------------------------------------------------------------------------------------------
// ページ側ヘルパー(page / popup iframe の両方へ注入する。関数本体を文字列化して evaluate する)
// ---------------------------------------------------------------------------------------------
function installHelpers() {
  const A = (window.__aud = {});
  const clsOf = (e) => (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '');
  const r4 = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  A.r4 = r4;
  A.sel = (e) => {
    if (!e || !e.tagName) return String(e);
    const parts = [];
    let c = e;
    for (let i = 0; c && c.nodeType === 1 && i < 4; i += 1) {
      let s = c.tagName.toLowerCase();
      if (c.id) s += '#' + c.id;
      const cl = clsOf(c).trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cl.length) s += '.' + cl.join('.');
      const ln = c.getAttribute && c.getAttribute('data-lane-name');
      if (ln) s += '[lane=' + ln + ']';
      parts.unshift(s);
      if (c.id || (c.classList && c.classList.contains('nlsb-root'))) break;
      c = c.parentElement;
    }
    return parts.join(' > ');
  };
  const txt = (e, n = 24) => String(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);
  A.txt = txt;
  const effOpacity = (e) => {
    let o = 1;
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity);
    return o;
  };
  A.effOpacity = effOpacity;
  const ancestorHidden = (e) => {
    for (let a = e.parentElement; a; a = a.parentElement) {
      if (getComputedStyle(a).display === 'none') return true;
    }
    return false;
  };
  const CLIPPY = /(hidden|auto|scroll|clip)/;
  // 祖先の overflow で切り取られた後の【見える矩形】[L,T,R,B]
  const clip = (e) => {
    const r = e.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (!CLIPPY.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      if (CLIPPY.test(cs.overflowX)) { L = Math.max(L, ar.left); R = Math.min(R, ar.right); }
      if (CLIPPY.test(cs.overflowY)) { T = Math.max(T, ar.top); B = Math.min(B, ar.bottom); }
    }
    return [L, T, R, B];
  };
  A.clip = clip;
  A.roots = (sels) => sels.flatMap((s) => [...document.querySelectorAll(s)]);
  A.all = (sels) => {
    const out = [];
    for (const r of A.roots(sels)) { out.push(r); out.push(...r.querySelectorAll('*')); }
    return out;
  };
  const vp = () => ({ vw: document.documentElement.clientWidth, vh: window.innerHeight });
  A.vp = vp;

  // ---- A: hidden 属性なのに display:none でない
  A.itemA = (sels) => {
    const out = [];
    for (const e of A.all(sels)) {
      if (!e.hasAttribute || !e.hasAttribute('hidden')) continue;
      if (e.getAttribute('hidden') === 'until-found') continue;
      const cs = getComputedStyle(e);
      if (cs.display !== 'none') {
        const c = clip(e);
        const shown = c[2] > c[0] + 1 && c[3] > c[1] + 1 && effOpacity(e) > 0.02 && cs.visibility !== 'hidden';
        out.push({ sel: A.sel(e), display: cs.display, rect: r4(e.getBoundingClientRect()), text: txt(e, 30), visibility: cs.visibility, opacity: cs.opacity, reallyVisible: shown });
      }
    }
    return out;
  };

  const CLICKABLE = 'button, a[href], [role="button"], [role="link"], [role="tab"], summary, input:not([type="hidden"]), select, textarea, [onclick], [tabindex]:not([tabindex="-1"])';
  A.clickables = (sels) => {
    const set = new Set();
    for (const e of A.all(sels)) {
      if (e.matches && e.matches(CLICKABLE)) { set.add(e); continue; }
      // nlsb-* で cursor:pointer を自前宣言している箱(最上位だけ)
      if (e.nodeType === 1 && /nlsb-|nl-story-/.test(clsOf(e))) {
        const cs = getComputedStyle(e);
        if (cs.cursor === 'pointer' && e.parentElement && getComputedStyle(e.parentElement).cursor !== 'pointer') set.add(e);
      }
    }
    return [...set];
  };

  // ---- B: 押せるはずの要素の中心を elementFromPoint
  A.itemB = (sels) => {
    const { vw, vh } = vp();
    const res = { total: 0, ok: 0, scrollClipped: 0, hiddenSkipped: 0, offscreen: [], covered: [], ptrNone: [] };
    for (const e of A.clickables(sels)) {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0 || effOpacity(e) < 0.05 || ancestorHidden(e)) { res.hiddenSkipped += 1; continue; }
      res.total += 1;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const base = { sel: A.sel(e), text: txt(e, 14), rect: r4(r) };
      if (cs.pointerEvents === 'none') { res.ptrNone.push(base); continue; }
      const c = clip(e);
      if (c[2] <= c[0] || c[3] <= c[1] || cx < c[0] || cx > c[2] || cy < c[1] || cy > c[3]) { res.scrollClipped += 1; continue; }
      if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) { res.offscreen.push({ ...base, center: [Math.round(cx), Math.round(cy)], vw }); continue; }
      const hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === e || e.contains(hit))) { res.ok += 1; continue; }
      // 中心はダメでも端が押せるか(部分遮蔽)
      let partial = 0;
      for (const [fx, fy] of [[0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
        const h2 = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (h2 && (h2 === e || e.contains(h2))) partial += 1;
      }
      res.covered.push({ ...base, center: [Math.round(cx), Math.round(cy)], coveredBy: hit ? A.sel(hit) : 'null', coverPE: hit ? getComputedStyle(hit).pointerEvents : '', partialHits: partial });
    }
    return res;
  };

  // ---- C: 画面外へはみ出す
  A.itemC = (sels) => {
    const { vw, vh } = vp();
    const res = { vw, vh, docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth, bodyScrollW: document.body ? document.body.scrollWidth : 0, hOverflow: [], vOverflow: [], boxOverflow: [] };
    const reported = new Set();
    for (const e of A.all(sels)) {
      if (e.nodeType !== 1) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      let anc = e.parentElement, skip = false;
      while (anc) { if (reported.has(anc)) { skip = true; break; } anc = anc.parentElement; }
      if (skip) continue;
      const c = clip(e);
      if (c[2] <= c[0] || c[3] <= c[1]) continue; // 完全に切り取られている=見えない
      const tol = 1;
      if (c[2] > vw + tol || c[0] < -tol) {
        res.hOverflow.push({ sel: A.sel(e), text: txt(e, 14), rect: r4(r), visL: Math.round(c[0]), visR: Math.round(c[2]), vw });
        reported.add(e);
      } else if (c[3] > vh + tol || c[1] < -tol) {
        res.vOverflow.push({ sel: A.sel(e), text: txt(e, 14), rect: r4(r), visT: Math.round(c[1]), visB: Math.round(c[3]), vh });
        reported.add(e);
      }
    }
    for (const e of A.all(sels)) {
      if (e.nodeType !== 1) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.display === 'inline' || cs.display === 'contents') continue;
      if (cs.overflowX === 'visible' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2) {
        res.boxOverflow.push({ sel: A.sel(e), clientW: e.clientWidth, scrollW: e.scrollWidth, text: txt(e, 14) });
      }
    }
    return res;
  };

  // ---- D: 幅0/高さ0なのに中身がある・opacity0/visibility:hidden のまま残る
  A.itemD = (sels) => {
    const res = { zeroSizeWithContent: [], opacity0: [], visHidden: [], visLeak: [] };
    for (const e of A.all(sels)) {
      if (e.nodeType !== 1 || e.hasAttribute('hidden')) continue;
      const tag = e.tagName.toLowerCase();
      if (/^(script|style|link|meta|noscript|template|head|title|br|wbr|svg|path|g|defs|use|canvas)$/.test(tag)) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.display === 'contents' || ancestorHidden(e)) continue;
      const r = e.getBoundingClientRect();
      const text = txt(e, 30);
      const hasInteractive = !!e.querySelector('button, a[href], input, img[src]') || e.matches(CLICKABLE);
      if ((r.width === 0 || r.height === 0) && (text || hasInteractive)) {
        const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        res.zeroSizeWithContent.push({ sel: A.sel(e), rect: r4(r), text, ownText: own, overflow: cs.overflow, pos: cs.position });
      }
      const parentOp = e.parentElement ? effOpacity(e.parentElement) : 1;
      if (cs.opacity === '0' && parentOp > 0 && (text || hasInteractive || e.children.length)) {
        res.opacity0.push({ sel: A.sel(e), text, rect: r4(r), pe: cs.pointerEvents, anim: cs.animationName !== 'none', trans: parseFloat(cs.transitionDuration) > 0, blocksClicks: cs.pointerEvents !== 'none' && r.width > 0 && r.height > 0 });
      }
      const pv = e.parentElement ? getComputedStyle(e.parentElement).visibility : 'visible';
      // 親が visibility:hidden なのに自分が visible(明示上書き)で描画され続けている = 「隠したつもり」の漏れ
      if (cs.visibility === 'visible' && pv === 'hidden' && r.width > 0 && r.height > 0) {
        res.visLeak.push({ sel: A.sel(e), rect: r4(r), parentSel: A.sel(e.parentElement), inlineVisibility: e.style && e.style.visibility, tag });
      }
      if (cs.visibility === 'hidden' && pv !== 'hidden' && (text || hasInteractive)) {
        res.visHidden.push({ sel: A.sel(e), text, rect: r4(r), pe: cs.pointerEvents });
      }
    }
    return res;
  };

  // ---- E/F: 点のヒット判定
  A.hitAt = (x, y) => {
    const h = document.elementFromPoint(x, y);
    if (!h) return { sel: 'null', inRoot: false };
    return { sel: A.sel(h), inRoot: !!h.closest('.nlsb-root, #nls-inline-popup-host'), ui: !!h.closest('a, button, [role="button"], .nlsb-roster-panel, .nlsb-hover-card, .nlsb-pickup') };
  };
  const stackInfo = (e) => {
    const cs = getComputedStyle(e);
    let anc = null;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const c2 = getComputedStyle(a);
      if ((c2.zIndex !== 'auto' && c2.position !== 'static') || c2.opacity !== '1' || c2.transform !== 'none' || c2.isolation === 'isolate') { anc = A.sel(a) + ' z=' + c2.zIndex; break; }
    }
    return { z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, stackAnc: anc };
  };
  const PANEL_SEL = ['.nlsb-roster-panel', '.nlsb-hover-card'];
  A.layers = (defs) => {
    // defs: [[name, selector]]
    const out = [];
    for (const [name, selr] of defs) {
      let kept = 0;
      for (const e of document.querySelectorAll(selr)) {
        if (kept >= 6) break;
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 1 || r.height <= 1 || effOpacity(e) < 0.05) continue;
        const { vw, vh } = vp();
        const clipR = clip(e);
        const pts = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh && x >= clipR[0] && x <= clipR[2] && y >= clipR[1] && y <= clipR[3]);
        if (!pts.length) continue;
        const hits = pts.map(([x, y]) => {
          const h = document.elementFromPoint(x, y);
          const own = !!h && (h === e || e.contains(h));
          let other = null;
          if (!own && h) { const p = h.closest(PANEL_SEL.join(',')); other = p ? 'PANEL:' + A.sel(p) : 'OTHER:' + A.sel(h); }
          return { pt: [Math.round(x), Math.round(y)], own, other };
        });
        kept += 1;
        const peNone = cs.pointerEvents === 'none';
        out.push({ name, sel: A.sel(e), rect: r4(r), peNone, ...stackInfo(e), nPts: pts.length, ownHits: hits.filter((h) => h.own).length, centerOwn: hits[0] ? hits[0].own : null, occluders: peNone ? [] : [...new Set(hits.filter((h) => !h.own).map((h) => h.other))] });
      }
    }
    return out;
  };

  // ---- F: クリック透過
  A.itemF = () => {
    const { vw, vh } = vp();
    const groups = {
      video: ['video', '[class*="player-display"]', '[class*="video-layer"]'],
      playButton: ['[class*="play-button"]', 'button[aria-label*="再生"]', 'button[aria-label*="一時停止"]', '[class*="PlayerController"] button', '[class*="player-controller"] button'],
      commentInput: ['textarea:not(.nlsb-root *)', 'input[type="text"][placeholder*="コメント"]', '[class*="comment-form"] textarea', '[class*="comment-input"]', '[contenteditable="true"]:not(.nlsb-root *)']
    };
    const out = [];
    for (const [g, list] of Object.entries(groups)) {
      let el = null, used = '';
      for (const s of list) {
        for (const c of document.querySelectorAll(s)) {
          if (c.closest('.nlsb-root, #nls-inline-popup-host')) continue;
          const r = c.getBoundingClientRect();
          if (r.width > 8 && r.height > 8 && getComputedStyle(c).visibility !== 'hidden') { el = c; used = s; break; }
        }
        if (el) break;
      }
      if (!el) { out.push({ group: g, found: false }); continue; }
      let r = el.getBoundingClientRect();
      let scrolled = false;
      const sx = window.scrollX, sy = window.scrollY;
      if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); r = el.getBoundingClientRect(); scrolled = true; }
      const fr = g === 'video' ? [[0.5, 0.5], [0.5, 0.33], [0.2, 0.5], [0.8, 0.5]] : g === 'commentInput' ? [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5]] : [[0.5, 0.5]];
      const hits = fr.map(([fx, fy]) => {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x >= vw || y >= vh) return { pt: [Math.round(x), Math.round(y)], offscreen: true };
        const h = A.hitAt(x, y);
        return { pt: [Math.round(x), Math.round(y)], hit: h.sel, inRoot: h.inRoot, venueUi: h.ui, isTarget: (() => { const hh = document.elementFromPoint(x, y); return !!hh && (hh === el || el.contains(hh) || hh.contains(el)); })() };
      });
      out.push({ group: g, found: true, target: A.sel(el), via: used, rect: r4(r), scrolled, hits, passThrough: hits.every((h) => h.offscreen || !h.inRoot), containerBlocks: hits.some((h) => h.inRoot && !h.venueUi) });
      if (scrolled) window.scrollTo(sx, sy);
    }
    return out;
  };

  // ---- G: computed style
  A.styles = (e, props) => {
    const cs = getComputedStyle(e);
    const o = {};
    for (const p of props) o[p] = cs[p];
    o.__rect = r4(e.getBoundingClientRect());
    return o;
  };

  // ---- H: 状態の署名
  A.venueSig = () => {
    const root = document.querySelector('.nlsb-root');
    const pan = root ? ['.nlsb-roster-panel', '.nlsb-hover-card', '.nlsb-pickup'].map((s) => [...root.querySelectorAll(s)].map((p) => (p.hidden ? 'H' : 'S') + getComputedStyle(p).display + ':' + String(p.innerText || '').slice(0, 50)).join('|')) : [];
    return JSON.stringify([
      document.documentElement.classList.contains('nlsb-venue-open'),
      root && root.className,
      pan,
      root ? [...root.querySelectorAll('.nlsb-comeview-btn')].map((b) => b.textContent.trim() + (b.className.includes('is-on') ? '+' : '')) : [],
      root ? root.querySelectorAll('.is-on,.is-active,.active,.selected,[aria-pressed="true"],[aria-expanded="true"]').length : 0,
      location.href
    ]);
  };
  A.frameSig = (el) => {
    const chain = [];
    for (let a = el, i = 0; a && i < 3; a = a.parentElement, i += 1) chain.push(clsOf(a) + '|' + (a.getAttribute('aria-expanded') || '') + (a.getAttribute('aria-pressed') || '') + (a.hidden ? 'H' : ''));
    return JSON.stringify([
      chain,
      document.querySelectorAll('[hidden]').length,
      document.querySelectorAll('[aria-expanded="true"],[aria-pressed="true"],.is-on,.is-active,.active,[open],dialog[open],[role="dialog"]').length,
      document.activeElement && A.sel(document.activeElement),
      String(el.textContent || '').trim().slice(0, 20),
      el.disabled || false
    ]);
  };
}
const HELPERS_SRC = `(${installHelpers.toString()})()`;

// ---------------------------------------------------------------------------------------------
// Node 側
// ---------------------------------------------------------------------------------------------
const results = { meta: { startedAt: new Date().toISOString(), widths: WIDTHS, hWidths: H_WIDTHS, extDist: 'extension/dist(既存のまま)' }, perWidth: {}, G: null, H: {}, I: null, errors: [] };
const logs = { console: [], pageerror: [], requestfailed: [], http: [] };
let phase = 'boot';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    const msg = String((e && e.message) || e).split('\n')[0].slice(0, 300);
    results.errors.push({ item: name, error: msg });
    log('!! item failed', name, msg);
    return { error: msg };
  }
}

async function pickLive(preferred) {
  const now = Math.floor(Date.now() / 1000);
  const check = async (lv) => {
    try {
      const res = await fetch(`https://live.nicovideo.jp/watch/${lv}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const h = await res.text();
      const on = /status&quot;:&quot;ON_AIR/.test(h);
      const m = h.match(/&quot;endTime&quot;:(\d+)/);
      const left = m ? Math.floor((Number(m[1]) - now) / 60) : -1;
      return on && left > 45 ? left : 0;
    } catch { return 0; }
  };
  if (preferred && (await check(preferred))) return preferred;
  const res = await fetch('https://live.nicovideo.jp/ranking', { headers: { 'user-agent': 'Mozilla/5.0' } });
  const lvs = [...new Set([...(await res.text()).matchAll(/watch\/(lv\d+)/g)].map((m) => m[1]))].slice(0, 40);
  for (const lv of lvs) if (await check(lv)) return lv;
  throw new Error('放送中の lv が見つからない');
}

async function main() {
  const lv = await pickLive(args.lv || 'lv351612268');
  results.meta.lv = lv;
  log('live', lv);
  const { ctx, sw, extId, userDataDir } = await launchWithExtension({});
  results.meta.extId = extId;
  const extraPages = [];
  const downloads = [];
  ctx.on('page', (p) => extraPages.push(p));
  try {
    await enableAutoshow(sw, true);
    const page = await ctx.newPage();
    globalThis.__pageRef = page;
    const cdp = await ctx.newCDPSession(page);
    const tag = () => phase;
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.console.push({ phase: tag(), type: m.type(), text: m.text().slice(0, 300), loc: (m.location() && m.location().url || '').slice(0, 120) }); });
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    page.on('pageerror', (e) => logs.pageerror.push({ phase: tag(), text: String(e.message || e).slice(0, 300) }));
    page.on('requestfailed', (r) => logs.requestfailed.push({ phase: tag(), url: r.url().slice(0, 160), err: (r.failure() && r.failure().errorText) || '' }));
    page.on('response', (r) => { if (r.status() >= 400) logs.http.push({ phase: tag(), status: r.status(), url: r.url().slice(0, 160) }); });
    sw.on('console', (m) => { if (m.type() === 'error') logs.console.push({ phase: 'sw', type: 'error', text: m.text().slice(0, 300), loc: 'service-worker' }); });

    const setWidth = async (w) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(2000);
    };
    await setWidth(1280);
    page.goto(`https://live.nicovideo.jp/watch/${lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(25000);
    await page.waitForSelector('.nlsb-toggle', { state: 'attached', timeout: 40000 });

    const inject = async () => { await page.evaluate(HELPERS_SRC); const f = popupFrame(); if (f) await f.evaluate(HELPERS_SRC).catch(() => {}); };
    const popupFrame = () => page.frames().find((f) => f.url().includes('popup.html'));
    const isOpen = () => page.evaluate(() => document.documentElement.classList.contains('nlsb-venue-open'));
    const openVenue = async () => {
      if (!(await isOpen())) await page.evaluate(() => document.querySelector('.nlsb-toggle') && document.querySelector('.nlsb-toggle').click());
      await page.waitForSelector('.nlsb-root.nlsb-is-open', { timeout: 20000 }).catch(() => {});
      await sleep(4000);
      await inject();
    };
    const closeVenue = async () => {
      if (await isOpen()) {
        await page.evaluate(() => { const b = document.querySelector('.nlsb-close-btn'); if (b) b.click(); });
        await sleep(2500);
      }
      if (await isOpen()) { await page.keyboard.press('Escape'); await sleep(1500); }
    };
    const closeExtraPages = async () => {
      const closed = [];
      for (const p of ctx.pages()) {
        if (p === page) continue;
        closed.push((p.url() || '').slice(0, 140));
        await p.close().catch(() => {});
      }
      return closed;
    };
    const VENUE_ROOTS = ['.nlsb-root', '#nls-inline-popup-host'];
    const evalPage = (name, argv) => page.evaluate(([n, a]) => window.__aud[n](...a), [name, argv]);
    const evalFrame = async (name, argv) => { const f = popupFrame(); if (!f) return { error: 'popup frame なし' }; return f.evaluate(([n, a]) => window.__aud[n](...a), [name, argv]); };

    // popup iframe の中のボタンが親ページ側で覆われていないか(親ページ座標で elementFromPoint)
    const popupOuterCover = async () => {
      const f = popupFrame();
      if (!f) return { error: 'no frame' };
      const pts = await f.evaluate(() => {
        const A = window.__aud;
        const { vw, vh } = A.vp();
        return A.clickables(['body']).map((e) => {
          const cs = getComputedStyle(e), r = e.getBoundingClientRect();
          if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0 || A.effOpacity(e) < 0.05) return null;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const c = A.clip(e);
          if (cx < c[0] || cx > c[2] || cy < c[1] || cy > c[3] || cx < 0 || cy < 0 || cx >= vw || cy >= vh) return null;
          const inner = document.elementFromPoint(cx, cy);
          if (!(inner && (inner === e || e.contains(inner)))) return null; // 内側の覆いは B で扱う
          return { sel: A.sel(e), text: A.txt(e, 12), cx, cy };
        }).filter(Boolean);
      });
      return page.evaluate((p) => {
        const A = window.__aud;
        const ifr = document.querySelector('#nls-inline-popup-iframe');
        if (!ifr) return { error: 'iframe なし' };
        const ir = ifr.getBoundingClientRect();
        const vw = document.documentElement.clientWidth, vh = window.innerHeight;
        const res = { iframeRect: A.r4(ir), checked: 0, needsScroll: 0, covered: [] };
        for (const q of p.pts) {
          const x = ir.left + q.cx, y = ir.top + q.cy;
          if (x < 0 || y < 0 || x >= vw || y >= vh) { res.needsScroll += 1; continue; }
          res.checked += 1;
          const h = document.elementFromPoint(x, y);
          if (h !== ifr) res.covered.push({ ...q, pagePt: [Math.round(x), Math.round(y)], coveredBy: h ? A.sel(h) : 'null' });
        }
        return res;
      }, { pts });
    };

    // ============================ 幅ごとの監査 ============================
    for (const w of WIDTHS) {
      const W = (results.perWidth[w] = {});
      phase = `w${w}`;
      log('== width', w);
      await safe(`setup@${w}`, async () => { await closeVenue(); await setWidth(w); await inject(); });
      // 会場を閉じた基準(F のベースラインと C のベースライン)
      W.baselineClosed = await safe(`baseline@${w}`, async () => ({
        F: await evalPage('itemF', []),
        C: (await evalPage('itemC', [['#nls-inline-popup-host']])).docScrollW + '/' + (await evalPage('vp', [])).vw
      }));
      await safe(`open@${w}`, openVenue);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      W.venueOpen = await safe(`openstate@${w}`, isOpen);

      if (!SKIP.has('A')) W.A = await safe(`A@${w}`, async () => ({ venue: await evalPage('itemA', [VENUE_ROOTS]), popup: await evalFrame('itemA', [['body']]) }));
      if (!SKIP.has('B')) W.B = await safe(`B@${w}`, async () => ({ venue: await evalPage('itemB', [['.nlsb-root']]), popupInner: await evalFrame('itemB', [['body']]), popupOuter: await popupOuterCover() }));
      if (!SKIP.has('C')) W.C = await safe(`C@${w}`, async () => ({ venue: await evalPage('itemC', [VENUE_ROOTS]), popup: await evalFrame('itemC', [['body']]) }));
      if (!SKIP.has('D')) W.D = await safe(`D@${w}`, async () => ({ venue: await evalPage('itemD', [['.nlsb-root', '#nls-inline-popup-host']]), popup: await evalFrame('itemD', [['body']]) }));
      if (!SKIP.has('F')) W.F = await safe(`F@${w}`, async () => evalPage('itemF', []));
      if (!SKIP.has('G') && w === Math.max(...WIDTHS)) results.G = await safe('G', () => itemG(evalPage, evalFrame));

      // ---- E: パネルを順に開いて重なり順を測る
      if (!SKIP.has('E')) {
        W.E = await safe(`E@${w}`, async () => {
          const stages = {};
          const DEFS = [['roster-panel', '.nlsb-roster-panel'], ['hover-card', '.nlsb-hover-card'], ['pickup', '.nlsb-pickup'], ['character', '.nlcl-chara'], ['header', '.nlsb-header'], ['toggle', '.nlsb-toggle'], ['gift-proj', '.nlsb-gift-proj'], ['cheer-badge', '.nlcl-cheer-badge'], ['seat-tile-first', '.nlsb-root .nl-story-userlane-cell']];
          const snap = async (name) => { stages[name] = await evalPage('layers', [DEFS]); };
          await snap('base');
          const clickBtn = (t) => page.evaluate((tt) => { const b = [...document.querySelectorAll('.nlsb-root .nlsb-comeview-btn')].find((x) => x.textContent.includes(tt)); if (b) b.click(); return !!b; }, t);
          stages._clickRoster = await clickBtn('一覧'); await sleep(1500); await snap('roster');
          stages.rosterOnlyHeaderB = await evalPage('itemB', [['.nlsb-header']]); // 一覧パネルだけ開いた状態でヘッダーボタンが押せるか
          stages._clickDiag = await clickBtn('状態'); await sleep(1500); await snap('roster+diag');
          // 席のあるタイル → 発言パネル(実マウス)
          const tile = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth, vh = window.innerHeight;
            for (const a of document.querySelectorAll('.nlsb-root .nl-story-userlane-cell--linkable, .nlsb-root a.nl-story-userlane-cell')) {
              const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
              if (r.width > 4 && x > 0 && y > 0 && x < vw && y < vh) { const h = document.elementFromPoint(x, y); if (h && (h === a || a.contains(h))) return [x, y]; }
            }
            return null;
          });
          stages._tile = tile;
          if (tile) { await page.mouse.move(tile[0], tile[1]); await sleep(900); await snap('hover'); await page.mouse.click(tile[0], tile[1]); await sleep(2500); stages._extraTabsAfterTileClick = await closeExtraPages(); await snap('roster+diag+speech+hover'); }
          await page.mouse.move(2, 2);
          // 3パネル開いた状態で A〜D を再測
          stages.panelsOpen = {
            A: { venue: await evalPage('itemA', [VENUE_ROOTS]) },
            B: { venue: await evalPage('itemB', [['.nlsb-root']]) },
            C: { venue: await evalPage('itemC', [VENUE_ROOTS]) },
            D: { venue: await evalPage('itemD', [['.nlsb-root', '#nls-inline-popup-host']]) }
          };
          return stages;
        });
      }
      await safe(`shot@${w}`, async () => page.screenshot({ path: `${OUT_BASE}-w${w}.png` }));
      await closeExtraPages();
    }

    // ============================ H: 全インタラクティブ要素を実クリック ============================
    if (!SKIP.has('H')) {
      for (const w of H_WIDTHS) {
        phase = `H${w}`;
        log('== H width', w);
        results.H[w] = await safe(`H@${w}`, async () => {
          await enableAutoshow(sw, true); // autoshow は 1 回きりで 15 秒後に解除される(content-entry.js:4852)ので、再読込の前に入れ直す
          await page.goto(`https://live.nicovideo.jp/watch/${lv}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
          await sleep(25000);
          await page.waitForSelector('.nlsb-toggle', { state: 'attached', timeout: 40000 });
          await setWidth(w); await openVenue();
          return itemH(page, ctx, { evalPage, popupFrame, openVenue, closeExtraPages, inject, lv, setWidth, w, downloads });
        });
      }
    }
    phase = 'end';
    const isExt = (u) => /chrome-extension:/.test(u);
    const isNicoImg = (u) => /nimg\.jp|nicovideo\.jp/.test(u);
    results.I = {
      console: dedupe(logs.console), pageerror: dedupe(logs.pageerror),
      requestfailedExt: dedupe(logs.requestfailed.filter((x) => isExt(x.url))),
      requestfailedNico: dedupe(logs.requestfailed.filter((x) => !isExt(x.url) && isNicoImg(x.url) && !/ERR_ABORTED/.test(x.err))),
      requestfailedThirdPartyCount: logs.requestfailed.filter((x) => !isExt(x.url) && !isNicoImg(x.url)).length,
      requestfailedAbortedNico: logs.requestfailed.filter((x) => isNicoImg(x.url) && /ERR_ABORTED/.test(x.err)).length,
      httpExt: dedupe(logs.http.filter((x) => isExt(x.url))),
      http: dedupe(logs.http.filter((x) => !isExt(x.url)))
    };
  } finally {
    await shutdown(ctx, userDataDir).catch(() => {});
  }
}

function dedupe(arr) {
  const m = new Map();
  for (const x of arr) {
    const k = JSON.stringify({ ...x, phase: undefined });
    const e = m.get(k) || { ...x, count: 0, phases: new Set() };
    e.count += 1; e.phases.add(x.phase); m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, phases: [...e.phases].join(',') })).sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------------------------
// G: 会場 vs popup の computed style 比較
// ---------------------------------------------------------------------------------------------
const G_PROPS = ['display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'padding', 'margin', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'width', 'height', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'overflowX', 'overflowY', 'position', 'opacity', 'boxSizing'];
const VIEWPORT_DEP = new Set(['width', 'height', 'gridTemplateColumns']);
const PAINT_PROPS = new Set(['color', 'backgroundColor', 'borderTopColor', 'lineHeight']);
async function itemG(evalPage, evalFrame) {
  // 役割ごとの探し方(会場 / popup)。関数本体は page 側で評価するので文字列で渡す。
  const finder = (kind, lane, part) => `(() => {
    const isV = ${kind === 'v'};
    const laneEl = isV ? document.querySelector('.nlsb-root .nl-story-userlane[data-lane-name="${lane}"]') : document.querySelector('.nl-story-userlane--${lane}');
    if (!laneEl) return null;
    const wrap = laneEl.closest('.nl-story-userlane-tier-wrap');
    const parts = {
      lane: laneEl,
      tierWrap: wrap,
      guide: wrap ? wrap.querySelector('.nl-story-userlane-guide') : null,
      cell: laneEl.querySelector('.nl-story-userlane-cell'),
      avatar: laneEl.querySelector('.nl-story-userlane-cell .nl-story-userlane-avatar'),
      meta: laneEl.querySelector('.nl-story-userlane-cell .nl-story-userlane-meta'),
      name: laneEl.querySelector('.nl-story-userlane-cell .nl-story-userlane-meta__name'),
      id: laneEl.querySelector('.nl-story-userlane-cell .nl-story-userlane-meta__id')
    };
    return parts['${part}'];
  })()`;
  const roles = [];
  for (const lane of ['link', 'gift', 'ad', 'konta', 'tanu']) for (const part of ['lane', 'tierWrap', 'guide', 'cell', 'avatar', 'name', 'id']) roles.push({ role: `${lane}/${part}`, lane, part });
  const out = { diffs: [], same: 0, missing: [], samples: {} };
  const grab = async (where, code) => {
    const fn = `(() => { const el = ${code}; return el ? window.__aud.styles(el, ${JSON.stringify(G_PROPS)}) : null; })()`;
    return where === 'v' ? evalPageRaw(evalPage, fn) : evalFrameRaw(evalFrame, fn);
  };
  for (const r of roles) {
    const v = await grab('v', finder('v', r.lane, r.part));
    const p = await grab('p', finder('p', r.lane, r.part));
    if (!v || !p) { out.missing.push({ role: r.role, venue: !!v, popup: !!p }); continue; }
    out.samples[r.role] = { venue: v.__rect, popup: p.__rect };
    for (const k of G_PROPS) {
      if (v[k] === p[k]) { out.same += 1; continue; }
      out.diffs.push({ role: r.role, prop: k, venue: v[k], popup: p[k], kind: VIEWPORT_DEP.has(k) ? 'viewport-dependent' : PAINT_PROPS.has(k) ? 'paint' : 'CHECK' });
    }
  }
  // PICK UP: popup 側はクラスが無いので文言から探す
  const pv = await grab('v', `document.querySelector('.nlsb-root .nlsb-pickup')`);
  const pp = await grab('p', `(() => { let best = null; for (const e of document.querySelectorAll('body *')) { if (/PICK\\s*UP/i.test(e.textContent || '') && e.children.length < 8 && !/script|style/i.test(e.tagName)) best = e; } return best; })()`);
  if (pv && pp) for (const k of G_PROPS) { if (pv[k] !== pp[k]) out.diffs.push({ role: 'pickup(popup は文言ヒットの最内側)', prop: k, venue: pv[k], popup: pp[k], kind: VIEWPORT_DEP.has(k) ? 'viewport-dependent' : 'CHECK' }); }
  else out.missing.push({ role: 'pickup', venue: !!pv, popup: !!pp });
  return out;
}
const evalPageRaw = (evalPage, code) => globalThis.__pageRef.evaluate(code);
const evalFrameRaw = (evalFrame, code) => { const f = globalThis.__pageRef.frames().find((x) => x.url().includes('popup.html')); return f ? f.evaluate(code) : null; };

// ---------------------------------------------------------------------------------------------
// H: 全インタラクティブ要素を実際にクリック
// ---------------------------------------------------------------------------------------------
const NAV_OK_HOST = /(^|\.)nicovideo\.jp$|(^|\.)nimg\.jp$|^chrome-extension$/;
const DANGER_TEXT = /消去|削除|クリア|リセット|全消|delete|clear|reset|エクスポート|ダウンロード|export|download|ログアウト|logout|同期|送信|投稿|コメント送信/i;
async function itemH(page, ctx, env) {
  const { popupFrame, openVenue, closeExtraPages, lv, setWidth, w, downloads } = env;
  const res = { width: w, venue: [], popup: [], skippedExternal: [], notes: [] };
  const dl0 = () => downloads.length;
  // ---- popup(inline iframe)側を先に(別窓化でインラインが外れる前に)
  // inline popup の iframe が実寸を持つまで待つ(再読込直後に会場を開くと 0x0 のままになることがある=それ自体も記録)
  const iframeW = () => page.evaluate(() => { const f = document.querySelector('#nls-inline-popup-iframe'); const r = f && f.getBoundingClientRect(); return r ? Math.round(r.width) + 'x' + Math.round(r.height) : 'none'; }).catch(() => 'err');
  res.popupIframeAfterOpen = await iframeW();
  for (let t = 0; t < 8 && /^0x|x0$|none/.test(await iframeW()); t += 1) await sleep(2000);
  res.popupIframeAfterWait = await iframeW();
  res.notes.push(`popup iframe size: afterOpen=${res.popupIframeAfterOpen} afterWait=${res.popupIframeAfterWait}`);
  const f0 = popupFrame();
  if (f0) {
    await f0.evaluate((cap) => {
      document.querySelectorAll('[data-aud-h]').forEach((e) => e.removeAttribute('data-aud-h'));
      const A = window.__aud;
      const list = A.clickables(['body']).filter((e) => e.matches('button, [role="button"], summary, input[type="checkbox"], input[type="radio"]'));
      let i = 0;
      for (const e of list) {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) continue;
        if (i >= cap) break;
        e.setAttribute('data-aud-h', String(i)); i += 1;
      }
    }, H_POPUP_CAP);
    const np = await f0.evaluate(() => document.querySelectorAll('[data-aud-h]').length);
    const dbg = await f0.evaluate(() => ({ body: !!document.body, n: document.querySelectorAll('*').length, btns: document.querySelectorAll('button').length, aud: !!window.__aud, w: innerWidth, h: innerHeight })).catch((e) => String(e));
    res.notes.push(`popup buttons sampled: ${np} ${JSON.stringify(dbg)}`);
    for (let i = 0; i < np; i += 1) {
      const fr = popupFrame();
      if (!fr) { res.notes.push(`popup frame が消えた(i=${i})`); break; }
      const info = await fr.evaluate((idx) => {
        const e = document.querySelector(`[data-aud-h="${idx}"]`);
        if (!e) return null;
        return { sel: window.__aud.sel(e), text: window.__aud.txt(e, 14), sig: window.__aud.frameSig(e) };
      }, i).catch(() => null);
      if (!info) { res.popup.push({ i, outcome: 'vanished' }); continue; }
      if (DANGER_TEXT.test(info.text)) { res.popup.push({ i, sel: info.sel, text: info.text, outcome: 'skipped:danger-word' }); continue; }
      const urlBefore = page.url();
      const d0 = dl0();
      await fr.evaluate((idx) => { const e = document.querySelector(`[data-aud-h="${idx}"]`); if (e) e.click(); }, i).catch(() => {});
      await sleep(700);
      const fr2 = popupFrame();
      const sigAfter = fr2 ? await fr2.evaluate((idx) => { const e = document.querySelector(`[data-aud-h="${idx}"]`); return e ? window.__aud.frameSig(e) : 'GONE'; }, i).catch(() => 'ERR') : 'NOFRAME';
      const newTabs = await closeExtraPages();
      const row = { i, sel: info.sel, text: info.text, sigChanged: info.sig !== sigAfter, newTabs, downloads: downloads.length - d0, navigated: page.url() !== urlBefore };
      row.outcome = row.navigated ? 'NAVIGATED' : newTabs.length ? 'NEW-TAB' : row.downloads ? 'DOWNLOAD' : row.sigChanged ? 'state-changed' : 'NO-EFFECT';
      res.popup.push(row);
      if (row.navigated) break;
    }
    res.popupLinks = await (popupFrame() || f0).evaluate(() => [...document.querySelectorAll('a[href]')].slice(0, 60).map((a) => ({ text: a.textContent.trim().slice(0, 14), href: a.getAttribute('href'), target: a.getAttribute('target') || '' }))).catch(() => []);
  } else res.notes.push('popup frame が最初から無い');

  // ---- 会場側(1 クリックごとに DOM から再解決。パネルは毎回閉じて前のクリックの影響を持ち越さない)
  const normalize = async () => {
    await page.evaluate(() => { document.querySelectorAll('.nlsb-root .nlsb-roster-close').forEach((b) => { const p = b.closest('.nlsb-roster-panel'); if (p && !p.hidden && getComputedStyle(p).display !== 'none') b.click(); }); }).catch(() => {});
    await sleep(300);
    if (!(await page.evaluate(() => document.documentElement.classList.contains('nlsb-venue-open')).catch(() => false))) await openVenue();
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  };
  await normalize();
  const plan = await page.evaluate((cap) => {
    const A = window.__aud;
    const list = A.clickables(['.nlsb-root']);
    const isCell = (e) => e.matches('a.nl-story-userlane-cell');
    const cells = list.filter(isCell);
    const others = list.filter((e) => !isCell(e));
    const step = Math.max(1, Math.floor(cells.length / cap));
    const pickedIdx = cells.map((_, i) => i).filter((i) => i % step === 0).slice(0, cap);
    return {
      others: others.map((e, i) => ({ text: A.txt(e, 14), sel: A.sel(e), idx: i })),
      cells: pickedIdx.map((i) => ({ idx: i, text: A.txt(cells[i], 14), sel: A.sel(cells[i]) })),
      nCells: cells.length
    };
  }, H_CELL_CAP);
  res.notes.push(`venue: others=${plan.others.length} cells=${plan.cells.length}/${plan.nCells}`);
  const steps = [...plan.others.map((o) => ({ kind: 'btn', ...o })), ...plan.cells.map((c) => ({ kind: 'cell', ...c }))];
  // 「別窓化」「閉じる」は最後(インライン popup が外れる・会場が閉じるため)
  steps.sort((a, b) => (/別窓化|閉じる/.test(a.text) ? 1 : 0) - (/別窓化|閉じる/.test(b.text) ? 1 : 0));
  for (const st of steps) {
    await normalize();
    const info = await page.evaluate((s) => {
      const A = window.__aud;
      const list = A.clickables(['.nlsb-root']);
      const isCell = (e) => e.matches('a.nl-story-userlane-cell');
      const pool = s.kind === 'cell' ? list.filter(isCell) : list.filter((e) => !isCell(e));
      let e = pool[s.idx];
      if (!e || A.txt(e, 14) !== s.text) e = pool.find((x) => A.txt(x, 14) === s.text) || null;
      if (!e) return { vanished: true };
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const c = A.clip(e);
      const inClip = cx >= c[0] && cx <= c[2] && cy >= c[1] && cy <= c[3];
      const hit = cx >= 0 && cy >= 0 && cx < vw && cy < vh ? document.elementFromPoint(cx, cy) : null;
      return {
        sel: A.sel(e), text: A.txt(e, 14), href: e.getAttribute('href') || '', target: e.getAttribute('target') || '', cx, cy,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
        inView: cx >= 0 && cy >= 0 && cx < vw && cy < vh, inClip,
        hitIsSelf: !!hit && (hit === e || e.contains(hit)), hitSel: hit ? A.sel(hit) : 'null',
        inSeat: !!e.closest('.nlsb-seat')
      };
    }, st);
    const row = { kind: st.kind, text: st.text, sel: st.sel };
    if (info.vanished) { row.outcome = 'vanished(再描画で消えた)'; res.venue.push(row); continue; }
    Object.assign(row, { sel: info.sel, href: info.href, target: info.target, inSeat: info.inSeat });
    if (!info.visible) { row.outcome = 'skipped:not-visible'; res.venue.push(row); continue; }
    if (!info.inView) { row.outcome = 'skipped:offscreen(押せない位置)'; res.venue.push(row); continue; }
    if (!info.inClip) { row.outcome = 'skipped:scroll-clipped(レーン横スクロールで隠れ中)'; res.venue.push(row); continue; }
    let hostOk = true;
    if (info.href && /^https?:/.test(info.href)) { try { hostOk = NAV_OK_HOST.test(new URL(info.href).hostname); } catch { hostOk = false; } }
    if (!hostOk) { row.outcome = 'skipped:external-href(クリックせず記録のみ)'; res.skippedExternal.push({ sel: info.sel, href: info.href }); res.venue.push(row); continue; }
    if (!info.hitIsSelf) row.blockedBy = info.hitSel;
    const before = await page.evaluate(() => window.__aud.venueSig());
    const urlBefore = page.url();
    const d0 = dl0();
    await page.mouse.click(info.cx, info.cy);
    await sleep(900);
    const after = await page.evaluate(() => window.__aud.venueSig()).catch(() => 'ERR');
    const newTabs = await closeExtraPages();
    row.sigChanged = before !== after;
    row.newTabs = newTabs;
    row.downloads = downloads.length - d0;
    row.navigated = page.url() !== urlBefore;
    row.outcome = row.navigated ? 'NAVIGATED(メインページ遷移)' : newTabs.length ? 'NEW-TAB' : row.downloads ? 'DOWNLOAD' : row.sigChanged ? 'state-changed' : 'NO-EFFECT';
    res.venue.push(row);
    if (row.navigated) {
      res.notes.push(`メインページが遷移したため再読み込み: ${page.url()}`);
      await page.goto(`https://live.nicovideo.jp/watch/${lv}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(25000); await page.waitForSelector('.nlsb-toggle', { state: 'attached', timeout: 40000 }).catch(() => {});
      await setWidth(w); await openVenue();
    }
  }
  return res;
}

// ---------------------------------------------------------------------------------------------
// レポート(Markdown)
// ---------------------------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function table(rows, cols, limit = 25) {
  if (!rows || !rows.length) return '(なし)\n';
  const head = `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
  const body = rows.slice(0, limit).map((r) => `| ${cols.map((c) => esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])).join(' | ')} |`).join('\n');
  return head + body + (rows.length > limit ? `\n(他 ${rows.length - limit} 件は JSON)` : '') + '\n';
}
function renderMd() {
  const L = [];
  const m = results.meta;
  L.push(`# 会場モード ランタイム監査 (${m.startedAt.slice(0, 10)})`, '', `- 対象 lv: \`${m.lv}\` / 拡張: ${m.extDist} / 幅: ${m.widths.join(', ')} / H 幅: ${m.hWidths.join(', ')}`, `- 生成: scripts/audit/runtime-venue-audit.mjs (JSON: runtime-venue-audit-2026-10-17.json)`, '');
  if (results.errors.length) { L.push('## 監査スクリプト自身のエラー', table(results.errors, ['item', 'error'])); }
  for (const w of m.widths) {
    const W = results.perWidth[w];
    if (!W) continue;
    L.push(`## 幅 ${w}px`, `会場オープン: ${JSON.stringify(W.venueOpen)} / 閉鎖時ベースライン: ${JSON.stringify(W.baselineClosed && W.baselineClosed.C)}`, '');
    if (W.A && !W.A.error) { L.push('### A hidden なのに表示', '会場:', table(W.A.venue, ['sel', 'display', 'opacity', 'rect', 'reallyVisible', 'text']), 'popup:', table(W.A.popup, ['sel', 'display', 'opacity', 'rect', 'reallyVisible', 'text'])); }
    if (W.B && !W.B.error) {
      const b = W.B.venue;
      L.push('### B 押せない要素', `会場: total=${b.total} ok=${b.ok} covered=${b.covered && b.covered.length} offscreen=${b.offscreen && b.offscreen.length} ptrNone=${b.ptrNone && b.ptrNone.length} scrollClipped=${b.scrollClipped}`, table(b.covered, ['sel', 'text', 'center', 'coveredBy', 'partialHits']), 'offscreen:', table(b.offscreen, ['sel', 'text', 'center', 'vw']), 'pointer-events:none:', table(b.ptrNone, ['sel', 'text', 'rect']));
      const pi = W.B.popupInner, po = W.B.popupOuter;
      L.push(`popup 内側: total=${pi && pi.total} ok=${pi && pi.ok} covered=${pi && pi.covered && pi.covered.length} offscreen=${pi && pi.offscreen && pi.offscreen.length}`, table(pi && pi.covered, ['sel', 'text', 'center', 'coveredBy']), `popup 外側(親ページから見た覆い): checked=${po && po.checked} needsScroll=${po && po.needsScroll} covered=${po && po.covered && po.covered.length}`, table(po && po.covered, ['sel', 'text', 'pagePt', 'coveredBy']));
    }
    if (W.C && !W.C.error) {
      const c = W.C.venue;
      L.push('### C はみ出し', `会場/ホスト: vw=${c.vw} docScrollW=${c.docScrollW} (閉鎖時 ${W.baselineClosed && W.baselineClosed.C}) hOverflow=${c.hOverflow.length} vOverflow=${c.vOverflow.length} boxOverflow=${c.boxOverflow.length}`, table(c.hOverflow, ['sel', 'text', 'rect', 'visL', 'visR']), 'vOverflow:', table(c.vOverflow, ['sel', 'text', 'rect', 'visT', 'visB'], 12), 'boxOverflow:', table(c.boxOverflow, ['sel', 'clientW', 'scrollW', 'text'], 12), `popup: hOverflow=${W.C.popup.hOverflow && W.C.popup.hOverflow.length} docScrollW=${W.C.popup.docScrollW}/${W.C.popup.docClientW}`, table(W.C.popup.hOverflow, ['sel', 'text', 'rect', 'visR'], 12));
    }
    if (W.D && !W.D.error) {
      const d = W.D.venue;
      L.push('### D 見えない・潰れた要素(会場)', '幅/高さ0で中身あり:', table(d.zeroSizeWithContent, ['sel', 'rect', 'text', 'ownText', 'overflow']), 'opacity:0 のまま:', table(d.opacity0, ['sel', 'text', 'rect', 'pe', 'anim', 'trans', 'blocksClicks']), 'visibility:hidden のまま:', table(d.visHidden, ['sel', 'text', 'rect', 'pe']), '親が visibility:hidden なのに自分は visible で描画(隠したつもりの漏れ):', table(d.visLeak, ['sel', 'rect', 'parentSel', 'inlineVisibility']));
      const dp = W.D.popup;
      L.push(`popup: zeroSize=${dp.zeroSizeWithContent && dp.zeroSizeWithContent.length} opacity0=${dp.opacity0 && dp.opacity0.length} visHidden=${dp.visHidden && dp.visHidden.length}`);
    }
    if (W.E && !W.E.error) {
      L.push('### E 重なり順(各段階で、表示中のレイヤーの 5 点を elementFromPoint)');
      for (const [stage, layers] of Object.entries(W.E)) {
        if (stage.startsWith('_') || stage === 'rosterOnlyHeaderB' || !Array.isArray(layers) || (layers[0] && typeof layers[0] !== 'object')) continue;
        const bad = layers.filter((x) => x.occluders.length);
        L.push(`- 段階 \`${stage}\`: 表示中 ${layers.length} 件(うち pointer-events:none ${layers.filter((x) => x.peNone).length}) / 遮蔽あり ${bad.length} 件`);
        if (bad.length) L.push(table(bad.map((x) => ({ name: x.name, sel: x.sel, rect: x.rect, z: x.z, pos: x.pos, own: `${x.ownHits}/${x.nPts}`, occluders: x.occluders.join(' ; ') })), ['name', 'sel', 'rect', 'z', 'pos', 'own', 'occluders'], 14));
      }
      const last = W.E['roster+diag+speech+hover'] || W.E.roster;
      if (Array.isArray(last)) L.push('z-index 一覧(最終段階):', table(last.map((x) => ({ name: x.name, sel: x.sel, z: x.z, pos: x.pos, stackAnc: x.stackAnc })), ['name', 'sel', 'z', 'pos', 'stackAnc'], 20));
      const rb = W.E.rosterOnlyHeaderB;
      if (rb) L.push(`一覧パネルのみ開いた状態のヘッダーボタン(B): total=${rb.total} ok=${rb.ok} covered=${rb.covered.length}`, table(rb.covered, ['sel', 'text', 'center', 'coveredBy'], 12));
      const po = W.E.panelsOpen;
      if (po) L.push(`パネル全開時の再測: A=${po.A.venue.length} B.covered=${po.B.venue.covered && po.B.venue.covered.length} B.offscreen=${po.B.venue.offscreen && po.B.venue.offscreen.length} C.h=${po.C.venue.hOverflow && po.C.venue.hOverflow.length} D.op0=${po.D.venue.opacity0 && po.D.venue.opacity0.length}`, table(po.A.venue, ['sel', 'display', 'rect']), table(po.B.venue.covered, ['sel', 'text', 'center', 'coveredBy'], 10), table(po.C.venue.hOverflow, ['sel', 'text', 'rect', 'visR'], 10));
    }
    if (W.F && !W.F.error) {
      L.push('### F クリック透過', table((W.F || []).map((x) => ({ group: x.group, found: x.found, target: x.target, via: x.via, passThrough: x.passThrough, hits: (x.hits || []).map((h) => (h.offscreen ? 'offscreen' : (h.inRoot ? 'VENUE:' : 'PAGE:') + h.hit)).join(' / ') })), ['group', 'found', 'passThrough', 'target', 'hits']), '閉鎖時ベースライン:', table(((W.baselineClosed && W.baselineClosed.F) || []).map((x) => ({ group: x.group, found: x.found, target: x.target, hits: (x.hits || []).map((h) => (h.offscreen ? 'offscreen' : h.hit)).join(' / ') })), ['group', 'found', 'target', 'hits']));
    }
  }
  if (results.G && !results.G.error) {
    L.push('## G 会場 vs popup の computed style 差', `同一: ${results.G.same} 項目 / 差: ${results.G.diffs.length} 項目 / 片側欠落: ${results.G.missing.length}`, '', '### 差(CHECK = 意図的でない疑い。viewport-dependent は幅依存で想定内)', table(results.G.diffs.filter((d) => d.kind === 'CHECK'), ['role', 'prop', 'venue', 'popup'], 80), `配色系(color/background/borderColor/lineHeight)の差: ${results.G.diffs.filter((d) => d.kind === 'paint').length} 件(JSON 参照。会場は白カード+継承色/popup は透過+暗色で構造的に異なる)`, '', '### サンプル矩形(役割: 会場 rect / popup rect)', table(Object.entries(results.G.samples).filter(([k]) => /cell|avatar/.test(k)).map(([k, v]) => ({ role: k, venue: v.venue, popup: v.popup })), ['role', 'venue', 'popup'], 20), '### 欠落', table(results.G.missing, ['role', 'venue', 'popup'], 40));
  } else if (results.G) L.push('## G', JSON.stringify(results.G));
  for (const w of m.hWidths) {
    const H = results.H[w];
    if (!H) continue;
    if (H.error) { L.push(`## H 幅 ${w}: エラー ${H.error}`); continue; }
    const cnt = (arr) => Object.entries(arr.reduce((acc, r) => { const k = (r.outcome || '').split(/[:(]/)[0]; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).map(([k, v]) => `${k}=${v}`).join(', ');
    L.push(`## H 実クリック 幅 ${w}`, H.notes.join(' / '), '', `### 会場: ${cnt(H.venue)}`, '', table(H.venue.filter((r) => r.outcome !== 'state-changed'), ['kind', 'sel', 'text', 'href', 'inSeat', 'outcome', 'blockedBy', 'newTabs'], 60), `### popup ボタン: ${cnt(H.popup)}`, table(H.popup.filter((r) => r.outcome !== 'state-changed'), ['i', 'sel', 'text', 'outcome', 'newTabs'], 40), `popup リンク: ${(H.popupLinks || []).length} 件(JSON 参照)`, '');
  }
  if (results.I) {
    const I = results.I;
    L.push('## I console / pageerror / 失敗リクエスト', '### console error/warning', table(I.console, ['count', 'type', 'text', 'loc', 'phases'], 30), '### pageerror', table(I.pageerror, ['count', 'text', 'phases'], 20), '### 拡張(chrome-extension://)の失敗リクエスト', table(I.requestfailedExt, ['count', 'url', 'err', 'phases'], 30), '### 拡張(chrome-extension://)の HTTP 4xx/5xx', table(I.httpExt, ['count', 'status', 'url', 'phases'], 30), '### ニコニコ系(画像等)の失敗リクエスト(ERR_ABORTED は除く)', table(I.requestfailedNico, ['count', 'url', 'err', 'phases'], 30), `ニコニコ系 ERR_ABORTED=${I.requestfailedAbortedNico} 件 / 第三者(広告・計測)の失敗=${I.requestfailedThirdPartyCount} 件(無関係として集計のみ)`, '', '### HTTP 4xx/5xx(拡張以外)', table(I.http, ['count', 'status', 'url', 'phases'], 30));
  }
  return L.join('\n');
}

// ---- 実行
const run = async () => {
  fs.mkdirSync(path.dirname(OUT_BASE), { recursive: true });
  try {
    await main();
  } catch (e) {
    results.errors.push({ item: 'main', error: String((e && e.stack) || e).slice(0, 600) });
    log('FATAL', e && e.message);
  }
  results.meta.finishedAt = new Date().toISOString();
  fs.writeFileSync(`${OUT_BASE}.json`, JSON.stringify(results, null, 2));
  try { fs.writeFileSync(`${OUT_BASE}.md`, renderMd()); } catch (e) { log('renderMd failed', e.message); fs.writeFileSync(`${OUT_BASE}.md`, 'renderMd failed: ' + e.stack); }
  log('wrote', `${OUT_BASE}.json / .md`);
  process.exit(0);
};
// G の raw 評価のために page を共有(main 内で設定)
const origNewPage = null; // eslint-disable-line no-unused-vars
run();
