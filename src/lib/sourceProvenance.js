/**
 * sourceProvenance.js — 値を「**どの経路で取れたか**」で記録し、経路の劣化を検出する(純関数)。
 *
 * ★なぜ要るか(2026-08-16 ユーザー指示)
 *   「**30年後楽ができるように根本解決。DOMがどんな構造に今後変わったとしてもいい
 *     ような根本解決の計器をつくる**」
 *
 * ■ 従来の計器の限界
 *   いまの計器は「値が取れたか / 取れなかったか」しか見ていない。
 *   ニコ生が DOM を変えると **壊れてから** 症状(サムネが白い・レーンが空)で気づく。
 *   ＝ 常に後手。7版空振り・6版10時間といった空振りの温床。
 *
 * ■ この module がやること: **取れた経路(source)を記録し、劣化を検出する**
 *   同じ値でも、どこから取れたかで「壊れやすさ」が違う:
 *
 *     official-stats  公式の統計メッセージ    ← 最も壊れにくい
 *     embedded-data   #embedded-data の JSON  ← 構造非依存(クラス名に依存しない)
 *     ws              WebSocket フレーム
 *     dom-text        DOM から正規表現で抽出  ← 最も壊れやすい
 *
 *   ★普段 embedded-data で取れていたものが dom-text に落ちたら、
 *     **まだ症状は出ていなくてもニコ生が変えた予兆**。これが「壊れる前に鳴る」計器。
 *
 * ■ 世界の標準に沿っている(車輪の再発明を避けるための確認・2026-08-16 調査)
 *   - yt-dlp: 埋め込み構造化データを第一級で扱う(_search_json_ld / _search_nextjs_data 等)。
 *     「Provide fallbacks」= 複数経路を用意し1本折れても死なない
 *   - Playwright / Testing Library: CSS/XPath は DOM 構造に縛られるので非推奨。
 *     **意味**で拾え(role / text)
 *   ★ただし **self-healing(機械が黙って別要素を掴む)は採用しない**。
 *     「落ちるべき検査が緑になる」＝このリポが最も苦しんだ「計器の嘘」を量産するため。
 *     ここでやるのは **黙って直すことではなく、劣化を鳴らすこと**。
 *
 * ■ 語彙は既存を使う(新しい概念を作らない)
 *   `src/domain/observations/vocabulary.js` の STAT_SOURCE が既に
 *   「壊れにくい順」の経路 enum を持っている(実装済・35テスト緑)。**それをそのまま使う**。
 *
 * @module sourceProvenance
 */

import { STAT_SOURCE, isStatSource } from '../domain/observations/vocabulary.js';

/**
 * 経路の「丈夫さ」順位。数が小さいほど壊れにくい。
 *
 * ★この順序が計器の中核。DOM に近いほど弱い。
 *   ここを変えると劣化判定の意味が変わるので、変えるときは test も一緒に直すこと。
 */
export const SOURCE_ROBUSTNESS = Object.freeze({
  [STAT_SOURCE.OFFICIAL_STATS]: 0,
  [STAT_SOURCE.EMBEDDED_DATA]: 1,
  [STAT_SOURCE.WEBSOCKET]: 2,
  [STAT_SOURCE.DOM_TEXT]: 3
});

/** 「これ以下は脆い」の境界。dom-text だけが脆い側。 */
export const FRAGILE_FROM = SOURCE_ROBUSTNESS[STAT_SOURCE.DOM_TEXT];

/**
 * 経路の丈夫さ順位を引く。未知の経路は「最も脆い」として扱う
 * （知らないものを安全側に倒さない＝嘘の緑を作らない）。
 * @param {unknown} source
 * @returns {number}
 */
function rankOf(source) {
  const key = String(source ?? '');
  const table = /** @type {Record<string, number>} */ (SOURCE_ROBUSTNESS);
  const r = table[key];
  return Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
}

/**
 * @typedef {{
 *   field: string,
 *   source: string,
 *   at: number
 * }} SourceSample 1回の取得記録
 */

/**
 * @typedef {{
 *   field: string,
 *   best: string|null,
 *   current: string|null,
 *   degraded: boolean,
 *   fragile: boolean,
 *   samples: number,
 *   lastAt: number
 * }} FieldProvenance フィールドごとの経路の履歴
 */

/**
 * 既存コードの表記ゆれを STAT_SOURCE へ寄せる。
 *
 * ★content-entry.js は既に `viewerCountSource: 'ws'|'embedded'|'dom'|'none'` を
 *   持っている（＝取得経路の記録は**既に実装済み**で、履歴を見る層だけが無かった）。
 *   新しい語彙を作らず、**既存の値をそのまま受け取れる**ようにする
 *   ([[shared-knowledge-is-not-shared-judgment]]: 語彙を2つ作ると必ず食い違う)。
 *
 * @param {unknown} raw
 * @returns {string|null} STAT_SOURCE の値。未知/none は null（＝記録しない）
 */
