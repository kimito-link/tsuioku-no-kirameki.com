/* global document, setTimeout, clearTimeout, fetch */
/**
 * ニコ生以外のサービスの「イベントの今の順位・pt・次の順位まで」を、横の欄(サイドパネル)の公式の数字の下に出す。
 *   りんく 2026-11-21「拡張はそれぞれのプラットフォーム対応もして」。
 *
 * 重さの約束(低スペック PC で固まらない):
 *   - 読むのはこの画面(横の欄)が見えている間だけ。視聴ページ側には何も足さない(配信ページの負担は今のまま)。
 *   - 自分の順位は 60 秒に1回(ふわっち 約1.4KB/部門・SHOWROOM 約18KB・ミクチャ 約70KB)。
 *   - 参加者一覧は「参加者を見る」を開いている間だけ 3 分に1回。閉じたら読まない。
 *   - 失敗したら間隔を倍にする(最大 10 分)。storage には何も書かない(メモリだけ)。
 *   - 描き直しは中身が変わったときだけ(同じ HTML なら DOM に触らない)。
 * 読み取り・表示は純関数(src/lib/platform/eventStandingParsers.js・eventStandingView.js)。
 */
import {
  wwEventInfoUrlForStanding,
  parseWwEventGroups,
  wwRankingUrl,
  parseWwRanking,
  srEventAndSupportUrlForStanding,
  parseSrStanding,
  srEventRankingUrl,
  parseSrEventRankingPage,
  mxLiveUrlForStanding,
  parseMxEventRef,
  mxEventRankingUrl,
  parseMxEventRanking,
  MX_RANKING_MAX_ROWS,
} from '../../src/lib/platform/eventStandingParsers.js';
import { escapeHtml } from '../../src/lib/htmlEscape.js';
import {
  buildStandingCardHtml,
  buildStandingListHtml,
  diffStandingRows,
  buildNoEventRankingHtml,
  EVENT_STANDING_CSS,
} from '../../src/lib/platform/eventStandingView.js';
import { srRoomStatusUrl, parseSrRoomStatus, srRoomKeyOfStreamKey } from '../../src/lib/showroom/srParse.js';
import { wwLiveIdOfStreamKey } from '../../src/lib/whowatch/wwParse.js';
import { mxUserIdOfStreamKey } from '../../src/lib/mixch/mxParse.js';
import { platformFetchTimeoutSignal } from '../../src/lib/platform/fetchTimeout.js';

export const SELF_EVERY_MS = 60_000;
export const LIST_EVERY_MS = 180_000;
const MAX_BACKOFF_MS = 600_000;
const LIST_ROWS_STEP = 50;
const SR_PAGE_SIZE = 30;
const READ_PLATFORMS = new Set(['whowatch', 'showroom', 'mixch']);

