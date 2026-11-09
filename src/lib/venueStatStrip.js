/**
 * 会場モードの「数字の帯」(2026-11-09 りんく「これを会場モードでもいれたほうが利便性たかい」)。
 *
 * 横の欄(パネル)の上にある数字カード=記録・推定同時接続・来場者数と、公式の5つのチップ
 * (来場・本家コメ・経過・広告pt・ギフトpt)を、会場のヘッダーに1行で出す。
 *
 * ★値は数え直さない(似せて自作しない)。パネルが描いた値をそのまま保存している
 *   「数字カードの鏡」(KEY_STAT_CARDS_MIRROR・statCardsMirror.js)を読んで、同じ文字を出すだけ。
 *   =パネルと会場で数字が食い違わない(AGENTS.md §12.8 の「表示の正本は1本」)。
 * ★パネルが閉じていると鏡が古くなる(鏡は中身が同じでも15秒ごとに書き直されるので、60秒書かれなければ古い)。
 *   そのときは:
 *   - 記録だけは、パネルに頼らず書かれる正本(panel_summary の recordedCount)で動かし続ける
 *   - 経過は時刻がずれるので「—」に戻す
 *   - ほかの数字は最後の値を薄く出し、title で「パネルが閉じていて更新が止まっています」と伝える
 * ★別の配信の鏡は使わない(liveId が違えば無いのと同じ)。
 *
 * chrome 非依存(テスト可能)。DOM は document 互換のものを引数で受ける。
 *
 * @module venueStatStrip
 */

import { ageMsOf } from './timeAuthority.js';

/** 鏡がこれより古ければ「パネルが閉じている」とみなす[ms](鏡は中身が同じでも15秒ごとに書き直される)。 */
export const VENUE_STAT_STRIP_STALE_MS = 60_000;

/** 古いときの説明(title)。 */
export const VENUE_STAT_STRIP_STALE_TITLE =
  '横の欄(パネル)が閉じているため、記録以外の数字の更新が止まっています。パネルを開くとまた動きます';

/**
 * @typedef {'records'|'concurrent'|'visitor'|'viewers'|'comments'|'streamAge'|'adPts'|'giftPts'} VenueStatKey
 * @typedef {{ key: VenueStatKey, label: string, text: string, unit: string, isPlaceholder: boolean, face: ''|'link'|'konta'|'tanu' }} VenueStatItem
 * @typedef {{ source: 'mirror'|'fallback'|'none', stale: boolean, ageMs: number|null, items: VenueStatItem[] }} VenueStatStripModel
 */

const PH = '—';

/** @param {unknown} v */
function str(v) {
  return v == null ? '' : String(v);
}

/** @param {unknown} c @returns {{ text: string, isPlaceholder: boolean }} */
function chipOf(c) {
  const o = c && typeof c === 'object' ? /** @type {{ text?: unknown, isPlaceholder?: unknown }} */ (c) : {};
  const text = str(o.text).trim();
  return text ? { text, isPlaceholder: o.isPlaceholder === true } : { text: PH, isPlaceholder: true };
}

/** @param {unknown} n */
function formatCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '';
  try {
    return Math.floor(v).toLocaleString('ja-JP');
  } catch {
    return String(Math.floor(v));
  }
}

/**
 * 鏡(と記録件数の正本)から、帯に出す8つの数字を決める純関数。
 *
 * @param {any} snap KEY_STAT_CARDS_MIRROR の中身(StatCardsMirrorSnapshot)。null 可
 * @param {{ liveId?: string, nowMs?: number, recordedCount?: number|null, staleMs?: number }} [opts]
 *   recordedCount: panel_summary の recordedCount(selectDisplayRecordedCount 済み)。パネルが閉じていても動く記録件数
 * @returns {VenueStatStripModel}
 */
