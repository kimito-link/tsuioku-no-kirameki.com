import { describe, expect, it } from 'vitest';
import { applyLaneRosterKeeper, makeLaneRosterKeeperState } from './laneRosterKeeper.js';

/**
 * v0.1.1232 Phase 2: 応援レーンの「名簿キーパー」。
 *
 * ユーザー確定の不変条件:
 *   「とにかく1度出た人は制限がなくずっと出るように」
 *   = その配信に来た人は、増えることはあっても、減って消えることは絶対にない。
 *
 * ★計器(laneRosterDelta)は観測のまま残し、描画用の名簿はこちらが持つ
 *   (計器を制御に流用すると「計器が壊れたら描画も壊れる」結合になる)。
 *
 * 正本: lane-never-drop-SPEC.md §4 1-1
 */

/** 実際の候補行の形(popup-entry.js が作る candidates の要素)。 */
const row = (uid, over = {}) => ({
  entryIndex: 0,
  profileTier: 3,
  thumbScore: 0,
  displaySrc: `https://example.test/${uid}.jpg`,
  title: `ユーザー${uid}`,
  entry: { userId: uid },
  recentTexts: [],
  meta: { idLine: `ID:${uid}`, nameLine: `ユーザー${uid}` },
  ...over
});

/** merged から userId 配列を取り出す。 */
const uids = (merged) => merged.map((r) => String(r?.entry?.userId || ''));

describe('makeLaneRosterKeeperState', () => {
  it('初期状態は空名簿・lid空', () => {
    const st = makeLaneRosterKeeperState();
    expect(st.lid).toBe('');
    expect(st.rows instanceof Map).toBe(true);
    expect(st.rows.size).toBe(0);
  });
});

describe('applyLaneRosterKeeper', () => {
  it('lid切替で名簿をリセットする(前配信の人を持ち込まない)', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a'), row('b')] });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv2', candidates: [row('z')] });
    expect(uids(r.merged)).toEqual(['z']);
    expect(r.revivedCount).toBe(0);
  });

  it('同一lidで候補から落ちた人を merged に復活させる(revivedCount 一致)', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a'), row('b')] });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('c')] });
    expect(uids(r.merged).sort()).toEqual(['a', 'b', 'c']);
    expect(r.revivedCount).toBe(2);
  });

  it('復活行は最後に見た displaySrc/title/meta/tier を保持する', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, {
      liveId: 'lv1',
      candidates: [row('a', { profileTier: 3, displaySrc: 'https://example.test/face-a.png', title: '顔つきA' })]
    });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('b')] });
    const revived = r.merged.find((x) => x.entry.userId === 'a');
    expect(revived.displaySrc).toBe('https://example.test/face-a.png');
    expect(revived.title).toBe('顔つきA');
    expect(revived.profileTier).toBe(3);
    expect(revived.meta.idLine).toBe('ID:a');
  });

  it('同一uidは現行候補が優先(最新行で名簿を上書き・mergedに重複を作らない)', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a', { title: '古い名前' })] });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a', { title: '新しい名前' })] });
    expect(uids(r.merged)).toEqual(['a']);
    expect(r.merged[0].title).toBe('新しい名前');
    expect(r.revivedCount).toBe(0);
  });

  it('候補が空でも名簿全員を返す(谷間で誰も消えない)', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a'), row('b'), row('c')] });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [] });
    expect(uids(r.merged).sort()).toEqual(['a', 'b', 'c']);
    expect(r.revivedCount).toBe(3);
  });

  it('uid空の行は名簿に入れない(tier0除外の流儀と一致)', () => {
    const st = makeLaneRosterKeeperState();
    const r1 = applyLaneRosterKeeper(st, {
      liveId: 'lv1',
      candidates: [row(''), row('a')]
    });
    // 現行候補としてはそのまま通す(描画対象の判断は tier 側の責務)。
    expect(uids(r1.merged)).toEqual(['', 'a']);
    // 名簿には uid 有りだけが入る = 次 paint で uid 空は復活しない。
    const r2 = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [] });
    expect(uids(r2.merged)).toEqual(['a']);
  });

  it('段昇格(tanu→link)しても名簿はuid単位で1件のまま', () => {
    const st = makeLaneRosterKeeperState();
    applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a', { profileTier: 1 })] });
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: [row('a', { profileTier: 3 })] });
    expect(uids(r.merged)).toEqual(['a']);
    expect(r.merged[0].profileTier).toBe(3);
    expect(st.rows.size).toBe(1);
  });

  it('壊れた入力でも落ちない(candidates非配列・null要素)', () => {
    const st = makeLaneRosterKeeperState();
    const r = applyLaneRosterKeeper(st, { liveId: 'lv1', candidates: /** @type {any} */ (null) });
    expect(r.merged).toEqual([]);
    const r2 = applyLaneRosterKeeper(st, {
      liveId: 'lv1',
      candidates: /** @type {any} */ ([null, undefined, row('a')])
    });
    expect(uids(r2.merged.filter((x) => x && x.entry))).toEqual(['a']);
  });
});