/** @param {string} url */
async function getJson(url) {
  if (!url) throw new Error('no-url');
  const res = await fetch(url, { credentials: 'omit', signal: platformFetchTimeoutSignal(), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {{ doc?: Document, now?: () => number }} [opts]
 */
export function createEventStandingController(opts = {}) {
  const doc = opts.doc || document;
  const now = opts.now || (() => Date.now());
  let platform = '';
  let key = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  let selfTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let listTimer = null;
  let selfBackoff = SELF_EVERY_MS;
  let busy = false;
  let gen = 0;
  /** 見ている配信のための覚え(配信が変われば捨てる) */
  /** @type {any} */
  let ctx = {};
  /** @type {Array<{ standing: any, fetchedAt: number, list: any }>} */
  let cards = [];
  let lastNoteHtml = '';

  const visible = () => doc.visibilityState !== 'hidden';

  /** 置き場(公式の数字の並びのすぐ下)。無い画面では何もしない。 */
  const box = () => {
    let el = doc.getElementById('nlEventStanding');
    if (el) return el;
    const row = doc.querySelector('.nl-official-nico-stats__row');
    if (!row || !row.parentElement) return null;
    if (!doc.getElementById('nlEventStandingCss')) {
      const st = doc.createElement('style');
      st.id = 'nlEventStandingCss';
      st.textContent = EVENT_STANDING_CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    el = doc.createElement('div');
    el.id = 'nlEventStanding';
    el.className = 'nl-evs nl-evb';
    el.setAttribute('aria-label', 'イベントの今の順位');
    el.hidden = true;
    row.insertAdjacentElement('afterend', el);
    el.addEventListener('toggle', (ev) => onToggle(/** @type {any} */ (ev.target)), true);
    el.addEventListener('click', (ev) => {
      const t = /** @type {any} */ (ev.target);
      if (t && t.matches && t.matches('[data-evs-more]')) {
        const d = t.closest('details');
        const i = Number(d?.getAttribute('data-evs-i'));
        const c = cards[i];
        if (!c || !c.list) return;
        c.list.limit += LIST_ROWS_STEP;
        if (platform === 'showroom') void loadSrMorePages(i, gen);
        else renderList(i);
      }
    });
    return el;
  };

  /** @param {string} html @param {Element} el */
  const setHtml = (el, html) => {
    if (/** @type {any} */ (el).__evsHtml === html) return;
    /** @type {any} */ (el).__evsHtml = html;
    el.innerHTML = html;
  };

  /** @param {any} st */
  const scopeKey = (st) => `${st.scope}:${st.group || ''}`;
  /** @param {any} st */
  const listLabel = (st) => (st.scope === 'group' ? `部門「${st.group || ''}」` : st.scope === 'block' ? `ブロック「${st.group || ''}」` : 'イベント全体');

  const render = () => {
    const el = box();
    if (!el) return;
    if (!READ_PLATFORMS.has(platform)) {
      const html = buildNoEventRankingHtml(platform);
      if (html !== lastNoteHtml) {
        lastNoteHtml = html;
        el.innerHTML = html;
      }
      el.hidden = !html;
      return;
    }
    if (lastNoteHtml) {
      lastNoteHtml = '';
      el.innerHTML = '';
    }
    // 大きな1枚は先頭の部門。ほかの部門(ふわっちの「総合」など)はその2行目に小さく。
    // 「参加者を見る」は部門ごと。部門の数が変わったときだけ外枠を作り直す(開いている一覧を閉じない)
    const show = cards.filter((c) => c.standing);
    const sig = show.map((c) => scopeKey(c.standing)).join('|');
    if (el.getAttribute('data-evs-sig') !== sig || !el.querySelector(':scope > .nl-evs__cardbox')) {
      el.setAttribute('data-evs-sig', sig);
      el.innerHTML =
        `<div class="nl-evs__cardbox"></div>` +
        show
          .map(
            (c) =>
              `<details class="nl-evb__full" data-evs-i="${cards.indexOf(c)}"><summary>${escapeHtml(
                show.length > 1 ? `${listLabel(c.standing)}の参加者を見る` : '参加者の順位を見る',
              )}（開いている間だけ読みます）</summary><div class="nl-evs__listbox"></div></details>`,
          )
          .join('');
    }
    const cb = el.querySelector(':scope > .nl-evs__cardbox');
    if (cb && show[0]) {
      setHtml(cb, buildStandingCardHtml(show[0].standing, { fetchedAt: show[0].fetchedAt, who: ctx.who || '', secondary: show.slice(1).map((c) => c.standing) }));
    }
    el.hidden = show.length === 0;
  };

  /** @param {number} i */
  const renderList = (i) => {
    const el = box();
    const c = cards[i];
    if (!el || !c || !c.list) return;
    const d = el.querySelector(`details[data-evs-i="${i}"]`);
    const lb = d && d.querySelector('.nl-evs__listbox');
    if (!lb) return;
    const L = c.list;
    let note = L.note || '';
    if (platform === 'mixch' && L.capped) note = `公式の一覧は上位${MX_RANKING_MAX_ROWS}人までです`;
    setHtml(
      lb,
      buildStandingListHtml({
        rows: L.rows,
        selfId: ctx.selfId || '',
        changes: L.changes || {},
        pointsVisible: L.pointsVisible !== false,
        fetchedAt: L.fetchedAt,
        prevFetchedAt: L.prevFetchedAt || 0,
        scope: L.scope || '',
        note,
        limit: L.limit,
      }),
    );
  };

  // ---- 自分の順位 ----

  /** @param {number} g */
  const readSelf = async (g) => {
    if (platform === 'whowatch') {
      const liveId = wwLiveIdOfStreamKey(key);
      const userId = String(key.split('.')[2] || '');
      ctx.selfId = userId;
      if (!ctx.groups || now() - (ctx.groupsAt || 0) > 10 * 60_000) {
        ctx.groups = parseWwEventGroups(await getJson(wwEventInfoUrlForStanding(liveId))).slice(0, 3);
        ctx.groupsAt = now();
      }
      /** @type {typeof cards} */
      const next = [];
      for (const grp of ctx.groups) {
        if (g !== gen) return;
        const raw = await getJson(wwRankingUrl(grp, userId, { limit: 1 }));
        const r = parseWwRanking(raw, { eventName: grp.eventName, group: grp.group });
        const top = Array.isArray(raw) ? raw[0] : raw;
        const nm = String(top?.publisher_ranking?.user?.name || '').trim();
        if (nm) ctx.who = nm.slice(0, 40);
        const prev = cards.find((c) => c.standing && c.grpKey === grp.rankingType);
        if (r) next.push({ standing: r.standing, fetchedAt: now(), list: prev?.list || null, grpKey: grp.rankingType, grp });
      }
      if (g === gen) cards = next;
      return;
    }
    if (platform === 'showroom') {
      if (!ctx.roomId) {
        const st = parseSrRoomStatus(await getJson(srRoomStatusUrl(srRoomKeyOfStreamKey(key))));
        if (!st) throw new Error('room-status');
        ctx.roomId = st.roomId;
        ctx.who = st.roomName;
        ctx.selfId = st.roomId;
      }
      const r = parseSrStanding(await getJson(srEventAndSupportUrlForStanding(ctx.roomId)));
      if (g !== gen) return;
      const prev = cards[0];
      cards = r ? [{ standing: r.standing, fetchedAt: now(), list: prev && prev.urlKey === r.urlKey ? prev.list : null, urlKey: r.urlKey, blockId: r.blockId, eventId: r.eventId }] : [];
      return;
    }
    if (platform === 'mixch') {
      const userId = mxUserIdOfStreamKey(key);
      ctx.selfId = userId;
      const ref = parseMxEventRef(await getJson(mxLiveUrlForStanding(userId)));
      if (!ref) {
        if (g === gen) cards = [];
        return;
      }
      const raw = await getJson(mxEventRankingUrl(ref.eventId));
      const r = parseMxEventRanking(raw, userId, ref);
      if (g !== gen || !r) return;
      const me = r.rows.find((x) => x.id === userId);
      if (me?.name) ctx.who = me.name;
      const prev = cards[0];
      const keepList = prev && prev.eventId === ref.eventId ? prev.list : null;
      cards = [{ standing: r.standing, fetchedAt: now(), list: keepList, eventId: ref.eventId, mx: r }];
      // ミクチャは自分の順位と一覧が同じ応答。一覧を開いているなら、ここで一覧も新しくする(余分に読まない)
      if (keepList && keepList.open) applyRows(0, r.rows, { pointsVisible: true, scope: 'イベント全体の順位', capped: r.capped });
    }
  };

  const selfTick = async () => {
    selfTimer = null;
    if (!READ_PLATFORMS.has(platform) || !key) return;
    if (!box()) {
      // 横の欄がまだ描かれていない(読まずに待つだけ・通信なし)
      selfTimer = setTimeout(selfTick, 5_000);
      return;
    }
    if (!visible()) {
      selfTimer = setTimeout(selfTick, SELF_EVERY_MS);
      return;
    }
    if (busy) return;
    busy = true;
    const g = gen;
    try {
      await readSelf(g);
      if (g !== gen) return;
      selfBackoff = SELF_EVERY_MS;
      render();
    } catch {
      selfBackoff = Math.min(MAX_BACKOFF_MS, selfBackoff * 2);
    } finally {
      busy = false;
      if (g === gen && !selfTimer) selfTimer = setTimeout(selfTick, selfBackoff);
    }
  };

  // ---- 参加者一覧(開いている間だけ) ----

  /** @param {number} i @param {any[]} rows @param {{ pointsVisible: boolean, scope: string, capped?: boolean, note?: string }} m */
  const applyRows = (i, rows, m) => {
    const c = cards[i];
    if (!c) return;
    const L = c.list || { limit: LIST_ROWS_STEP, open: true };
    const prevRows = L.rows || null;
    L.changes = prevRows ? diffStandingRows(prevRows, rows) : {};
    L.prevFetchedAt = prevRows ? L.fetchedAt : 0;
    L.rows = rows;
    L.fetchedAt = now();
    L.pointsVisible = m.pointsVisible;
    L.scope = m.scope;
    L.capped = !!m.capped;
    L.note = m.note || '';
    c.list = L;
    renderList(i);
  };

  /** @param {number} i @param {number} g */
  const readList = async (i, g) => {
    const c = cards[i];
    if (!c) return;
    if (platform === 'whowatch') {
      const r = parseWwRanking(await getJson(wwRankingUrl(c.grp, ctx.selfId, { limit: 1000 })), {});
      if (g !== gen || !r) return;
      applyRows(i, r.rows, { pointsVisible: true, scope: `部門「${c.standing.group || ''}」の順位`, note: r.standing.realtimeLabel ? `ふわっちの表示「${r.standing.realtimeLabel}」` : '' });
      return;
    }
    if (platform === 'showroom') {
      // 1ページ目と、自分の順位が載っているページだけ(全ページは「もっと見る」で)
      const pages = new Set([1]);
      const myRank = c.standing.rank;
      if (myRank) pages.add(Math.ceil(myRank / SR_PAGE_SIZE));
      /** @type {Map<string, any>} */
      const byId = new Map();
      let pointsVisible = false;
      let isBlock = false;
      let lastPage = 1;
      for (const p of [...pages].sort((a, b) => a - b)) {
        const r = parseSrEventRankingPage(await getJson(srEventRankingUrl(c.urlKey, c.blockId, p, c.eventId)));
        if (g !== gen) return;
        if (!r) continue;
        pointsVisible = r.pointsVisible;
        isBlock = r.isBlock;
        lastPage = r.lastPage;
        for (const row of r.rows) byId.set(row.id, row);
      }
      c.srPagesRead = pages;
      c.srLastPage = lastPage;
      const rows = [...byId.values()].sort((a, b) => a.rank - b.rank);
      applyRows(i, rows, {
        pointsVisible,
        scope: c.blockId || isBlock ? (c.standing.group ? `ブロック「${c.standing.group}」の中の順位` : 'ブロックの中の順位') : 'イベント全体の順位',
        note: lastPage > 1 ? `公式の一覧 ${lastPage}ページのうち ${[...pages].join('・')}ページ目` : '',
      });
      return;
    }
    if (platform === 'mixch') {
      const r = parseMxEventRanking(await getJson(mxEventRankingUrl(c.eventId)), ctx.selfId, {});
      if (g !== gen || !r) return;
      applyRows(i, r.rows, { pointsVisible: true, scope: 'イベント全体の順位', capped: r.capped });
    }
  };

  /** SHOWROOM の「もっと見る」= 次のページを1つだけ読む @param {number} i @param {number} g */
  const loadSrMorePages = async (i, g) => {
    const c = cards[i];
    if (!c || !c.list) return;
    const read = c.srPagesRead || new Set([1]);
    const nextPage = [...Array(c.srLastPage || 1).keys()].map((x) => x + 1).find((p) => !read.has(p));
    if (!nextPage) return renderList(i);
    try {
      const r = parseSrEventRankingPage(await getJson(srEventRankingUrl(c.urlKey, c.blockId, nextPage, c.eventId)));
      if (g !== gen || !r) return;
      read.add(nextPage);
      c.srPagesRead = read;
      const byId = new Map(c.list.rows.map((/** @type {any} */ x) => [x.id, x]));
      for (const row of r.rows) byId.set(row.id, row);
      c.list.rows = [...byId.values()].sort((a, b) => a.rank - b.rank);
      c.list.note = `公式の一覧 ${c.srLastPage}ページのうち ${[...read].sort((a, b) => a - b).join('・')}ページ目`;
      renderList(i);
    } catch {
      /* 次に開いたとき */
    }
  };

  const anyListOpen = () => cards.some((c) => c.list && c.list.open);

  const listTick = async () => {
    listTimer = null;
    if (!anyListOpen()) return;
    const g = gen;
    if (visible()) {
      for (let i = 0; i < cards.length; i += 1) {
        const c = cards[i];
        if (!c.list || !c.list.open) continue;
        try {
          await readList(i, g);
        } catch {
          /* 次の回 */
        }
        if (g !== gen) return;
      }
    }
    if (g === gen && anyListOpen()) listTimer = setTimeout(listTick, LIST_EVERY_MS);
  };

  /** @param {HTMLDetailsElement} d */
  const onToggle = (d) => {
    if (!d || d.tagName !== 'DETAILS' || !d.hasAttribute('data-evs-i')) return;
    const i = Number(d.getAttribute('data-evs-i'));
    const c = cards[i];
    if (!c) return;
    c.list = c.list || { limit: LIST_ROWS_STEP };
    c.list.open = d.open;
    if (!d.open) return;
    if (c.list.rows) renderList(i);
    // 最後に読んでから 3 分たっていれば今読む(開け閉めを繰り返しても 3 分に1回まで)
    if (!c.list.fetchedAt || now() - c.list.fetchedAt >= LIST_EVERY_MS) {
      if (listTimer) clearTimeout(listTimer);
      void listTick();
    } else if (!listTimer) listTimer = setTimeout(listTick, LIST_EVERY_MS - (now() - c.list.fetchedAt));
  };

  doc.addEventListener('visibilitychange', () => {
    if (visible() && READ_PLATFORMS.has(platform) && key && !busy) {
      const stale = !cards.length || cards.every((c) => now() - c.fetchedAt >= SELF_EVERY_MS);
      if (stale) {
        if (selfTimer) clearTimeout(selfTimer);
        selfTimer = null;
        void selfTick();
      }
    }
  });

  return {
    /**
     * いま横の欄が見せている配信。同じなら何もしない(何度呼ばれても軽い)。
     * @param {string} platformId @param {string} streamKey
     */
    setTarget(platformId, streamKey) {
      const p = String(platformId || '');
      const k = String(streamKey || '');
      if (p === platform && k === key) return;
      platform = p;
      key = k;
      gen += 1;
      ctx = {};
      cards = [];
      selfBackoff = SELF_EVERY_MS;
      if (selfTimer) clearTimeout(selfTimer);
      if (listTimer) clearTimeout(listTimer);
      selfTimer = null;
      listTimer = null;
      busy = false;
      const el = doc.getElementById('nlEventStanding');
      if (el) {
        el.innerHTML = '';
        el.hidden = true;
      }
      lastNoteHtml = '';
      if (!p || p === 'niconico') return;
      render();
      if (READ_PLATFORMS.has(p) && k.startsWith(`${({ whowatch: 'ww', showroom: 'sr', mixch: 'mx' })[/** @type {'whowatch'} */ (p)]}.`)) void selfTick();
    },
  };
}
