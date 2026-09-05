/**
 * nicoliveRankingPick.js — 公式ランキングから【検証に使う配信を1つ選ぶ】純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザー:「ちくらんから任意の放送を選ぶのも自動化したい」)
 *   黒画面や描画の検証には「いま賑わっている実配信」が要る。
 *   毎回ユーザーに配信を選ばせて開かせるのは【私が依頼していた手作業】そのもの
 *   [[never-make-user-run-commands-i-can-run]]。
 *
 * ■ ★どこから取るか(実測して決めた・2026-08-18)
 *   候補は2つあった:
 *     (a) ちくらん(chikuwachan.com) … ユーザーが普段見ている外部サイト
 *     (b) ニコ生公式ランキング(live.nicovideo.jp/ranking)
 *   ★(a)は host_permissions に無い = 追加すると【ストア再審査】が要る(実コスト)。
 *   ★(b)は `https://*.nicovideo.jp/*` で【既に許可済み】。実測で 200 が返り、
 *     userPrograms 50件 / officialAndChannelPrograms 37件が構造化JSONで取れた。
 *   → (b)を使う。外部サイトへの依存も増えない。
 *
 * ■ ★データの出どころ(実測で確認した形)
 *   ランキングHTMLの `<script id="embedded-data" data-props="...">` に全体が入っている。
 *   json.ranking.userPrograms[] の各要素は {type:'seed', value:{...}} の包み。
 *   value に nicoliveProgramId / title / status / statistics{watchCount,commentCount}
 *   / nicoad{totalPoint} / isSensitive / isFollowerOnly / providerType がある。
 *
 * ■ 掟
 *   - 純関数。fetch も DOM も chrome API も触らない(HTMLは呼び出し側が渡す)。
 *   - ★取れない値は null。0 と混同しない [[unobserved-must-not-hide-the-cell-2026-08-15]]
 *
 * @module nicoliveRankingPick
 */

/** 配信IDの書式規約(sidePanelLvFromTabs.js / background.js と同一)。 */
const LV_RE = /^lv\d{1,15}$/;

/** @param {unknown} v @returns {number|null} 取れないものは null(0と区別する) */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {{
 *   lv: string,
 *   title: string,
 *   status: string,
 *   watchCount: number|null,
 *   commentCount: number|null,
 *   adPoints: number|null,
 *   providerType: string,
 *   isSensitive: boolean,
 *   isFollowerOnly: boolean
 * }} RankingProgram
 */

/**
 * ランキングページのHTMLから埋め込みJSONを取り出す。
 * ★HTMLの見た目(クラス名など)には一切依存しない = 模様替えで壊れない。
 *
 * @param {string} html
 * @returns {unknown|null} パースできなければ null(でっち上げない)
 */
export function extractEmbeddedData(html) {
  const m = /<script[^>]+id="embedded-data"[^>]*data-props="([^"]+)"/.exec(String(html ?? ''));
  if (!m) return null;
  const txt = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * 埋め込みJSONから配信一覧を取り出して正規化する。
 *
 * @param {unknown} data extractEmbeddedData の戻り
 * @param {{ includeOfficial?: boolean }} [opts]
 * @returns {RankingProgram[]} 取れなければ空配列
 */
export function listRankingPrograms(data, opts = {}) {
  const rk = data && typeof data === 'object' ? /** @type {any} */ (data).ranking : null;
  if (!rk || typeof rk !== 'object') return [];
  const groups = [rk.userPrograms];
  if (opts.includeOfficial === true) groups.push(rk.officialAndChannelPrograms);

  /** @type {RankingProgram[]} */
  const out = [];
  for (const g of groups) {
    if (!Array.isArray(g)) continue;
    for (const raw of g) {
      // {type:'seed', value:{...}} の包みと、素の値の両方を受ける。
      const v = raw && typeof raw === 'object' && raw.value ? raw.value : raw;
      if (!v || typeof v !== 'object') continue;
      const lv = String(v.nicoliveProgramId ?? '');
      if (!LV_RE.test(lv)) continue;
      const st = v.statistics && typeof v.statistics === 'object' ? v.statistics : {};
      out.push({
        lv,
        title: String(v.title ?? ''),
        status: String(v.status ?? ''),
        watchCount: numOrNull(st.watchCount),
        commentCount: numOrNull(st.commentCount),
        adPoints: numOrNull(v.nicoad && v.nicoad.totalPoint),
        providerType: String(v.providerType ?? ''),
        isSensitive: v.isSensitive === true,
        isFollowerOnly: v.isFollowerOnly === true
      });
    }
  }
  return out;
}

/**
 * 検証に使う配信を1つ選ぶ。
 *
 * ★既定の狙い: 「いま放送中で・コメントが流れていて・誰でも入れる」配信。
 *   コメントが流れていないと、レーン描画や黒画面の検証にならない(空のまま)。
 *
 * @param {ReadonlyArray<RankingProgram>} programs
 * @param {{
 *   minComments?: number,
 *   allowSensitive?: boolean,
 *   allowFollowerOnly?: boolean,
 *   rank?: number
 * }} [opts]
 *   minComments … これ未満のコメント数は選ばない(既定 100)
 *   rank        … 上から何番目を選ぶか(0始まり・既定0)。別の配信が欲しいとき使う。
 * @returns {{ program: RankingProgram|null, reason: 'ok'|'none'|'out-of-range', candidates: number }}
 */
export function pickProgramForCheck(programs, opts = {}) {
  const minComments = Number.isFinite(opts.minComments) ? Number(opts.minComments) : 100;
  const list = Array.isArray(programs) ? programs : [];
  const usable = list.filter((p) => {
    if (!p || p.status !== 'ON_AIR') return false;
    if (!opts.allowSensitive && p.isSensitive) return false;
    if (!opts.allowFollowerOnly && p.isFollowerOnly) return false;
    // ★コメントが流れていない配信は検証に使えない(レーンが空のまま=何も測れない)
    return (p.commentCount ?? 0) >= minComments;
  });
  // 賑わっている順(コメント数降順・同数なら来場降順)。★同じ入力なら必ず同じ結果。
  usable.sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0)
    || (b.watchCount ?? 0) - (a.watchCount ?? 0)
    || a.lv.localeCompare(b.lv));
  if (usable.length === 0) return { program: null, reason: 'none', candidates: 0 };
  const idx = Math.max(0, Math.floor(Number(opts.rank) || 0));
  if (idx >= usable.length) return { program: null, reason: 'out-of-range', candidates: usable.length };
  return { program: usable[idx], reason: 'ok', candidates: usable.length };
}

/** ランキングページのURL(呼び出し側が使う)。★host_permissions に既にある。 */
export const NICOLIVE_RANKING_URL = 'https://live.nicovideo.jp/ranking';

/**
 * 配信の視聴URLを組み立てる。
 * @param {unknown} lv 配信ID
 * @returns {string} 不正な形式なら ''(推測でURLを作らない)
 */
export function watchUrlFor(lv) {
  return LV_RE.test(String(lv ?? '')) ? `https://live.nicovideo.jp/watch/${lv}` : '';
}
