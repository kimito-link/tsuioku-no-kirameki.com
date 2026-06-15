/**
 * 取得スピード(records/sec)の算出と健康スコア化(純ロジック)。
 *
 * 背景(2026-06-05 退行の自動検出・ユーザー提案):
 *   「機能は一気にローディング無しで撮れてたのに、それも無視されてる」=過去ログ取得(backfill)が
 *   止まっているのに「取得中」表示だけ出る退行を、手動でなく**数値で**捕まえたい。
 *   記録件数の単位時間あたり増加(records/sec)を出せば、backfill が走っていれば高く・止まっていれば
 *   0 付近になり、「取得が止まった配信」が status で赤く見える。
 *
 * 純関数(時刻・件数は呼び出し側が渡す。Date.now を内部で呼ばない=テスト容易)。
 *
 * @module recordRate
 */

/**
 * 直近サンプル(前回件数・前回時刻)と今回(件数・時刻)から取得スピード(records/sec)を出す。
 *
 * @param {object} args
 * @param {number|null|undefined} args.prevCount 前回の記録件数。
 * @param {number|null|undefined} args.prevAtMs 前回サンプルの時刻(ms)。
 * @param {number|null|undefined} args.curCount 今回の記録件数。
 * @param {number|null|undefined} args.curAtMs 今回サンプルの時刻(ms)。
 * @returns {number|null} records/sec。算出不能(初回・時刻逆行・0除算)は null。
 *   件数が減った場合(配信切替・再集計)は 0 を返す(負のレートは出さない)。
 */
export function computeRecordRate(args) {
  const prevCount = Number(args?.prevCount);
  const prevAt = Number(args?.prevAtMs);
  const curCount = Number(args?.curCount);
  const curAt = Number(args?.curAtMs);
  if (
    !Number.isFinite(prevCount) ||
    !Number.isFinite(prevAt) ||
    !Number.isFinite(curCount) ||
    !Number.isFinite(curAt)
  ) {
    return null;
  }
  const dtMs = curAt - prevAt;
  if (dtMs <= 0) return null; // 時刻逆行・同時刻は算出しない
  const dCount = curCount - prevCount;
  if (dCount <= 0) return 0; // 増えていない/減った(配信切替等)は 0
  return (dCount / dtMs) * 1000;
}

/**
 * 取得スピードを 0〜5 の健康スコアにする。
 *
 * ⚠️ 「速い=健康」ではなく「期待される取得が進んでいるか」を見たい。基準:
 *   - rate > 0 = 何かしら取れている。完走間際は新規が減り rate が下がるのが正常なので、
 *     **取得率(capturePct)が十分高ければ rate が低くても減点しない**(完走を不健康と誤判定しない)。
 *   - 取得率が低い(まだ取り切れてない)のに rate≈0 = backfill が止まっている疑い=減点。
 *
 * @param {object} args
 * @param {number|null|undefined} args.recordRate records/sec(computeRecordRate の結果)。
 * @param {number|null|undefined} args.capturePct 取得率(記録/公式 ×100)。
 * @returns {number} 0〜5。
 */
export function scoreRecordProgress(args) {
  // null/undefined は「未測定」として NaN 扱いにする(Number(null)=0 の誤判定を避ける)。
  const rate = args?.recordRate == null ? NaN : Number(args.recordRate);
  const pct = args?.capturePct == null ? NaN : Number(args.capturePct);
  // 取得率が十分高い(95%+)= ほぼ完走。新規が来ない限り rate≈0 は正常 → 満点。
  if (Number.isFinite(pct) && pct >= 95) return 5;
  // rate 不明 = まだ測れていない(初回)→中庸の 3(白でも黒でもない)。
  if (!Number.isFinite(rate)) return 3;
  // 取り切れていない(pct<95)のに rate がほぼ 0 = 取得停滞=赤信号。
  if (rate <= 0.05) {
    // 取得率が高め(80%+)なら停滞でも軽症(完走間際)。低いほど重症。
    if (Number.isFinite(pct) && pct >= 80) return 3;
    if (Number.isFinite(pct) && pct >= 50) return 2;
    return 0; // 取得率低 & 取得停止 = 最悪(まさに「全部とれない」退行)
  }
  // rate が出ている = 取得が進んでいる。速いほど高評価。
  if (rate >= 20) return 5;
  if (rate >= 8) return 4;
  if (rate >= 2) return 3;
  return 2; // わずかでも進んでいる
}
