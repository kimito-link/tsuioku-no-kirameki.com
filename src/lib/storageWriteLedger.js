/**
 * storageWriteLedger.js
 *
 * 2026-07-07 (robust-arch Phase 0 / 計器のみ・挙動不変):
 *   大配信激重の根治アーキ設計で真犯人と特定された「巨大キーを高頻度 set する書込輻輳」を
 *   数値で可視化するための、chrome.storage.local への **書込台帳**。
 *
 *   safeStorageLocal.js の set ラッパ(唯一の書込入口)にフック1つを足し、
 *   「キー名 → { 回数, 概算bytes }」をメモリ上に積むだけの純ロジック(ここは storage に一切触れない)。
 *   status:live は「書込上位5キー bytes/分」の1行としてこれを読む。
 *
 * 設計上の約束:
 *   - **上位Nキーのみを気にする**(全キー stringify は重い)。集計自体は全キー受けるが、
 *     表示は topWriteKeys(ledger, 5) で上位5に絞る。
 *   - bytes は「今回 set した値」を1回だけ概算する(= approxByteLength)。呼び出し側が既に
 *     手に持っている items をそのまま渡すので、追加の read/stringify コストは items 分だけ。
 *   - 純関数(Date.now を持たない)。ウィンドウ(bytes/分)の時刻は呼び出し側が渡す
 *     (テスト可能性・resume 安全性のため=グローバルルール準拠)。
 *   - 記録/演出/音には一切影響しない。集計が壊れても set 自体は素通しさせる(呼び出し側の
 *     try/catch で握りつぶす前提)。
 */

/**
 * @typedef {{ count: number, bytes: number }} LedgerEntry
 * @typedef {{
 *   keys: Record<string, LedgerEntry>,
 *   windowStartMs: number
 * }} StorageWriteLedger
 */

/**
 * 空の台帳を作る。
 * @param {number} [nowMs] ウィンドウ起点(bytes/分の分母)。省略時は 0(未計測)。
 * @returns {StorageWriteLedger}
 */
export function makeStorageWriteLedger(nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return { keys: Object.create(null), windowStartMs: now };
}

/**
 * 値の概算バイト長。UTF-16 の文字数ではなく「JSON 直列化後の文字数」を bytes 近似として使う
 *   (chrome.storage の quota も直列化サイズ基準)。循環参照や巨大 blob で stringify が
 *   投げても集計を止めない(0 を返す)。
 * @param {unknown} value
 * @returns {number}
 */
export function approxByteLength(value) {
  if (value === undefined) return 0;
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return typeof s === 'string' ? s.length : 0;
  } catch {
    return 0;
  }
}

/**
 * set された items(1回の set = 複数キーの場合あり)を台帳へ積む純関数。破壊的更新
 *   (同一 ledger オブジェクトを更新)で返す=呼び出し側は使い回してよい。
 * @param {StorageWriteLedger} ledger
 * @param {Record<string, unknown>|null|undefined} items chrome.storage.local.set の引数
 * @returns {StorageWriteLedger} 同一 ledger(チェーン用)
 */
export function recordWrite(ledger, items) {
  if (!ledger || typeof ledger !== 'object') return makeStorageWriteLedger();
  if (!ledger.keys) ledger.keys = Object.create(null);
  if (!items || typeof items !== 'object') return ledger;
  for (const key of Object.keys(items)) {
    const bytes = approxByteLength(items[key]);
    const prev = ledger.keys[key];
    if (prev) {
      prev.count += 1;
      prev.bytes += bytes;
    } else {
      ledger.keys[key] = { count: 1, bytes };
    }
  }
  return ledger;
}

/**
 * 累計 bytes 降順で上位 n キーを返す(同値は count 降順→キー名昇順で安定化)。
 * @param {StorageWriteLedger|null|undefined} ledger
 * @param {number} [n]
 * @returns {Array<{ key: string, count: number, bytes: number }>}
 */
export function topWriteKeys(ledger, n = 5) {
  if (!ledger || typeof ledger !== 'object' || !ledger.keys) return [];
  const rows = Object.keys(ledger.keys).map((key) => ({
    key,
    count: ledger.keys[key].count,
    bytes: ledger.keys[key].bytes
  }));
  rows.sort((a, b) => {
    if (b.bytes !== a.bytes) return b.bytes - a.bytes;
    if (b.count !== a.count) return b.count - a.count;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const limit = Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 5;
  return rows.slice(0, limit);
}

/**
 * ウィンドウ経過分あたりの bytes に正規化した上位 n キーを返す(status:live 表示用)。
 *   経過が 0 または未計測なら bytesPerMin は生 bytes をそのまま入れる(0除算回避=
 *   「まだ1分経っていない」ときは累計をそのまま見せる方が診断として素直)。
 * @param {StorageWriteLedger|null|undefined} ledger
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {number} [n]
 * @returns {Array<{ key: string, count: number, bytes: number, bytesPerMin: number }>}
 */
export function topWriteKeysPerMinute(ledger, nowMs, n = 5) {
  const top = topWriteKeys(ledger, n);
  const start = Number(ledger?.windowStartMs);
  const now = Number(nowMs);
  const elapsedMs =
    Number.isFinite(start) && start > 0 && Number.isFinite(now) && now > start ? now - start : 0;
  const minutes = elapsedMs > 0 ? elapsedMs / 60000 : 0;
  return top.map((r) => ({
    ...r,
    bytesPerMin: minutes > 0 ? Math.round(r.bytes / minutes) : r.bytes
  }));
}

/**
 * KB へ丸めた読みやすい表記(1024 で割って小数1桁・1KB 未満は bytes)。
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return '0B';
  if (b < 1024) return `${Math.round(b)}B`;
  return `${(b / 1024).toFixed(1)}KB`;
}

/**
 * status:live 概要に出す「書込上位5キー bytes/分」の行群を作る純関数。書込が一度も
 *   無ければ空配列(ノイズにしない・他計器と同方針)。
 * @param {StorageWriteLedger|null|undefined} ledger
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {number} [n]
 * @returns {string[]}
 */
export function buildStorageWriteLedgerLines(ledger, nowMs, n = 5) {
  const rows = topWriteKeysPerMinute(ledger, nowMs, n);
  if (!rows.length) return [];
  const head = `書込上位${rows.length}キー(このページ・bytes/分):`;
  const body = rows.map(
    (r) => `  ${r.key}: ${formatBytes(r.bytesPerMin)}/分 (累計${formatBytes(r.bytes)}・${r.count}回)`
  );
  return [head, ...body];
}