export function normalizeSource(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || s === 'none') return null;
  if (isStatSource(s)) return s;
  // 既存の短い表記 → 語彙へ
  if (s === 'embedded') return STAT_SOURCE.EMBEDDED_DATA;
  if (s === 'dom') return STAT_SOURCE.DOM_TEXT;
  if (s === 'official') return STAT_SOURCE.OFFICIAL_STATS;
  if (s === 'websocket') return STAT_SOURCE.WEBSOCKET;
  return null;
}

/**
 * 記録用の state を作る。
 * @returns {{ byField: Record<string, FieldProvenance> }}
 */
export function createProvenanceState() {
  return { byField: Object.create(null) };
}

/**
 * 1回の取得を記録する。**呼び出し側は「値」と「経路」を渡すだけ**。
 *
 * ★値そのものは持たない(個人情報・巨大配列を抱えない)。経路と時刻だけ。
 *
 * @param {{ byField: Record<string, FieldProvenance> }} state
 * @param {{ field: unknown, source: unknown, at?: unknown }} obs
 * @returns {void}
 */
export function noteSource(state, obs) {
  if (!state || typeof state !== 'object' || !state.byField) return;
  const field = String(obs?.field || '').trim();
  if (!field) return;
  /*
   * ★経路が語彙外/none なら記録しない(出所不明を「取れた」と数えない)。
   *   既存表記('embedded'/'dom')はここで吸収する。
   */
  const source = normalizeSource(obs?.source);
  if (!source) return;
  const atRaw = Number(obs?.at);
  const at = Number.isFinite(atRaw) && atRaw > 0 ? atRaw : 0;

  const prev = state.byField[field];
  if (!prev) {
    state.byField[field] = {
      field,
      best: source,
      current: source,
      degraded: false,
      fragile: rankOf(source) >= FRAGILE_FROM,
      samples: 1,
      lastAt: at
    };
    return;
  }
  prev.current = source;
  prev.samples += 1;
  prev.lastAt = at || prev.lastAt;
  prev.fragile = rankOf(source) >= FRAGILE_FROM;
  /*
   * ★best は「これまでで最も丈夫だった経路」。
   *   一度でも embedded-data で取れたなら、それがこのフィールドの本来の姿。
   *   いま dom-text なら **降格した**＝ニコ生が変えた疑い。
   */
  const bestRank = rankOf(prev.best);
  const curRank = rankOf(source);
  if (curRank < bestRank) {
    // より丈夫な経路で取れた＝best を更新
    prev.best = source;
  }
  /*
   * ★degraded は「いま best より弱い経路か」= **現在の状態**として毎回入れ直す。
   *   ★ここを「一度 true にしたら据え置き」にすると、直したのに永久に赤いままになる
   *     ([[cumulative-value-shown-as-current-state-2026-08-12]]:
   *      累積値を「いまの状態」として出すと正常でも警告が居座る)。
   *   best と同じ経路に戻った時点で degraded は false に戻る。
   */
  prev.degraded = curRank > rankOf(prev.best);
}

/**
 * 記録を判定用のスナップショットにする。
 * @param {{ byField: Record<string, FieldProvenance> }|null|undefined} state
 * @returns {{ total:number, degraded:string[], fragile:string[], bySource:Record<string,number> }}
 */
export function snapshotProvenance(state) {
  /** @type {Record<string, number>} */
  const bySource = Object.create(null);
  /** @type {string[]} */
  const degraded = [];
  /** @type {string[]} */
  const fragile = [];
  const fields = state && state.byField ? Object.keys(state.byField) : [];
  for (const f of fields) {
    const p = state.byField[f];
    if (!p) continue;
    const src = String(p.current || '');
    bySource[src] = (bySource[src] || 0) + 1;
    if (p.degraded) degraded.push(f);
    if (p.fragile) fragile.push(f);
  }
  return { total: fields.length, degraded: degraded.sort(), fragile: fragile.sort(), bySource };
}

/**
 * 保存用に畳む/復元する。
 *
 * ★なぜ保存が要るか: 降格は**時間をまたいで**起きる。
 *   「先週は embedded-data で取れていた」を覚えていないと降格を判定できない。
 *   ページを開き直すたびに忘れる作りだと、この計器は永久に鳴らない。
 *
 * ★保存するのは経路と時刻だけ(値は持たない=個人情報を溜めない)。
 */

