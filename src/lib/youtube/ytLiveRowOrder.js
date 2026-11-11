/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】配信コメントの並びと「中身が変わったか」の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】生放送のコメントを全件ソートし直さずに足す判断はここだけ
 *
 * ytLiveRowOrder.js — コメントが増えるたびに全件を並べ直すと、遅い PC で
 * メインスレッドが 100ms を超えて画面が固まる。新しい行は末尾に足す。
 */

/** 組み立てをこの行数ごとに画面へ返す。6倍遅くしても 1 区切りが 16ms を超えない行数。 */
export const YT_BUILD_YIELD_ROWS = 40;

/** この行数以上の組み立ては、区切って画面へ手を返す */
export const YT_BUILD_YIELD_MIN_ROWS = 1000;

/** 保存の知らせ(chrome.storage)は、この間隔より細かく出さない */
export const YT_CHAT_STORAGE_FLUSH_MS = 400;

/** 画面の組み立て直しは、この間隔より細かく重ねない */
export const YT_NOTIFY_MIN_GAP_MS = 250;

/** IndexedDB へ書くときの1回の件数。40件だと 4倍遅くした条件で 1 回が 100ms を超えた。 */
export const YT_IDB_APPEND_CHUNK = 8;

/**
 * @param {unknown} rows
 * @returns {boolean}
 */
export function shouldYieldYtBuild(rows) {
  const n = Number(rows);
  return Number.isFinite(n) && n >= YT_BUILD_YIELD_MIN_ROWS;
}

/**
 * @param {any} row
 * @returns {string}
 */
export function ytLiveRowKey(row) {
  return String(row?.pk || row?.id || '');
}

/**
 * 画面と保存に効くフィールドだけを比べる。JSON.stringify は行が大きいほど
 * メインスレッドを止めるので使わない。
 * @param {any} prev
 * @param {any} next
 * @returns {boolean}
 */
export function ytLiveRowMateriallyChanged(prev, next) {
  if (!prev || !next) return true;
  if (prev === next) return false;
  return (
    prev.text !== next.text ||
    prev.name !== next.name ||
    prev.iconUrl !== next.iconUrl ||
    prev.recordedAt !== next.recordedAt ||
    prev.kind !== next.kind ||
    prev.amount !== next.amount ||
    prev.currency !== next.currency ||
    prev.channelId !== next.channelId ||
    prev.login !== next.login ||
    prev.postedAtMs !== next.postedAtMs ||
    prev.badge !== next.badge
  );
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function byRecordedAt(a, b) {
  return Number(a?.recordedAt || 0) - Number(b?.recordedAt || 0);
}

/**
 * 受け取った時刻順の配列に、新しい行を足す。
 * 新しい行がすべて末尾以上なら、その分だけ並べる。途中に入るときだけ全件を並べる。
 * 置き換え(同じキーの更新)は、古い行を外してから並べる。
 *
 * @param {any[] | null | undefined} sorted いまの並び(古い順)。壊さない。
 * @param {any[] | null | undefined} pending 足す行、または置き換える行
 * @param {boolean} [replacements] pending に既存キーの更新が含まれる
 * @returns {any[]}
 */
export function mergeLiveRowsByRecordedAt(sorted, pending, replacements = false) {
  const base = Array.isArray(sorted) ? sorted : [];
  const add = (Array.isArray(pending) ? pending : []).filter((row) => row && ytLiveRowKey(row));
  if (!add.length) return base.slice();
  if (!base.length) return add.slice().sort(byRecordedAt);
  if (replacements) {
    const drop = new Set(add.map((row) => ytLiveRowKey(row)));
    const kept = [];
    for (const row of base) {
      if (!drop.has(ytLiveRowKey(row))) kept.push(row);
    }
    return kept.concat(add).sort(byRecordedAt);
  }
  const last = Number(base[base.length - 1]?.recordedAt || 0);
  let older = false;
  for (const row of add) {
    if (Number(row?.recordedAt || 0) < last) {
      older = true;
      break;
    }
  }
  const tail = add.length === 1 ? add : add.slice().sort(byRecordedAt);
  if (!older) return base.concat(tail);
  return base.concat(add).sort(byRecordedAt);
}
