/**
 * 0.1.1958: 横の欄の「切り替わる直前の古い画面」が、次の配信を描いてしまわないよう少し待つ。
 *
 * 外枠(sidepanel-iframe-boot-entry)は配信ごとに iframe を作り直す(0.1.1949)。ところが前面の配信が
 * 別のサービスに変わった瞬間、古い iframe の popup が先に新しい配信のコメントを聞きに来ることがある
 * (計器 contentPlatformMismatch・PC 実測で切替の瞬間に 1)。そのまま答えると、まもなく消える画面が
 * 新しい配信の全行を組み立てる(Kick 約8,000行で数百 ms の無駄)。
 *
 * そこで「外枠が焼いたサービスと違う配信を聞かれた」ときは、最初の食い違いから graceMs までは返事を待たせる。
 * 外枠が作り直せば画面ごと消えるので何も描かれない。作り直されなかったとき(想定外)は graceMs 後に
 * いつもどおり答える=止まったままにはならない。
 *
 * @param {{ graceMs?: number, now: () => number, sleep: (ms: number) => Promise<void> }} deps
 */
export function createStaleFrameHold(deps) {
  const graceMs = Math.max(0, Number(deps.graceMs ?? 3000));
  let firstAt = -1;
  let held = 0;
  return {
    /**
     * @param {boolean} mismatched 外枠のサービスと聞かれた配信のサービスが違うか
     * @returns {Promise<boolean>} 待たせたら true
     */
    async wait(mismatched) {
      if (!mismatched) return false;
      const t = deps.now();
      if (firstAt < 0) firstAt = t;
      const left = firstAt + graceMs - t;
      if (left <= 0) return false;
      held += 1;
      await deps.sleep(left);
      return true;
    },
    /** 待たせた回数(計器) */
    heldCount: () => held,
  };
}
