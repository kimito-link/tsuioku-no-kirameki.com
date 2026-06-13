/**
 * v0.1.663: 複数タブ並列 backfill のスロットプール(純ロジック)。
 *
 * 背景(2026-06-06 「一気に取れない」最後の真因・3視点会議 wf_154e2c9a-2ef で確定):
 *   従来は GLOBAL_BACKFILL_LOCK='nls-heavy-backfill' の【1本】ロックで「全タブ横断・同時1本」に
 *   絞っていた(v0.1.632・前面タブ固まり対策)。だがこれだと6配信を同時に開くと rotation_yield
 *   (90秒譲り合い)で各配信が9件/秒に薄まり、32%等で止まって見える=ユーザー要求「一気に取れ・
 *   %はダメ」を満たせなかった。単一タブなら708件/秒で数秒完走できるのに。
 *
 *   解決: グローバルロック1本を「並列度Nのスロットプール」に置き換える。N本のスロット
 *   ('nls-heavy-backfill-0'..'-(N-1)')のうち空き1つを ifAvailable で取れたタブが走る。N本まで
 *   真に並走、N+1本目以降だけ rotation で待つ。crawl は既に per-tab AbortController で並走可能・
 *   persist は lv 別で無競合なので、唯一の直列化器であるロックだけをゆるめる。
 *
 *   安全のため N=2 から開始(完全並列 N=6 一斉は 429/前面タブ固まり/index race が同時顕在化して
 *   切り分け不能)。N=1 を指定すれば従来と完全同一(巻き戻し可能)。
 *
 * 純関数(navigator/storage を読まない。呼び出し側がスロット取得を行う)。
 *
 * @module backfillSlotPool
 */

/**
 * 並列 backfill のスロット数(同時に backfill できるタブ数)。
 * v0.1.663 は安全に N=2 から開始。実機で429ゼロ・前面タブ固まりなしを確認後に段階的に上げる。
 * 1 にすると従来の「全タブ横断・同時1本」と完全同一(巻き戻し用)。
 */
export const BACKFILL_PARALLEL_SLOTS = 2;

/** スロットロック名の接頭辞。従来の単一ロック名 'nls-heavy-backfill' を踏襲し連番を付ける。 */
export const BACKFILL_SLOT_LOCK_PREFIX = 'nls-heavy-backfill';

/**
 * 並列度 n のスロットロック名一覧を返す。
 * n=1 のとき ['nls-heavy-backfill-0'] の1本(従来の単一ロック相当・同時1本)。
 *
 * @param {number} [n] 並列度(既定 BACKFILL_PARALLEL_SLOTS)
 * @returns {string[]} スロットロック名の配列(長さ n・0始まり連番)
 */
export function backfillSlotLockNames(n = BACKFILL_PARALLEL_SLOTS) {
  const slots = Math.max(1, Math.floor(Number(n) || 0));
  const names = [];
  for (let i = 0; i < slots; i += 1) {
    names.push(`${BACKFILL_SLOT_LOCK_PREFIX}-${i}`);
  }
  return names;
}

/**
 * 「いま空いているスロット」を1つ取って fn を実行する。スロット名を順に ifAvailable で試し、
 * 取れた最初の枠で fn を実行する。全スロットが埋まっていれば実行しない(ran:false=待機側)。
 *
 * tryAcquire(lockName, fn) は「そのロックを今取れたら fn を実行して {ran:true}、取れなければ
 * {ran:false} を返す」関数(呼び出し側が runWhileGlobalLeader/runIfTabLeader を渡す)。
 * これにより本関数は navigator 非依存=純粋にスロット巡回ロジックだけをテストできる。
 *
 * @param {(lockName: string, fn: () => void|Promise<void>) => Promise<{ran: boolean}>} tryAcquire
 *   1スロットを ifAvailable で試すアクワイア関数(実体は runWhileGlobalLeader)。
 * @param {() => void|Promise<void>} fn 空きスロットを取れたタブだけが実行する処理。
 * @param {{ slots?: number }} [opts] slots=並列度(既定 BACKFILL_PARALLEL_SLOTS)。
 * @returns {Promise<{ ran: boolean, slotIndex: number }>}
 *   ran=true なら slotIndex 番のスロットで実行した。全埋まりなら ran:false, slotIndex:-1。
 */
export async function runInBackfillSlot(tryAcquire, fn, opts = {}) {
  if (typeof tryAcquire !== 'function' || typeof fn !== 'function') {
    return { ran: false, slotIndex: -1 };
  }
  const names = backfillSlotLockNames(opts.slots);
  for (let i = 0; i < names.length; i += 1) {
    // 各スロットを順に試す。取れた枠で fn を実行し、取れなければ次の枠へ。
     
    const res = await tryAcquire(names[i], fn);
    if (res && res.ran) {
      return { ran: true, slotIndex: i };
    }
  }
  return { ran: false, slotIndex: -1 };
}
