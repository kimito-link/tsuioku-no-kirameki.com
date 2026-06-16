/**
 * v0.1.795: 裏(背面)タブでも過去ログ backfill を取り切るための「ハートビート」純ロジック。
 *
 * 真因(司令塔が実コードで特定・council/backfill-background-tabs-SYNTHESIS.md):
 *   過去ログ backfill は content script の setInterval tick(maybeAutoStartBackfill)と、
 *   crawl 内の setTimeout(sleep / per-request timeout)だけで駆動される。Chrome は背面タブの
 *   setTimeout/setInterval を強く間引く(intensive throttling=1/分)ため、全タブが裏のときは
 *   最初の seed すら取れず seg:0/running:true/stopReason:"" のまま何時間も止まる。
 *   一方 RT 記録は player の NDGR long-poll(イベント駆動)なので間引きの影響を受けず生き残る。
 *
 * 解決(MVP):
 *   SW は chrome.alarms(間引き/凍結に強い)で起き、既存の SW backfill crawl エンジン
 *   (backfill-sw-entry.js)で背面の配信を掘る。SW は viewBase 等を知らない(viewBase は
 *   watch ページの DOM 属性で storage に無い)ので、content が recording 中に
 *   「この配信を背面でも掘って良い材料」をハートビートとして storage に書き、SW がそれを読む。
 *
 * 退行ゼロ(v0.1.758 前面優先を壊さない):
 *   前面(focused)タブが1つでも居る配信は SW は kick しない。全タブが裏のときだけ SW が掘る。
 *   前面タブが居るときは従来どおり content の高速経路だけが走る(1bit も変えない)。
 *
 * この module は chrome API/タイマー非依存の純関数のみ。呼び出し側(content=書き手、
 * SW=読み手+判定)が I/O を担い、ここはキー式・整形・kick 判定だけをテスト可能に持つ。
 *
 * @module backfillHeartbeat
 */

/** ハートビートの storage キー接頭辞(配信ごと1キー)。 */
export const BACKFILL_HEARTBEAT_KEY_PREFIX = 'nls_backfill_hb_';

/** SW 背面 kick の有効化キー(既定 ON・false で従来動作へ即ロールバック)。 */
export const KEY_BACKFILL_BG_KICK_ENABLED = 'nls_backfill_bg_kick_enabled_v1';

/**
 * 活きているハートビートの lid 索引キー。
 * SW が毎分 chrome.storage.local.get(null)(全件・重い=stall 誘発)を叩かないために、
 * content が hb を書くたびにこの索引(小さい配列)へ lid を載せ、SW は索引→該当 hb キーだけ get する。
 */
export const KEY_BACKFILL_HEARTBEAT_INDEX = 'nls_backfill_hb_lids_v1';

/** 索引に載せる lid の上限(肥大防止・実機は同時数配信)。 */
export const BACKFILL_HEARTBEAT_INDEX_MAX = 32;

/**
 * ハートビートが古すぎて当てにできないと見なす既定の経過(ms)。
 * content tick は背面でも間引きされつつ最低でも数十秒〜1分に1回は回る想定。
 * これを大きく超えて更新が無い hb は「タブが閉じた/別ページへ遷移した」とみなし掘らない
 * (鮮度切れの viewBase で空振りし続けるのを防ぐ)。
 */
export const BACKFILL_HEARTBEAT_STALE_MS = 6 * 60 * 1000;

/**
 * 背面 kick を始める最小の未取得ギャップ(公式-記録)。これ未満ならほぼ取り切っているので
 * 背面で追加 crawl しない(無駄打ち/storage 競合を増やさない)。
 */
export const BACKFILL_HEARTBEAT_MIN_GAP = 30;

/**
 * 配信 lid を storage キー規約(小文字 trim)へ正規化する。
 * @param {unknown} lid
 * @returns {string}
 */
export function normalizeHeartbeatLid(lid) {
  return String(lid == null ? '' : lid).trim().toLowerCase();
}

