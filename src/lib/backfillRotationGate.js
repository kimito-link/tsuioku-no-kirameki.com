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

/**
 * v0.1.751「視聴中タブが裏タブにスロットを食われ飢餓(歌枠34%停滞)」根治: 自タブの backfill が、
 * 別配信を視聴中(前面/優先)のタブにスロットを譲るべきかを判定する純関数。
 *
 * 真因(実機 2026-06-15 lv350759040): onTabVisibleForCommentHarvest が視聴中 lv を
 *   setBackfillPriorityLiveId で storage.session に記録するが、スロット取得(runInBackfillSlot)も
 *   既存の rotation/onHidden 譲り判定も「どの lv が優先(視聴中)か」を見ておらず、裏タブが
 *   スロットを握り続けて視聴中タブの backfill を飢餓させていた(34%で「いっきにとれない」)。
 *
 * 設計(storage を読まない純関数=呼び出し側が priority/waiter/visible を渡す。TDD・単体テスト可):
 *   「自分は優先 lv 本人ではなく、別の【新鮮な】優先 lv が今スロットを待っている/スロットが満杯」
 *   のときだけ true(=自タブは開始を見送る or 走行中なら譲る)。視聴中タブ本人は優先 lv なので
 *   条件②で必ず除外され、絶対に自分自身に譲らない。空きスロットがあるなら優先タブは素直に空きを
 *   取れるので譲る必要は無い(無駄 abort 防止)。優先 lv が 120秒で期限切れ(priorityIsFresh=false)
 *   なら、閉じた/離れた視聴タブが裏 backfill を永久ブロックしないよう譲らない。
 *
 * @param {object} args
 * @param {string} args.selfLiveId 自タブの liveId。
 * @param {string|null|undefined} args.priorityLiveId 現在の視聴中(優先) lv
 *   (readBackfillPriorityLiveId().liveId)。無/期限切れなら null/''。
 * @param {boolean} args.priorityIsFresh 優先記録が 120秒の有効期間内か
 *   (呼び出し側が now - at < 120_000 を計算して渡す)。
 * @param {boolean} args.amIVisible 自タブが現在 visible か(document.visibilityState==='visible')。
 * @param {string[]|null|undefined} args.waitingLiveIds backfill 待ちの liveId 一覧
 *   (listBackfillWaitingLiveIds の結果)。
 * @param {number} [args.parallelSlots] 並列度 N(既定 1=従来互換)。
 * @returns {boolean} true なら「優先(視聴中)タブのために自タブはスロットを譲る/開始を見送る」。
 */
export function shouldYieldBackfillSlotToPriority(args) {
  if (!args) return false;
  // ① 優先記録が新鮮で、かつ有効な lv であること(期限切れ/無は譲らない=裏を永久ブロックしない)。
  if (!args.priorityIsFresh) return false;
  const priority = String(args.priorityLiveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(priority)) return false;
  // ② 自分が優先(視聴中)lv 本人なら絶対に譲らない(自分自身に譲らない=視聴中タブ巻き込み防止)。
  const self = String(args.selfLiveId || '').trim().toLowerCase();
  if (self === priority) return false;
  // ③ 優先タブが実際にブロックされている時だけ譲る: 優先 lv が待機列に居る、または
  //    自分以外の待機タブがスロット数以上で満杯(=空きが無く優先タブが取れない)。空きがあるなら
  //    優先タブは素直に空きスロットを取れるので、ここで裏 backfill を abort する必要は無い(無駄 abort・
  //    スラッシング防止)。amIVisible は将来の調整余地として受け取るが、②で視聴中タブは既に除外済み。
  const list = Array.isArray(args.waitingLiveIds) ? args.waitingLiveIds : [];
  const normalized = list
    .map((x) => String(x || '').trim().toLowerCase())
    .filter((x) => /^lv\d{1,15}$/.test(x));
  const slots = Math.max(1, Math.floor(Number(args.parallelSlots) || 1));
  const others = normalized.filter((x) => x !== self);
  const priorityIsWaiting = normalized.includes(priority);
  const slotsFull = others.length >= slots;
  return priorityIsWaiting || slotsFull;
}
