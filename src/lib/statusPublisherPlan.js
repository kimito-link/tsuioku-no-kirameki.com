/**
 * 【層】L0 判定層(純粋関数・I/O禁止。locks 等は引数で受け取る)
 * 【この箱に入るもの】「サイドパネルの中に、見えない状態画面(送信担当)を置くか」の判定と、その排他の取り方
 * 【この箱に入らないもの】DOM・storage・chrome.*(呼び出し側 statusPublisherHost.js / status-entry.js が行う)
 * 【書けるstorageキー】なし
 * 【正本宣言】「送信担当の状態画面を起動してよいか」の判定はこのファイルのみ
 *
 * ★なぜ(2026-10-15・ユーザー「画面のタブがなくても送信できる形」):
 *   状態画面(status.html)は document.hidden で更新を止める作り(電池/CPU節約)=タブが前面に出ているときしか送信しない。
 *   状態速報を貼り付けなしで読むため(自動送信)に、利用者がタブを前面に出し続ける必要があった。
 *   → サイドパネル(開いている間は常に可視)の中に1ピクセルの見えない状態画面を置き、そこから送信する。
 *   既存の部品(状態画面のコード・自動送信の判定 autoPublishDecision)を【そのまま】使う=新しい仕組みは作らない。
 *
 * ★起動条件(誰にも迷惑をかけない): 共有キーと自動公開の同意が【両方】入っている利用者だけ。
 *   それ以外(ストア利用者を含む)では何も起きない。
 * @module statusPublisherPlan
 */

/** 送信担当を1つにするためのロック名(Web Locks)。 */
export const STATUS_PUBLISHER_LOCK = 'nls-status-publisher';
/** サイドパネルが開いてからこの時間(ms)待って起動する=開いた直後の幕を重くしない。 */
export const STATUS_PUBLISHER_START_DELAY_MS = 15_000;
/** まだ起動していないときの再確認の間隔(ms)(別のパネルが閉じてロックが空いたら引き継ぐ)。 */
export const STATUS_PUBLISHER_RECHECK_MS = 60_000;
/** 送信担当として開く状態画面の相対URL。 */
export const STATUS_PUBLISHER_PATH = 'status.html?publisher=1';

/**
 * @param {{ hasKeys?: boolean, optedIn?: boolean, lockHeld?: boolean, alreadyStarted?: boolean, hidden?: boolean }} input
 * @returns {{ start: boolean, reason: string }}
 */
export function decideStatusPublisherStart(input) {
  const a = input && typeof input === 'object' ? input : {};
  if (a.alreadyStarted === true) return { start: false, reason: 'already_started' };
  // ★同意が最優先(送信内容に視聴者のID・表示名・コメント本文が含まれる=明示同意なしでは何も起動しない)。
  if (a.optedIn !== true) return { start: false, reason: 'no_consent' };
  if (a.hasKeys !== true) return { start: false, reason: 'no_keys' };
  if (a.hidden === true) return { start: false, reason: 'panel_hidden' };
  if (a.lockHeld === true) return { start: false, reason: 'another_publisher' };
  return { start: true, reason: 'ok' };
}

/** @param {unknown} search location.search @returns {boolean} 送信担当モードで開かれたか */
export function isStatusPublisherMode(search) {
  try {
    return new URLSearchParams(String(search ?? '')).get('publisher') === '1';
  } catch {
    return false;
  }
}

/**
 * 送信担当のロックを取る。取れたら保持し続ける(ページが閉じるまで)。取れなければ false。
 * @param {{ request?: Function }|null|undefined} locks navigator.locks 相当
 * @param {string} [name]
 * @returns {Promise<boolean>}
 */
export function acquireStatusPublisherLock(locks, name = STATUS_PUBLISHER_LOCK) {
  return new Promise((resolve) => {
    try {
      if (!locks || typeof locks.request !== 'function') { resolve(true); return; } // Web Locks が無い環境は排他なしで動く(機能を失わない)
      void Promise.resolve(
        locks.request(name, { ifAvailable: true }, (/** @type {unknown} */ lock) => {
          if (!lock) { resolve(false); return undefined; }
          resolve(true);
          return new Promise(() => {}); // 保持し続ける(ページが閉じればロックは自動で解放される)
        })
      ).catch(() => resolve(true));
    } catch {
      resolve(true);
    }
  });
}

/**
 * ロックが誰かに保持されているか。
 * @param {{ query?: Function }|null|undefined} locks
 * @param {string} [name]
 * @returns {Promise<boolean>}
 */
export async function isStatusPublisherLockHeld(locks, name = STATUS_PUBLISHER_LOCK) {
  try {
    if (!locks || typeof locks.query !== 'function') return false;
    const st = await locks.query();
    return Array.isArray(st?.held) && st.held.some((/** @type {any} */ l) => l && l.name === name);
  } catch {
    return false;
  }
}
