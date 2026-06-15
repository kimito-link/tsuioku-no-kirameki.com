/**
 * v0.1.642: backfill の rotation_yield(90秒強制打ち切り)を「待機している別タブが居るときだけ」
 * 発火させる判定(純ロジック)。
 *
 * 背景(2026-06-05 「一気に取れない」退行の git 追跡で確定):
 *   一気に取れていた頃(v0.1.418)には無かった rotation_yield(GLOBAL_BACKFILL_ROTATION_MS=90秒・
 *   v0.1.606 で「長時間配信でページが応答しません」対策として導入)が、90秒で backfill を強制 abort し、
 *   長時間配信を遡り切る前に打ち切っていた。グローバルロックと組み合わさると、譲った後に自タブが
 *   再開されず「全部とれない(2.8〜14.7%)」退行になっていた。
 *
 *   rotation が本来守るのは「**待機している別タブにロックを譲る**」こと。譲る相手(=他の watch タブで
 *   backfill 待ちのもの)が居なければ、90秒で打ち切る理由は無い。単一タブ(=実機の大半・ユーザー証言の
 *   状況)では rotation を発火させず、わんコメのように配信開始まで一気に掘り切る。
 *   多タブ時は従来どおり90秒で譲る(v0.1.606 の応答性対策・429防止を温存)。
 *
 *   重さ(ページが応答しません)は別レイヤで対処済み: backfillYieldToPage(6区画ごと scheduler.yield)が
 *   メインスレッドを返す主役。スクロール重さ根治 Phase1(paint最適化・v0.1.637-639)も別途。
 *   よって「単一タブで rotation を止めても重くならない」。
 *
 * 純関数(storage を読まない。呼び出し側が待機タブ一覧を渡す)。
 *
 * @module backfillRotationGate
 */

/**
 * rotation_yield(90秒打ち切り)を発火させるべきか判定する。
 *
 * @param {object} args
 * @param {string[]|null|undefined} args.waitingLiveIds 現在 backfill 待ちの liveId 一覧
 *   (listBackfillWaitingLiveIds の結果)。
 * @param {string} args.selfLiveId 自タブの liveId。
 * @returns {boolean} true なら rotation を発火(=90秒で譲る)。false なら掘り切る(単一タブ)。
 */
export function shouldFireBackfillRotation(args) {
  const self = String(args?.selfLiveId || '').trim().toLowerCase();
  const list = Array.isArray(args?.waitingLiveIds) ? args.waitingLiveIds : [];
  // 自分以外で backfill を待っているタブが 1 つでもあれば譲る(rotation 発火)。
  const others = list
    .map((x) => String(x || '').trim().toLowerCase())
    .filter((x) => /^lv\d{1,15}$/.test(x) && x !== self);
  return others.length > 0;
}

/**
 * v0.1.663: 並列スロット対応版の rotation 判定。
 *
 * 従来の shouldFireBackfillRotation は「待機タブが1つでも居れば譲る」だったが、並列度 N の
 * スロットプール化に伴い「**空きスロットが無い(待機タブ数 >= N)時だけ譲る**」に条件強化する。
 * N=2 なら、待機タブが1つ(=2配信目)はまだスロットに空きがあるので譲らず両方並走。3配信目
 * 以降(待機タブ >= 2)で初めて90秒交代を発火する。
 *
 * parallelSlots=1 を渡すと others.length >= 1 ＝ 既存 shouldFireBackfillRotation とビット同値
 * (=単一タブは絶対に譲らない・v0.1.642 を1bitも壊さない)。
 *
 * @param {object} args
 * @param {string[]|null|undefined} args.waitingLiveIds 現在 backfill 待ちの liveId 一覧。
 * @param {string} args.selfLiveId 自タブの liveId。
 * @param {number} [args.parallelSlots] 並列度 N(既定 1=従来互換)。
 * @returns {boolean} true なら rotation を発火(=90秒で譲る)。
 */
export function shouldFireBackfillRotationWithSlots(args) {
  const self = String(args?.selfLiveId || '').trim().toLowerCase();
  const list = Array.isArray(args?.waitingLiveIds) ? args.waitingLiveIds : [];
  const slots = Math.max(1, Math.floor(Number(args?.parallelSlots) || 1));
  const others = list
    .map((x) => String(x || '').trim().toLowerCase())
    .filter((x) => /^lv\d{1,15}$/.test(x) && x !== self);
  // 空きスロットが無い(自分以外の待機タブ数がスロット数以上)時だけ譲る。
  return others.length >= slots;
}