/**
 * ハートビートの storage キーを返す。
 * @param {unknown} lid
 * @returns {string}
 */
export function backfillHeartbeatKey(lid) {
  return `${BACKFILL_HEARTBEAT_KEY_PREFIX}${normalizeHeartbeatLid(lid)}`;
}

/**
 * storage キーが backfill ハートビートのものか。
 * @param {unknown} key
 * @returns {boolean}
 */
export function isBackfillHeartbeatKey(key) {
  return (
    typeof key === 'string' &&
    key.startsWith(BACKFILL_HEARTBEAT_KEY_PREFIX) &&
    key.length > BACKFILL_HEARTBEAT_KEY_PREFIX.length
  );
}

/**
 * content が書くハートビート payload を組み立てる。
 * 数値は有限のものだけ採用し、壊れた値は安全側(null/0/false)に倒す。
 *
 * @param {{
 *   lid: unknown,
 *   viewBase?: unknown,
 *   programBeginAtMs?: unknown,
 *   officialCount?: unknown,
 *   recordedCount?: unknown,
 *   deterministic?: unknown,
 *   foreground?: unknown,
 *   now: unknown
 * }} args
 * @returns {{
 *   v: 1, lid: string, viewBase: string,
 *   programBeginAtMs: number|null, officialCount: number|null,
 *   recordedCount: number, deterministic: boolean, foreground: boolean, ts: number
 * }}
 */
export function buildBackfillHeartbeat({
  lid,
  viewBase,
  programBeginAtMs,
  officialCount,
  recordedCount,
  deterministic,
  foreground,
  now
}) {
  // Number(null)===0 / Number('')===0 の罠を避け、空・非数値は明示的に null 扱いにする。
  /** @param {unknown} v @returns {number|null} */
  const finiteOrNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  /** @param {unknown} v @returns {number} */
  const nonNegInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const ts = Number(now);
  return {
    v: 1,
    lid: normalizeHeartbeatLid(lid),
    viewBase: /^https?:\/\//i.test(String(viewBase || '').trim())
      ? String(viewBase).trim()
      : '',
    programBeginAtMs: (() => {
      const n = finiteOrNull(programBeginAtMs);
      return n != null && n > 0 ? Math.floor(n) : null;
    })(),
    officialCount: (() => {
      const n = finiteOrNull(officialCount);
      return n != null && n >= 0 ? Math.floor(n) : null;
    })(),
    recordedCount: nonNegInt(recordedCount),
    deterministic: deterministic === true,
    foreground: foreground === true,
    ts: Number.isFinite(ts) ? ts : 0
  };
}

/**
 * storage から読んだ生値を検証付きで正規化する。壊れていれば null。
 * @param {unknown} raw
 * @returns {ReturnType<typeof buildBackfillHeartbeat>|null}
 */
export function parseBackfillHeartbeat(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.v !== 1) return null;
  const lid = normalizeHeartbeatLid(o.lid);
  if (!/^lv\d{1,15}$/.test(lid)) return null;
  return buildBackfillHeartbeat({
    lid,
    viewBase: o.viewBase,
    programBeginAtMs: o.programBeginAtMs,
    officialCount: o.officialCount,
    recordedCount: o.recordedCount,
    deterministic: o.deterministic,
    foreground: o.foreground,
    now: o.ts
  });
}

