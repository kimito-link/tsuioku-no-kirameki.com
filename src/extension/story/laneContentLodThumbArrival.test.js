import { describe, it, expect } from 'vitest';
import { shouldRenderHollow } from './laneContentLod.js';

/**
 * ★v0.1.1441 で LOD を止めた退化(「取れるべきサムネがおちてた」)を、
 *   **判定の側で**構造的に塞ぐ。
 *
 * ■ 何が起きていたか(ユーザー報告・2026-08-19)
 *   サムネは **あとから届く**。描画時点で未到着だと `hasRealThumb=false` で
 *   hollow(枠だけ)になり、そのタイルは画面外に居続ける。
 *   ★後から届いたサムネが **永久に出ない**。
 *
 * ■ ★会議の解(MutationObserver で img 挿入を検知)は【この実装では成立しない】
 *   司令塔がコードで確認: `avatarObserved` は
 *   `resolveUserEntryAvatarSignals()`(content-entry.js:10697)が返す
 *   **データ上のフラグ**であって、DOM への img 挿入イベントではない。
 *   ＝ MutationObserver では捕まえられない。**新しい observer は解にならない。**
 *
 * ■ ★正しい構造(既にある仕組みに乗る＝新しい配線を増やさない)
 *   `displaySrc` は **既に `storyLaneTierBodyKey` に入っている**
 *   (renderStoryUserLaneDom.js:284)。
 *   ＝**サムネが届いて displaySrc が変われば、その段は必ず再描画される**。
 *   だから「再描画のときに hollow にしない」判定さえ正しければ、
 *   後着サムネは**次の再描画で自然に入る**。
 *   ★observer を1本も足さない ＝ 批判役が刺した
 *   「observer がメインスレッドを圧迫する」懸念も同時に消える。
 *
 * ■ ★このテストが固定すること
 *   「サムネを持っている人は、いかなる条件でも hollow にしない」。
 *   これが守られる限り、**サムネが落ちることは原理的に無い**。
 */
describe('★サムネが届いた人を hollow にしない(v0.1.1441 退化の根治)', () => {
  const base = {
    laneName: 'tanu', index: 100, hasRealThumb: false, hasWrap: false, alreadyFilled: false
  };

  it('★★実サムネを持つ人は hollow にしない(何枚目でも)', () => {
    for (const index of [25, 100, 999]) {
      expect(
        shouldRenderHollow({ ...base, index, hasRealThumb: true }, true),
        `${index}枚目でサムネ持ちを hollow にした=サムネが落ちる`
      ).toBe(false);
    }
  });

  it('★サムネ未到着(匿名)は hollow にしてよい=軽くなる本体', () => {
    expect(shouldRenderHollow({ ...base, hasRealThumb: false }, true)).toBe(true);
  });

  it('★★これが要点: 同じ人がサムネ未到着→到着に変わったら hollow をやめる', () => {
    // 1回目の描画: まだ届いていない → 枠だけ(軽い)
    expect(shouldRenderHollow({ ...base, hasRealThumb: false }, true)).toBe(true);
    // ★サムネ到着後の再描画(displaySrc が変わるので diff-skip は必ず通す)
    //   → 中身ありで描く = ユーザーにサムネが見える
    expect(
      shouldRenderHollow({ ...base, hasRealThumb: true }, true),
      'サムネ到着後も hollow のまま=v0.1.1441 の退化が戻っている'
    ).toBe(false);
  });

  it('★一度中身を詰めた人は戻さない(churn 再生産の防止・一方通行)', () => {
    expect(shouldRenderHollow({ ...base, alreadyFilled: true }, true)).toBe(false);
  });

  it('★会場モード(③)は対象外(3D変形で可視判定が壊れる前科)', () => {
    expect(shouldRenderHollow({ ...base, hasWrap: true }, true)).toBe(false);
  });

  it('★たぬ姉段以外は対象外(MVPの範囲を勝手に広げない)', () => {
    for (const laneName of ['link', 'konta', 'gift', 'ad']) {
      expect(shouldRenderHollow({ ...base, laneName }, true)).toBe(false);
    }
  });

  it('★先頭は常に中身あり(最初に見える範囲は絶対に欠けさせない)', () => {
    /*
     * ★境界: `LANE_CONTENT_LOD_EAGER_HEAD = 24` で `index >= 24` が hollow。
     *   index は0起点なので **0〜23 の24枚**が中身あり、**24枚目(index=24)から**枠だけ。
     *   ★私は最初 index=24 を「25枚目だから中身あり」と書いて赤にした
     *     = 0起点/1起点の取り違え。実装ではなくテストが誤っていた。
     */
    for (const index of [0, 23]) {
      expect(shouldRenderHollow({ ...base, index }, true), `index=${index}`).toBe(false);
    }
    expect(shouldRenderHollow({ ...base, index: 24 }, true), 'index=24 は hollow 側').toBe(true);
  });

  it('★kill switch が false なら何があっても hollow にしない(撤回の1手)', () => {
    expect(shouldRenderHollow({ ...base }, false)).toBe(false);
  });
});
