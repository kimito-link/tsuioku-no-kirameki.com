// diagSchemaCopy.js
// 計器スナップショットを「フィールド表(schema)だけ」から機械的に組み立てる共有ヘルパー。
//   HANDOFF-instrument-channels-2026-08-12.md §2 の必須5点セット②③の実体。
//
// ★なぜ手書きの個別列挙を禁じるか(失敗#3・2026-08-12 時点で6回踏んだ):
//   buildXxxSnapshot() を「return { a: d.a, b: d.b, ... }」と手で書くと、schema に
//   フィールドを足したのに snapshot 側に足し忘れる事故が必ず起きる。落ちた値は
//   storage に載らず、読み手はそのフィールドを永久に受け取れない。しかも「行は出る」
//   ので気づけない(venueSeatsDiag の snapshot が実際にこれを繰り返した)。
//   schema を唯一の正本にし、コピーを schema の反復で行えば、この事故は構造的に起きない。
//
// ★kind と unmeasured の分離(失敗#6/#7):
//   'ms' 系は既定値 -1(未計測)を必ず持つ。「0=観測して0ms」と「未計測」を型で分ける。
//   これを混ぜると「一度も測っていない」が「0msで完璧」に化ける。

// ★時点フィールド名は timeAuthority.js の正本に委ねる(独自解釈しない)。
//   timeAuthorityRegistry の凍結リストは「独自に時点を解釈するファイル」を増やさないための
//   仕掛けで、正本へ委譲したファイルは対象外=これが移行後の望ましい姿。
import { CANONICAL_TIME_FIELD } from './timeAuthority.js';

/**
 * @typedef {'count'|'ms'|'flag'|'text'|'stage'} DiagFieldKind
 * @typedef {{ name: string, kind: DiagFieldKind, default?: unknown }} DiagField
 * @typedef {ReadonlyArray<DiagField>} DiagSchema
 */

/**
 * kind ごとの既定値(field.default 未指定時に使う)。
 *   ms は -1(未計測)= 0 と区別する。count は 0、flag は false、text/stage は ''。
 * @param {DiagFieldKind} kind
 * @returns {unknown}
 */
export function defaultValueForKind(kind) {
  switch (kind) {
    case 'ms':
      return -1;
    case 'count':
      return 0;
    case 'flag':
      return false;
    case 'text':
    case 'stage':
      return '';
    default:
      return null;
  }
}

/**
 * schema の1フィールドの既定値を返す(field.default があればそれを優先)。
 * @param {DiagField} field
 * @returns {unknown}
 */
export function defaultForField(field) {
  if (!field || typeof field !== 'object') return null;
  return Object.prototype.hasOwnProperty.call(field, 'default')
    ? field.default
    : defaultValueForKind(field.kind);
}

/**
 * schema から初期 state を機械生成する(必須5点セット②)。
 * @param {DiagSchema} schema
 * @returns {Record<string, unknown>}
 */
export function makeInitialFromSchema(schema) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const f of Array.isArray(schema) ? schema : []) {
    if (!f || typeof f.name !== 'string' || !f.name) continue;
    out[f.name] = defaultForField(f);
  }
  return out;
}

/**
 * 値を kind に沿って正規化する。数値化できない/型違いは既定値へ落とす
 *   (storage 由来の壊れた値をそのまま下流へ流さない)。
 * @param {unknown} value
 * @param {DiagField} field
 * @returns {unknown}
 */
export function coerceByKind(value, field) {
  const fallback = defaultForField(field);
  const kind = field?.kind;
  if (kind === 'count' || kind === 'ms') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (kind === 'flag') {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
  }
  if (kind === 'text' || kind === 'stage') {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }
  return value === undefined ? fallback : value;
}

/**
 * ★必須5点セット③の実体。schema を反復して input から値を写す。
 *   - schema にあるフィールドは必ず出力に存在する(欠損は既定値で埋まる=読み手が undefined を踏まない)
 *   - schema に無いフィールドは**落とす**(storage に野良フィールドを溜めない)
 *   - 時点フィールド(timeAuthority の CANONICAL_TIME_FIELD)は呼び出し側が明示指定した
 *     場合のみ付ける。時点は epoch だけ保存し「N秒前」は読み手が算出する(化石値ガードと同方針)
 *
 * @param {DiagSchema} schema フィールド表(唯一の正本)
 * @param {unknown} input 生の state(部分・null・非オブジェクト可)
 * @param {Record<string, number>} [opts] 時点を載せるなら { [CANONICAL_TIME_FIELD]: epochMs }
 * @returns {Record<string, unknown>}
 */
export function copyDiagBySchema(schema, input, opts) {
  const src = /** @type {Record<string, unknown>} */ (
    input && typeof input === 'object' ? input : {}
  );
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const f of Array.isArray(schema) ? schema : []) {
    if (!f || typeof f.name !== 'string' || !f.name) continue;
    out[f.name] = coerceByKind(src[f.name], f);
  }
  if (opts && Object.prototype.hasOwnProperty.call(opts, CANONICAL_TIME_FIELD)) {
    const at = Number(opts[CANONICAL_TIME_FIELD]);
    out[CANONICAL_TIME_FIELD] = Number.isFinite(at) ? at : 0;
  }
  return out;
}

/**
 * schema のキー集合(テスト・ゲートG2用)。
 * @param {DiagSchema} schema
 * @returns {string[]}
 */
export function schemaFieldNames(schema) {
  return (Array.isArray(schema) ? schema : [])
    .filter((f) => f && typeof f.name === 'string' && f.name)
    .map((f) => f.name);
}

/**
 * 全フィールドに「既定値と異なる値」を入れた合成 snapshot を作る(ゲートG2用)。
 *   これを copyDiagBySchema に通して deep-equal で戻れば、
 *   「schema にあるのに写していないフィールド」がゼロだと機械的に断言できる。
 * @param {DiagSchema} schema
 * @returns {Record<string, unknown>}
 */
export function makeNonDefaultSample(schema) {
  /** @type {Record<string, unknown>} */
  const out = {};
  let i = 0;
  for (const f of Array.isArray(schema) ? schema : []) {
    if (!f || typeof f.name !== 'string' || !f.name) continue;
    i += 1;
    const base = defaultForField(f);
    switch (f.kind) {
      case 'count':
        out[f.name] = (Number(base) || 0) + i;
        break;
      case 'ms':
        // 既定 -1(未計測)と必ず異なる正の値。0 も「観測して0」で有効値なので i を足す。
        out[f.name] = i * 7;
        break;
      case 'flag':
        out[f.name] = !base;
        break;
      case 'text':
      case 'stage':
        out[f.name] = `${f.name}#${i}`;
        break;
      default:
        out[f.name] = `sample#${i}`;
    }
  }
  return out;
}
