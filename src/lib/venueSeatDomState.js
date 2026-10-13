/**
 * 【層】L0 判定層(DOM を触るが「値が違うときだけ書く」だけの薄い部品。chrome.*・storage・fetch は無い)
 * 【この箱に入るもの】会場の席(.nlsb-seat)の状態(空/リンク/VIP/aria/title/連投段)を、変わったときだけ DOM へ書く処理
 * 【この箱に入らないもの】席の割り当て・順位・段の判定(正本は venueSeats.js / venueLaneMirrorSupply.js)
 * 【書けるstorageキー】なし
 * 【正本宣言】席の class / aria-hidden / title / data-streak を書く唯一の入口はこのファイル
 *
 * ★なぜ要るか(2026-10-13 実測・実機データ入りの再現環境・視聴ページ)
 *   会場を開くと視聴ページのメインスレッドが 98% 使われ(閉じると 35%)、読み上げが追いつかなかった。
 *   会場(.nlsb-root)の DOM 変更を 15 秒数えたら【108,250 件】(約 7,200 件/秒)。うち 106,121 件が席の
 *   class / aria-hidden / title の再設定だった(値が同じでも setAttribute / classList.add は変更として記録される)。
 *   renderSeats は毎回、全席をいったん「空」へ戻してから、見える席だけ飾り直していたため、
 *   1席あたり1回の描画で約10回の書き込みになり(300席×約6回/秒)、
 *   ニコ生のページが読み込んでいる Microsoft Clarity(画面記録)が変更のたびに DOM を調べて(querySelectorAll 約4秒/15秒)、
 *   ブラウザのスタイル再計算も回り続けた。
 *
 * ★直し方: 「空へ戻す」「飾る」は【この描画で望む最終状態】(next)を作るだけにして、最後に1回だけ、
 *   今の DOM と違う項目だけを書く。最終状態が前回と同じなら DOM への書き込みは0件。
 *   (描画全体を丸ごと省略する sig-skip は v0.1.1032 でちらつきを起こした地雷なので使わない=毎回計算し、書くのだけを絞る)
 *
 * @module venueSeatDomState
 */

/**
 * 席の「この描画で望む最終状態」の初期値(=空の席)。
 * @returns {{ empty: boolean, link: boolean, vip: boolean, aria: string, title: string, streak: number }}
 */
export function createEmptySeatState() {
  return { empty: true, link: false, vip: false, aria: 'true', title: '', streak: 0 };
}

/** @param {{ contains: (t: string) => boolean, add: (t: string) => void, remove: (t: string) => void }} cl @param {string} token @param {boolean} on */
function setClassIf(cl, token, on) {
  if (cl.contains(token) === on) return;
  if (on) cl.add(token);
  else cl.remove(token);
}

/**
 * 席要素へ最終状態を書く。今と同じ項目には一切触れない(=MutationObserver にも Clarity にも見えない)。
 * @param {{
 *   classList: { contains: (t: string) => boolean, add: (t: string) => void, remove: (t: string) => void },
 *   getAttribute: (n: string) => string|null, setAttribute: (n: string, v: string) => void, removeAttribute: (n: string) => void,
 *   dataset: Record<string, string|undefined>
 * }} seat
 * @param {ReturnType<typeof createEmptySeatState>|null|undefined} next
 */
export function flushVenueSeatState(seat, next) {
  if (!seat || !next) return;
  const cl = seat.classList;
  setClassIf(cl, 'nlsb-is-empty', next.empty === true);
  setClassIf(cl, 'nlsb-seat-link', next.link === true);
  setClassIf(cl, 'nlsb-seat-vip', next.vip === true);
  setClassIf(cl, 'nlsb-seat-regular', false); // 旧仕様の印。常に外す(付いていなければ何も書かない)
  if (seat.getAttribute('aria-hidden') !== next.aria) seat.setAttribute('aria-hidden', next.aria);
  const title = String(next.title || '');
  if (title) {
    if (seat.getAttribute('title') !== title) seat.setAttribute('title', title);
  } else if (seat.getAttribute('title') !== null) {
    seat.removeAttribute('title');
  }
  const streak = Math.max(0, Math.floor(Number(next.streak) || 0));
  if (streak > 0) {
    const want = String(streak);
    if (seat.dataset.streak !== want) seat.dataset.streak = want;
  } else if (seat.dataset.streak !== undefined) {
    delete seat.dataset.streak;
  }
}