export function buildVenueStatStripModel(snap, opts = {}) {
  const liveId = str(opts.liveId).trim().toLowerCase();
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const staleMs = Number.isFinite(Number(opts.staleMs)) && Number(opts.staleMs) > 0 ? Number(opts.staleMs) : VENUE_STAT_STRIP_STALE_MS;

  const s = snap && typeof snap === 'object' ? snap : null;
  const snapLive = s ? str(s.liveId).trim().toLowerCase() : '';
  // 別の配信の鏡は使わない(liveId が分からないときも使わない=取り違えの方が害が大きい)。
  const usable = !!s && !!liveId && snapLive === liveId;
  // 鏡の古さ(時点の読み方は timeAuthority に任せる=null を「たった今」と読まない)。
  const ageMs = usable ? ageMsOf(s.capturedAt, nowMs) : null;
  const stale = usable && (ageMs == null || ageMs > staleMs);

  const fallbackRecords = formatCount(opts.recordedCount);

  // 記録: 新しい鏡ならパネルと同じ文字。古い/無いときは正本の件数(パネルが閉じていても動く)。
  let records = { text: PH, isPlaceholder: true };
  const mirrorRecords = usable ? str(s.recordsText).trim() : '';
  if (usable && !stale && mirrorRecords) {
    records = { text: mirrorRecords, isPlaceholder: s.recordsIsPlaceholder === true };
  } else if (fallbackRecords) {
    records = { text: fallbackRecords, isPlaceholder: false };
  } else if (mirrorRecords) {
    records = { text: mirrorRecords, isPlaceholder: s.recordsIsPlaceholder === true };
  }

  const conc = usable && s.concurrent && typeof s.concurrent === 'object' ? s.concurrent : {};
  const concurrent = chipOf({ text: conc.estText, isPlaceholder: conc.estIsPlaceholder });
  const vis = usable && s.visitor && typeof s.visitor === 'object' ? s.visitor : {};
  const visitor = chipOf(vis);
  const off = usable && s.official && typeof s.official === 'object' ? s.official : null;
  const viewers = chipOf(off?.viewers);
  const comments = chipOf(off?.comments);
  // 経過は時刻なので、古い鏡の値はずれている=出さない。
  const streamAge = stale ? { text: PH, isPlaceholder: true } : chipOf(off?.streamAge);
  const adPts = chipOf(off?.adPts);
  const giftPts = chipOf(off?.giftPts);

  const unitOf = (/** @type {{ text: string, isPlaceholder: boolean }} */ c, /** @type {string} */ u) => (c.isPlaceholder || c.text === PH ? '' : u);
  const concUnit = str(conc.subText).trim() || '人';

  /** @type {VenueStatItem[]} */
  const items = [
    { key: 'records', label: '記録', ...records, unit: unitOf(records, '件'), face: 'link' },
    { key: 'concurrent', label: '推定同時接続', ...concurrent, unit: unitOf(concurrent, concUnit), face: 'konta' },
    { key: 'visitor', label: '来場者数', ...visitor, unit: unitOf(visitor, '人'), face: 'tanu' },
    { key: 'viewers', label: '来場', ...viewers, unit: '', face: '' },
    { key: 'comments', label: '本家コメ', ...comments, unit: '', face: '' },
    { key: 'streamAge', label: '経過', ...streamAge, unit: '', face: '' },
    { key: 'adPts', label: '広告pt', ...adPts, unit: '', face: '' },
    { key: 'giftPts', label: 'ギフトpt', ...giftPts, unit: '', face: '' }
  ];

  /** @type {'mirror'|'fallback'|'none'} */
  const source = usable && !stale ? 'mirror' : fallbackRecords || usable ? 'fallback' : 'none';
  return { source, stale, ageMs, items };
}

/**
 * 描き直しを減らす署名(同じなら DOM を触らない=ちらつかない)。
 * @param {VenueStatStripModel} model
 */
export function venueStatStripSignature(model) {
  if (!model) return '';
  return `${model.source}|${model.stale ? 1 : 0}|${model.items.map((i) => `${i.text}${i.unit}${i.isPlaceholder ? '~' : ''}`).join(',')}`;
}

/**
 * 帯の DOM を作る。値は paint で入れる(枠は最初から全部作る=数字が入っても行の高さが変わらない)。
 *
 * @param {Document} doc
 * @param {{ faces?: { link?: string, konta?: string, tanu?: string } }} [opts]
 * @returns {{ el: HTMLElement, paint: (model: VenueStatStripModel) => boolean }}
 *   paint は実際に描き直したら true(署名が同じなら false)
 */