/**
 * @param {{ byField: Record<string, FieldProvenance> }|null|undefined} state
 * @returns {Record<string, { best:string, current:string, samples:number, lastAt:number }>}
 */
export function toStorable(state) {
  /** @type {Record<string, any>} */
  const out = Object.create(null);
  const fields = state && state.byField ? Object.keys(state.byField) : [];
  for (const f of fields) {
    const p = state.byField[f];
    if (!p || !p.best) continue;
    out[f] = {
      best: String(p.best),
      current: String(p.current || p.best),
      samples: Number(p.samples) || 0,
      lastAt: Number(p.lastAt) || 0
    };
  }
  return out;
}

/**
 * 保存値から state を戻す。壊れた値は捨てる(嘘の履歴を作らない)。
 * @param {unknown} stored
 * @returns {{ byField: Record<string, FieldProvenance> }}
 */
export function fromStorable(stored) {
  const state = createProvenanceState();
  if (!stored || typeof stored !== 'object') return state;
  for (const f of Object.keys(stored)) {
    const raw = /** @type {any} */ (stored)[f];
    if (!raw || typeof raw !== 'object') continue;
    const best = normalizeSource(raw.best);
    const current = normalizeSource(raw.current) || best;
    if (!best || !current) continue;
    const bestRank = rankOf(best);
    const curRank = rankOf(current);
    state.byField[f] = {
      field: f,
      best,
      current,
      degraded: curRank > bestRank,
      fragile: curRank >= FRAGILE_FROM,
      samples: Number(raw.samples) || 0,
      lastAt: Number(raw.lastAt) || 0
    };
  }
  return state;
}

/**
 * ★経路の健全性を判定する。**これが「壊れる前に鳴る」計器の本体**。
 *
 * 判定の考え方:
 *   - 降格あり(best より弱い経路で取れている) → **bad**。ニコ生が変えた疑い＝最優先
 *   - 降格は無いが脆い経路(dom-text)に依存 → **warn**。負債として見える化(異常ではない)
 *   - すべて丈夫な経路 → ok
 *   - 観測ゼロ → na(「使っていない」と「壊れた」を混ぜない)
 *
 * ★脆い経路の存在そのものを bad にしない(掟1/2)。dom-text でしか取れない値は実際にある。
 *   異常なのは **前より悪くなったこと**。
 *
 * @param {{ byField: Record<string, FieldProvenance> }|null|undefined} state
 * @returns {{ level:'ok'|'warn'|'bad'|'na', text:string, degraded:string[], fragileCount:number }}
 */
export function judgeSourceProvenance(state) {
  const snap = snapshotProvenance(state);
  if (snap.total === 0) {
    return { level: 'na', text: '—', degraded: [], fragileCount: 0 };
  }
  const fragileCount = snap.fragile.length;
  if (snap.degraded.length > 0) {
    const names = snap.degraded.slice(0, 3).join('・');
    const more = snap.degraded.length > 3 ? `ほか${snap.degraded.length - 3}件` : '';
    return {
      level: 'bad',
      text: `${names}${more} が弱い取得経路に落ちました(ニコ生の変更の疑い)`,
      degraded: snap.degraded,
      fragileCount
    };
  }
  if (fragileCount > 0) {
    return {
      level: 'warn',
      text: `${fragileCount}/${snap.total}件が画面文字からの取得です(構造変更に弱い)`,
      degraded: [],
      fragileCount
    };
  }
  return {
    level: 'ok',
    text: `${snap.total}件すべて安定した経路で取得`,
    degraded: [],
    fragileCount: 0
  };
}

/**
 * 健全度セルにする。**セル数は増やさない**（この1個だけ）。
 *
 * ★ユーザー指示「30年後も楽できる根本解決」に対する答えがこのセル。
 *   他の100セルが「いま壊れているか」を見るのに対し、
 *   これは **「これから壊れそうか」** を見る唯一のセル。
 *
 * ★入力は watch snapshot の `viewerCountSource` 等、**既に publish 済みの値**。
 *   新しい storage 読み取りを増やさない（診断が本体より重くなってはいけない
 *   ＝ observer effect。今回のセッションで実際に踏んだ）。
 *
 * @param {{ byField: Record<string, FieldProvenance> }|null|undefined} state
 * @returns {import('./healthCells.js').HealthCell}
 */
export function buildSourceProvenanceCell(state) {
  const v = judgeSourceProvenance(state);
  return {
    id: 'source-provenance',
    label: 'データの取り方',
    kind: /** @type {'state'} */ ('state'),
    value: null,
    level: /** @type {'ok'|'warn'|'bad'|'na'} */ (v.level),
    text: v.text
  };
}