/**
 * SW(alarm)が、この配信を背面でも掘り始めるべきか判定する純関数。
 *
 * kick=true になるのは「全タブ裏(前面タブ無し)・hb が新鮮・viewBase 有効・未取得ギャップが
 * 残る・SW がまだその lid を crawl 中でない・有効化フラグ ON」が全て揃うときだけ。
 *
 * @param {{
 *   heartbeat: unknown,          // storage 生値(parse 前)でも parse 済みでも可
 *   now: number,
 *   swAlreadyCrawling: boolean,  // SW registry にこの lid の crawl が在るか
 *   hasForegroundTab: boolean,   // この lid の前面(focused)タブが居るか(SW が tabs.query で判定)
 *   enabled?: boolean,           // KEY_BACKFILL_BG_KICK_ENABLED(v0.1.796 で既定 OFF=明示 true のみ)
 *   maxStaleMs?: number,
 *   minGap?: number
 * }} args
 * @returns {{ kick: boolean, reason:
 *   'ok'|'disabled'|'no_hb'|'bad_lid'|'no_view_base'|'stale_hb'|'foreground_present'|
 *   'already_crawling'|'no_gap' }}
 */
export function shouldSwKickBackfillForLive({
  heartbeat,
  now,
  swAlreadyCrawling,
  hasForegroundTab,
  enabled = false,
  maxStaleMs = BACKFILL_HEARTBEAT_STALE_MS,
  minGap = BACKFILL_HEARTBEAT_MIN_GAP
}) {
  // v0.1.796: 既定 OFF(opt-in)。明示 true のときだけ kick を許す(記録保護)。
  if (enabled !== true) return { kick: false, reason: 'disabled' };
  // parseBackfillHeartbeat は生値も parse 済みも同じ形に正規化する(冪等)ので両対応で渡せる。
  const hb = parseBackfillHeartbeat(heartbeat);
  if (!hb) return { kick: false, reason: 'no_hb' };
  if (!/^lv\d{1,15}$/.test(hb.lid)) return { kick: false, reason: 'bad_lid' };
  if (!hb.viewBase) return { kick: false, reason: 'no_view_base' };

  const nowMs = Number(now);
  const stale = Math.max(0, Number(maxStaleMs) || 0);
  if (Number.isFinite(nowMs) && hb.ts > 0 && nowMs - hb.ts > stale) {
    return { kick: false, reason: 'stale_hb' };
  }
  // v0.1.758 前面優先の鏡: 前面タブが居るならそのタブの高速経路に任せ SW は掘らない。
  if (hasForegroundTab === true) return { kick: false, reason: 'foreground_present' };
  if (swAlreadyCrawling === true) return { kick: false, reason: 'already_crawling' };

  // 公式件数が分かるときだけギャップで間引く。不明(null)なら掘る側に倒す(取りこぼし優先)。
  if (hb.officialCount != null) {
    const gap = Math.max(0, hb.officialCount - hb.recordedCount);
    if (gap < Math.max(0, Number(minGap) || 0)) {
      return { kick: false, reason: 'no_gap' };
    }
  }
  return { kick: true, reason: 'ok' };
}

/**
 * 索引(lid 配列)を正規化する。lv 形式・重複排除・上限 clamp。壊れていれば空配列。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeHeartbeatLidIndex(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const lid = normalizeHeartbeatLid(x);
    if (!/^lv\d{1,15}$/.test(lid)) continue;
    if (seen.has(lid)) continue;
    seen.add(lid);
    out.push(lid);
  }
  return out.slice(-BACKFILL_HEARTBEAT_INDEX_MAX);
}

/**
 * 既存索引へ lid を 1 件足した新配列を返す(最近のものを末尾に・上限 clamp)。
 * 既に末尾が同じ lid なら同一参照でなく同値配列を返す(呼び出し側は値で比較して書き込み要否を決める)。
 * @param {unknown} rawIndex
 * @param {unknown} lid
 * @returns {string[]}
 */
export function mergeHeartbeatLidIndex(rawIndex, lid) {
  const normalized = normalizeHeartbeatLid(lid);
  const base = normalizeHeartbeatLidIndex(rawIndex);
  if (!/^lv\d{1,15}$/.test(normalized)) return base;
  const without = base.filter((x) => x !== normalized);
  without.push(normalized); // 最近書いた lid を末尾(新しい順を末尾)に
  return without.slice(-BACKFILL_HEARTBEAT_INDEX_MAX);
}
