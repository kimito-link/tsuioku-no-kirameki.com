/**
 * rememberedAvatarIndex.js — 「同じ userId で過去に取れた avatarUrl」を O(1) で引く索引(純粋関数)。
 *
 * ★なぜ要るか(2026-09-14・CPU プロファイルで特定した真因)
 *   popup の rememberedAvatarUrlForUserId は、プロファイルキャッシュに無い uid のたびに
 *   STORY_SOURCE_STATE.entries(保存コメント全件)を【逆順に全走査】していた(O(N)/呼び出し)。
 *   これを countResolvedAvatarEntries が全コメント分呼ぶ(O(N))ので、合計 O(N²):
 *   21,680 件 × 21,680 件 ≒ 4.7 億回の文字列比較が refresh のたびに走る。
 *   実測(devtools Chrome・実配信 lv351386196):
 *     - 拡張プロセスの CPU サンプル 785,239 中、非 idle の過半がこの関数(inclusive 168,454)
 *     - サイドパネル自己診断の最大タイマー遅延 = 49,988ms → 178,299ms(コメントが増えるほど悪化)
 *     - その間 Chrome はサイドパネルの「読み込み中」(ダークモードでは黒地に灰色の横縞)を出し続け、
 *       スクロールも効かない(メインスレッドが塞がっているため)
 *   ⟹ 走査を「entries 配列ごとに 1 回だけ」にし、引くのは Map の get(O(1))にする。
 *
 * ■ 意味論は逆順走査と【同じ】
 *   逆順走査の「末尾から見て最初に見つかった強い avatarUrl」 ＝ 前から見て「最後に出た強い avatarUrl」。
 *   前向きに1パスで上書きしていけば同じ答えになる(テストで同値性をランダム試行で固定)。
 *
 * ■ この箱に入らないもの
 *   uid から URL を生成する(deriveAvatarUrlFromUid)・プロファイルキャッシュを見る、は呼び手の責務。
 */

import { isHttpOrHttpsUrl, isWeakNiconicoUserIconHttpUrl } from './supportGrowthTileSrc.js';

/**
 * 「実際に表示へ使える(強い)avatar URL」か。http(s) で、かつニコ生の弱い既定アイコンではない。
 * @param {unknown} avatarUrl
 * @returns {string} 強ければその URL(trim 済み)。弱ければ ''
 */
export function strongAvatarUrlOrEmpty(avatarUrl) {
  const av = String(avatarUrl == null ? '' : avatarUrl).trim();
  return av && isHttpOrHttpsUrl(av) && !isWeakNiconicoUserIconHttpUrl(av) ? av : '';
}

/**
 * entries を 1 パス走査して uid → 「最後に出た強い avatarUrl」の Map を作る。
 * @param {readonly unknown[]|null|undefined} entries
 * @returns {Map<string, string>}
 */
export function buildRememberedAvatarIndex(entries) {
  /** @type {Map<string, string>} */
  const index = new Map();
  if (!Array.isArray(entries)) return index;
  for (const e of entries) {
    const row = /** @type {{ userId?: unknown, avatarUrl?: unknown }|null} */ (e);
    const uid = String(row?.userId ?? '').trim();
    if (!uid) continue;
    const av = strongAvatarUrlOrEmpty(row?.avatarUrl);
    if (av) index.set(uid, av);   // ★後勝ち = 逆順走査の「最初に見つかった」と同じ
  }
  return index;
}

/**
 * 参照透過な検証用: 従来の逆順走査(O(N))。テストで索引との同値性を確かめるためだけに置く。
 * @param {readonly unknown[]|null|undefined} entries
 * @param {string} uid
 * @returns {string}
 */
export function rememberedAvatarUrlByReverseScan(entries, uid) {
  if (!Array.isArray(entries)) return '';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const row = /** @type {{ userId?: unknown, avatarUrl?: unknown }|null} */ (entries[i]);
    if (String(row?.userId ?? '').trim() !== uid) continue;
    const av = strongAvatarUrlOrEmpty(row?.avatarUrl);
    if (av) return av;
  }
  return '';
}

/**
 * entries の【参照と長さ】が変わったときだけ索引を作り直す lookup。
 * popup は 3 秒ごとの poll で entries 配列を作り直す(新しい参照)ので、poll ごとに O(N) 1 回・
 * その間の何万回の引きは O(1)。
 * ★同じ参照で長さだけ増えた(push された)場合も作り直す(取りこぼしを出さない)。
 * @returns {{ get: (entries: readonly unknown[]|null|undefined, uid: string) => string, rebuilds: () => number }}
 */
export function createRememberedAvatarLookup() {
  /** @type {readonly unknown[]|null} */
  let ref = null;
  let len = -1;
  /** @type {Map<string, string>} */
  let index = new Map();
  let rebuilds = 0;
  return {
    get(entries, uid) {
      if (!Array.isArray(entries) || !uid) return '';
      if (entries !== ref || entries.length !== len) {
        index = buildRememberedAvatarIndex(entries);
        ref = entries;
        len = entries.length;
        rebuilds += 1;
      }
      return index.get(uid) || '';
    },
    rebuilds: () => rebuilds
  };
}
