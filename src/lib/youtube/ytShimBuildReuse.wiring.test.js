import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// v0.1.1981: YouTube 系の入口(shim)が、何も変わっていないときに前の組み立て結果を返すこと(配線の固定)。
const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
const popup = readFileSync(new URL('../../extension/popup-entry.js', import.meta.url), 'utf8');

describe('ytNicoShim: 組み立て結果の使い回し', () => {
  it('使い回すのは、記録の控え・顔の控えの番号・配信者の情報が全部同じときだけ', () => {
    expect(shim).toContain('memo.cache === memoCache && memo.ver === (Number(memoCache.ver) || 0) && memo.epoch === buildSideEpoch && memo.sumSig === memoSumSig');
  });
  it('記録が増えたら番号が進む(新しい分を受け取ったとき・全件を読み直したとき・直接届いた行)', () => {
    expect(shim).toContain('if (changed) next.ver = (Number(next.ver) || 0) + 1;');
    // 中身が同じ行では番号を進めない(JSON.stringify は行が大きいほどメインスレッドを止めるので使わない)
    expect(shim).toContain('else if (ytLiveRowMateriallyChanged(old, r))');
    expect(shim).toContain('fullAt: now, ver: 0 }');
    expect(shim).toContain('cur.ver = (Number(cur.ver) || 0) + 1;');
  });
  it('顔の控え(順位表・@名前・後から引いた顔・文字アイコンの見分け)が変わったら使い回さない', () => {
    expect(shim).toContain("k.startsWith('yt_leaderboard_') || k === 'yt_handle_icons' || /^yt_[a-z]{2}_icons$/.test(k) || k === YT_DEFAULT_ICON_STORE_KEY");
    expect(shim).toContain('noteBuildSideKeysChanged(Object.keys(changes));');
    for (const k of ['yt_tw_icons', 'yt_kk_icons', 'yt_ww_icons', 'yt_sr_icons', 'yt_mx_icons', 'yt_tt_icons']) expect(/^yt_[a-z]{2}_icons$/.test(k)).toBe(true);
  });
  it('アーカイブの行がある配信は使い回さない(開始時刻が他の配信のまとめにも左右される)', () => {
    expect(shim).toContain('if (memoCache && memoVer >= 0 && !replayVideoIds.has(vid)) builtMemo.set(lv,');
    expect(shim).toContain('else builtMemo.delete(lv);');
  });
  it('並べ直しも、控えが変わったときだけ', () => {
    expect(shim).toContain('if (c.sorted && c.sortedVer === ver) return c.sorted;');
  });
  it('同じ読み直しでは新しく作る行は 0', () => {
    expect(shim).toContain('shimDiag.rowsMadeLast = 0;');
  });
});

describe('popup: 顔の数え上げは同じ人・同じ顔URL・自分の投稿かどうかごとに1回', () => {
  it('覚え書きの鍵に userId・avatarUrl・自分の投稿かを入れている', () => {
    expect(popup).toContain("\\u0000${String(entry?.avatarUrl ?? '')}\\u0000${isOwnPostedSupportComment(entry, lid, list) ? '1' : '0'}`;");
    expect(popup).toContain('key = avatarCompareKey(storyGrowthAvatarSrcCandidate(entry, lid, list));');
  });
});
