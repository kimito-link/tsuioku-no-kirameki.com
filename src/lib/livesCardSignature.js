/**
 * livesCardSignature — 配信カードを作り直すべきかの署名(v0.1.1320)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ切り出すか（2026-08-10・診断ページが重い件の最有力真因）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * status-entry.js の配信カードには v0.1.868 でこういう guard が入っていた:
 *
 *   > 配信カードは 2 秒ごとに innerHTML 全再構築+<img>再生成でサムネが毎回チラつき重い。
 *   > 表示に効く値だけの軽い signature を作り、変化が無ければ再構築を丸ごと skip
 *
 * ★ところが、その signature に **`elapsedSec`(経過【秒】)** が入っていた。
 *   配信中は毎秒増えるので **guard が一度も効かない**＝止めたかった再構築が
 *   そのまま起き続けていた（カード1枚30〜60要素・サムネ `<img>` 再生成つき）。
 *   **対策が自分自身を無効化していた**。
 *
 * ■ 分に丸めてよい根拠
 *   カードの表示は「経過 2:01:00」＝**分単位**。秒精度は画面に出ない。
 *   ＝signature に秒を持つ理由が無く、分で十分（表示が変わるときだけ作り直す）。
 *
 * @module livesCardSignature
 */

/** @typedef {{ lv?: unknown, recordedCount?: unknown, officialCommentCount?: unknown,
 *   watchCount?: unknown, giftPoints?: unknown, elapsedSec?: unknown,
 *   endedAt?: unknown, thumbnailUrl?: unknown }} LiveCardInput */

/**
 * 経過秒を「表示に効く粒度(分)」へ落とす。
 * ★未取得(null/NaN)は 'x' にして **0分と区別**する
 *   (未取得→0分と潰すと「取得できた瞬間」に作り直しが起きない/誤って起きる)。
 * @param {unknown} elapsedSec
 * @returns {string}
 */
export function elapsedBucketForSignature(elapsedSec) {
  const n = Number(elapsedSec);
  if (typeof elapsedSec !== 'number' || !Number.isFinite(n) || n < 0) return 'x';
  return String(Math.floor(n / 60));
}

/**
 * 配信カード群の署名を作る。前回と同じなら再構築しない。
 * @param {ReadonlyArray<LiveCardInput>|null|undefined} livesData
 * @param {{ liveId?: unknown, topSupportersLength?: unknown }} [reportPreview]
 * @returns {string}
 */
export function buildLivesCardSignature(livesData, reportPreview) {
  const list = Array.isArray(livesData) ? livesData : [];
  const body = list
    .map((l) => {
      const o = l && typeof l === 'object' ? l : {};
      return [
        String(o.lv ?? ''),
        String(o.recordedCount ?? ''),
        String(o.officialCommentCount ?? ''),
        String(o.watchCount ?? ''),
        String(o.giftPoints ?? ''),
        elapsedBucketForSignature(o.elapsedSec),
        o.endedAt ? '1' : '0',
        o.thumbnailUrl ? '1' : '0'
      ].join('|');
    })
    .join('~');
  const rp = reportPreview && typeof reportPreview === 'object' ? reportPreview : {};
  const rpLen = Number(rp.topSupportersLength);
  return `${body}#rp:${String(rp.liveId || '')}:${Number.isFinite(rpLen) ? rpLen : 0}`;
}
