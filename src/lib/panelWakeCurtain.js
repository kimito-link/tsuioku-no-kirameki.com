/**
 * panelWakeCurtain.js — 「黒いまま」を見せないための、いつでも出せる幕。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザー報告)
 *   ・「まだひっぱたときくろいのでる」        … サイドパネルの幅を変えたとき
 *   ・「たまにスリープモードみたいなときもでる」
 *   ・「しばらく閲覧してないとスリープモードっぽくなる」
 *
 *   ＝【放置 → 戻ってくる】と【引っぱる(幅変更)】の2つで、描き直しが追いつかず
 *     地の色が塗られていない状態(=黒)が見えてしまう。
 *
 * ■ ★なぜ既存の幕では足りないか(コードで確認済み)
 *   初回ロードの幕(`#nlInitialLoadShade`)は【3キャラ+台詞】を既に持っているが、
 *   `dismissInitialLoadShade()` が最後に **shade.remove()** で DOM から消してしまう。
 *   ＝一度畳んだら二度と出せない。だから後から黒くなっても覆えなかった。
 *
 * ■ 方式: 幕を「消さずに畳む」+「必要なら出し直す」
 *   ・DOM から remove しない(hidden 相当のクラスで畳むだけ)
 *   ・復帰(visibilitychange / pageshow)と 幅変更(resize) で出し直す
 *   ・★出したら【必ず自分で畳む】。永久に覆ったままにしない(それは黒画面と同じ害)
 *
 * ■ 掟
 *   - DOM を触るのは呼び出し側。ここは「いつ出す/いつ畳む」を決める純ロジック。
 *   - ★出しっぱなしを防ぐ上限を必ず持つ(fail-safe)。
 *   - 「ごまかし」であることを隠さない: これは描画が追いつくまでの目隠しであって、
 *     遅さそのものを直したわけではない。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @module panelWakeCurtain
 */

/**
 * 復帰とみなす「離れていた時間」の下限。
 * ★短すぎると、タブを一瞬切り替えただけで幕が出てチカチカする。
 *   スリープ復帰(ユーザー報告)は分単位なので、十分に余裕を取る。
 */
export const WAKE_CURTAIN_MIN_AWAY_MS = 20 * 1000;

/**
 * 幕を出しておく最大時間(保険)。これを過ぎたら描画が終わっていなくても畳む。
 * ★覆ったまま放置は「黒いまま」と同じ害なので必ず開ける。
 */
export const WAKE_CURTAIN_MAX_MS = 1500;

/**
 * 幅変更で幕を出したあと、静かになったとみなすまでの時間。
 * ★ドラッグ中は resize が連射されるので、最後の1回から数える。
 */
export const WAKE_CURTAIN_RESIZE_SETTLE_MS = 260;

/**
 * 復帰時に幕を出すべきか。
 *
 * @param {{ hiddenSinceMs?: number|null, nowMs?: number, minAwayMs?: number }} args
 *   hiddenSinceMs: 最後に「見えなくなった」時刻(ms)。null/未設定なら出さない。
 * @returns {boolean}
 */
export function shouldShowOnWake(args) {
  const hiddenSince = Number(args?.hiddenSinceMs);
  if (!Number.isFinite(hiddenSince) || hiddenSince <= 0) return false;
  const now = Number(args?.nowMs);
  if (!Number.isFinite(now)) return false;
  const min = Number.isFinite(Number(args?.minAwayMs))
    ? Number(args.minAwayMs)
    : WAKE_CURTAIN_MIN_AWAY_MS;
  return now - hiddenSince >= min;
}

/**
 * 幅変更で幕を出すべきか。
 * ★高さだけの変化(スクロールバーの出入り等)では出さない=無駄な明滅を作らない。
 *
 * @param {{ prevWidth?: number, nextWidth?: number, minDeltaPx?: number }} args
 * @returns {boolean}
 */
export function shouldShowOnResize(args) {
  const prev = Math.floor(Number(args?.prevWidth) || 0);
  const next = Math.floor(Number(args?.nextWidth) || 0);
  if (prev <= 0 || next <= 0) return false;
  const min = Number.isFinite(Number(args?.minDeltaPx)) ? Number(args.minDeltaPx) : 24;
  return Math.abs(next - prev) >= min;
}

/**
 * 幕を畳んでよいか(出してからの経過と、描画が進んだかで決める)。
 *
 * @param {{ shownAtMs?: number, nowMs?: number, painted?: boolean, maxMs?: number }} args
 *   painted: 覆っている間に中身を描き直せたか(タイル等が在るか)
 * @returns {{ hide: boolean, reason: 'painted' | 'timeout' | 'wait' }}
 */
export function shouldHideCurtain(args) {
  const shownAt = Number(args?.shownAtMs);
  const now = Number(args?.nowMs);
  if (!Number.isFinite(shownAt) || !Number.isFinite(now)) {
    return { hide: true, reason: 'timeout' }; // 状態が壊れていたら開ける(閉じ込めない)
  }
  const max = Number.isFinite(Number(args?.maxMs)) ? Number(args.maxMs) : WAKE_CURTAIN_MAX_MS;
  if (now - shownAt >= max) return { hide: true, reason: 'timeout' };
  if (args?.painted === true) return { hide: true, reason: 'painted' };
  return { hide: false, reason: 'wait' };
}

/**
 * 幕に出す台詞(キャラの掛け合い)。理由ごとに変える。
 * ★「読み込み中」だと嘘になる場合があるので、状況に合った言い方にする。
 *
 * @param {'wake' | 'resize'} reason
 * @returns {string}
 */
export function curtainSerif(reason) {
  if (reason === 'resize') return 'ひっぱってるねー ちょっとまってねー';
  return 'おかえりー いま出しなおすねー';
}
