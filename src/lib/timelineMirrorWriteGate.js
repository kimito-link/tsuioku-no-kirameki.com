/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】コメントタイムライン鏡を「同じ配信につき最短 N 秒に1回」にする判定
 * 【この箱に入らないもの】storage / タイマー / DOM / chrome.*
 * 【書けるstorageキー】なし(書くのは content-entry.js)
 * 【正本宣言】コメントタイムライン鏡の書き込み間隔の下限はこのファイルのみ
 *
 * timelineMirrorWriteGate.js — nls_comment_timeline_mirror_v1 の書き込み頻度の天井。
 *
 * ■ なぜ要るか(2026-10-08・実機の census: 35分で各拡張画面に届いた通知)
 *   nls_comment_timeline_mirror_v1 が約1,670回・242MB(1回約145KB)。全拡張画面(status・サイドパネル・視聴ページの popup)に
 *   旧値+新値が全文で配られ、拡張プロセスの1本のスレッドが毎秒約350KB を読み込み直していた(通知の中で最大)。
 *   既存の「内容が同じなら書かない」署名は、過去ログ取り込み(backfill)や2配信同時記録で内容が頻繁に変わるため効かなかった。
 *
 * ■ 守ること
 *   1. 間引くのは頻度だけ。内容は変えない。間引いた分は呼び出し側が最短間隔の後に【最新の状態で1回】書き直す(末尾の追いつき)。
 *   2. 判定できないとき(壊れた入力・時計の巻き戻り)は書く側に倒す(鏡が止まりっぱなしになる事故を作らない)。
 *   3. 鏡の用途は「コメントが流れる動き」の表示(status・純Web)。8秒おきでも流れは保たれる。記録(コメント保存)には関係しない。
 *
 * @module timelineMirrorWriteGate
 */

/** 同じ配信への書き込みの最短間隔[ms]。 */
export const TIMELINE_MIRROR_MIN_INTERVAL_MS = 8000;

/**
 * @param {{ nowMs?: number, lastWriteAt?: number, minIntervalMs?: number }} [args]
 * @returns {{ write: boolean, retryInMs: number }} write=false のときだけ retryInMs(≥1)後に再試行する
 */
export function decideTimelineMirrorWrite(args) {
  const a = args && typeof args === 'object' ? args : {};
  const now = Number(a.nowMs);
  const last = Number(a.lastWriteAt);
  const min = Number.isFinite(Number(a.minIntervalMs)) && Number(a.minIntervalMs) > 0 ? Number(a.minIntervalMs) : TIMELINE_MIRROR_MIN_INTERVAL_MS;
  if (!Number.isFinite(now) || !Number.isFinite(last) || last <= 0 || now < last) return { write: true, retryInMs: 0 };
  const elapsed = now - last;
  if (elapsed >= min) return { write: true, retryInMs: 0 };
  return { write: false, retryInMs: Math.max(1, Math.ceil(min - elapsed)) };
}
