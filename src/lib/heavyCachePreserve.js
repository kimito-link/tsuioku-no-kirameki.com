// @ts-nocheck — 純データ判定(chrome/DOM 非依存)
/**
 * 軽い read が heavy read の証跡を消さないための純関数(v0.1.1367)。
 *
 * ■ 真因(2026-08-12 実機 v1366 の速報でコードから確定・実データ不要だった)
 *   速報: `heavyRacePaintedFromCache: 0` / `heavyReuseLastReason: "no-cache"` /
 *         `heavyEverSettled: false` / race 21回 / コメント78件中【19件】しか描けない。
 *
 *   v1363 は「手元に全件があれば世代が進んでも描く」で race 固着を根治したが、
 *   その発動条件 `canReuseHeavyChunkRead` は refresh の【冒頭】(popup-entry.js:15991)で
 *   確定する。ところが同じ refresh の途中(16146行)で軽い read 成功時に
 *       watchMetaCache.lastCommentsArr = { lv, arr, chunkTotal: null }   ← readAtMs 無し
 *   とキャッシュを丸ごと上書きしていた。
 *
 *   decideHeavyChunkReadReuse は readAtMs が無いと fresh-read 条件(90行)が成立しない。
 *   本件のような取得率10%(記録85/公式837)の配信では coverage(80%)も割るため、
 *   次 refresh は必ず reuse:false → v1363 の分岐は bail(RACE) へ落ちる。
 *   ★つまり v1363 は【構造的に一度も発動できない】。0回は偶然ではない。
 *
 * ■ なぜ「上書きしない」ではなく「合成する」なのか
 *   軽い read の arr は表示に必要(fallback_cached の材料・v0.1.481 の多タブ timeout 対策)。
 *   単に上書きをやめると、その退避が効かなくなり別の退化を生む。
 *   ★保つべきは【heavy が読了した証跡(chunkTotal / readAtMs)】だけなので、
 *   「同じ lv で、heavy の方が長い(=より全件に近い)なら heavy 側を残す」に限定する。
 *
 * ■ 壊さないための不変条件(既存挙動を変えない範囲)
 *   - lv が違えば必ず新しい方を採る(別配信のデータを使わない・v0.1.481 の原則)
 *   - heavy 証跡が無い(旧形式)なら従来どおり軽い側で上書き=後方互換
 *   - 軽い側の方が長ければ軽い側を採る(より新しく多い情報が正)
 *
 * @module heavyCachePreserve
 */

/**
 * 軽い read 成功時に in-memory キャッシュへ何を書くかを決める。
 *
 * @param {object} args
 * @param {string} args.lv 現在の配信 liveId
 * @param {unknown[]} args.lightArr 軽い read で読めた配列(本体・そのまま採用しうる)
 * @param {{ lv?: string, arr?: unknown[], chunkTotal?: number|null, readAtMs?: number }|null|undefined} args.cached
 *   現在の watchMetaCache.lastCommentsArr
 * @returns {{ arr: unknown[], chunkTotal: number|null, readAtMs: number|undefined, preserved: boolean }}
 *   preserved=true のとき heavy の証跡(chunkTotal/readAtMs)を引き継いだ。
 */
export function decideLightWriteKeepsHeavyTrace(args) {
  const a = args && typeof args === 'object' ? args : {};
  const lv = String(a.lv || '').trim().toLowerCase();
  const lightArr = Array.isArray(a.lightArr) ? a.lightArr : [];
  const cached = a.cached && typeof a.cached === 'object' ? a.cached : null;

  /** 従来どおりの書き込み(証跡なし)。 */
  const plain = { arr: lightArr, chunkTotal: null, readAtMs: undefined, preserved: false };

  if (!cached) return plain;

  const cachedLv = String(cached.lv || '').trim().toLowerCase();
  // 別配信のキャッシュは使わない(v0.1.481 の原則・混入は snapshotKey とは別の層で防ぐ)。
  if (!cachedLv || cachedLv !== lv) return plain;

  const readAtMs = Number(cached.readAtMs);
  const hasHeavyTrace = Number.isFinite(readAtMs) && readAtMs > 0;
  // 旧形式(readAtMs 無し)は従来と同一挙動=後方互換。
  if (!hasHeavyTrace) return plain;

  const cachedArr = Array.isArray(cached.arr) ? cached.arr : [];
  // 軽い側の方が多くを持っているなら、そちらが正(より新しく全件に近い)。
  //   ★このとき証跡は引き継がない: その arr は heavy が読了したものではないため、
  //   readAtMs を付けると「読了時点で完全だった」という嘘の証跡になる。
  if (lightArr.length >= cachedArr.length) return plain;

  // heavy の方が長い=軽い read は部分的。表示は heavy の全件を使い、証跡も保つ。
  return {
    arr: cachedArr,
    chunkTotal: cached.chunkTotal == null ? null : cached.chunkTotal,
    readAtMs,
    preserved: true
  };
}