export function createVenueStatStrip(doc, opts = {}) {
  const faces = opts.faces || {};
  const el = doc.createElement('div');
  el.className = 'nlsb-stat-strip';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', '配信の数字(横の欄と同じ)');
  el.dataset.source = 'none';
  el.dataset.stale = '0';

  /** @type {Map<string, { cell: HTMLElement, val: HTMLElement, unit: HTMLElement }>} */
  const cells = new Map();
  const initial = buildVenueStatStripModel(null, {});
  for (const it of initial.items) {
    const cell = doc.createElement('span');
    cell.className = `nlsb-stat nlsb-stat--${it.key}${it.face ? ' nlsb-stat--card' : ''}`;
    cell.dataset.stat = it.key;
    const src = it.face ? faces[it.face] : '';
    if (src) {
      const img = doc.createElement('img');
      img.className = 'nlsb-stat__face';
      img.alt = '';
      img.decoding = 'async';
      img.width = 18;
      img.height = 18;
      img.src = src;
      // 画像が読めなくても数字は出す(顔だけ消す・AGENTS.md §3.6)。
      img.addEventListener('error', () => { img.hidden = true; }, { once: true });
      cell.appendChild(img);
    }
    const label = doc.createElement('span');
    label.className = 'nlsb-stat__label';
    label.textContent = it.label;
    const val = doc.createElement('span');
    val.className = 'nlsb-stat__val is-placeholder';
    val.textContent = PH;
    const unit = doc.createElement('span');
    unit.className = 'nlsb-stat__unit';
    cell.append(label, val, unit);
    el.appendChild(cell);
    cells.set(it.key, { cell, val, unit });
  }

  let sig = '';
  return {
    el,
    paint(model) {
      if (!model) return false;
      const next = venueStatStripSignature(model);
      if (next === sig) return false;
      sig = next;
      el.dataset.ageMs = model.ageMs == null ? '' : String(Math.round(model.ageMs)); // 描き直した時点の鏡の古さ(計器)
      el.dataset.source = model.source;
      el.dataset.stale = model.stale ? '1' : '0';
      el.classList.toggle('is-stale', model.stale);
      if (model.stale) el.title = VENUE_STAT_STRIP_STALE_TITLE;
      else el.removeAttribute('title');
      for (const it of model.items) {
        const c = cells.get(it.key);
        if (!c) continue;
        if (c.val.textContent !== it.text) c.val.textContent = it.text;
        c.val.classList.toggle('is-placeholder', it.isPlaceholder || it.text === PH);
        if (c.unit.textContent !== it.unit) c.unit.textContent = it.unit;
      }
      return true;
    }
  };
}

/** 会場の CSS(venueBar.js の VENUE_CSS に足す)。帯はヘッダーの2行目を丸ごと使う(数字の幅が変わってもボタンが動かない)。 */
export const VENUE_STAT_STRIP_CSS = `
  .nlsb-stat-strip {
    order: 10;
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    min-width: 0;
    font-size: 11px;
    line-height: 1.2;
    color: #e8eef6;
  }
  .nlsb-stat-strip.is-stale .nlsb-stat:not(.nlsb-stat--records) { opacity: 0.55; }
  .nlsb-stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    flex: 0 0 auto;
    padding: 2px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(30, 41, 56, 0.6);
    white-space: nowrap;
  }
  .nlsb-stat--card {
    align-items: center;
    padding-left: 3px;
    border-color: rgba(255, 216, 138, 0.35);
    background: rgba(48, 40, 22, 0.55);
  }
  .nlsb-stat__face {
    width: 18px;
    height: 18px;
    object-fit: contain;
    align-self: center;
  }
  .nlsb-stat__label { color: rgba(255, 255, 255, 0.62); font-weight: 600; }
  .nlsb-stat__val {
    font-weight: 800;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
  .nlsb-stat--card .nlsb-stat__val { color: #ffe3a3; }
  .nlsb-stat__val.is-placeholder { color: rgba(255, 255, 255, 0.4); font-weight: 600; }
  .nlsb-stat__unit { color: rgba(255, 255, 255, 0.55); font-size: 10px; }
  .nlsb-stat__unit:empty { display: none; }
`;
