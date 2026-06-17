import { describe, it, expect } from 'vitest';
import {
  createMonotonicCommentCountState,
  normalizeMonotonicLiveId,
  resolveMonotonicCommentCount,
  createMonotonicCommentCountMap,
  resolveMonotonicCommentCountForLive,
  forgetMonotonicCommentCountForLive,
} from './monotonicCommentCount.js';

describe('normalizeMonotonicLiveId', () => {
  it('lowercases and trims valid lv', () => {
    expect(normalizeMonotonicLiveId('  LV12345 ')).toBe('lv12345');
  });
  it('rejects non-lv', () => {
    expect(normalizeMonotonicLiveId('co12345')).toBe('');
    expect(normalizeMonotonicLiveId('')).toBe('');
    expect(normalizeMonotonicLiveId(null)).toBe('');
    expect(normalizeMonotonicLiveId('lvabc')).toBe('');
  });
});

describe('resolveMonotonicCommentCount', () => {
  it('passes through non-numeric candidate as null (文言はゲート対象外)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', '（この配信は未取得）')).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', NaN)).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', Infinity)).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', -5)).toBeNull();
  });

  it('adopts the first numeric value for a lv', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv100', 7782)).toBe(7782);
    expect(s.lv).toBe('lv100');
    expect(s.max).toBe(7782);
  });

  it('never decreases within the same lv (核心: ズレ・逆行の根治)', () => {
    const s = createMonotonicCommentCountState();
    // 4 経路が別タイミングでバラバラの値を渡す再現
    expect(resolveMonotonicCommentCount(s, 'lv1', 7851)).toBe(7851); // 速報
    expect(resolveMonotonicCommentCount(s, 'lv1', 7782)).toBe(7851); // パネル(低い)→据え置き
    expect(resolveMonotonicCommentCount(s, 'lv1', 7815)).toBe(7851); // watch(低い)→据え置き
    expect(resolveMonotonicCommentCount(s, 'lv1', 7900)).toBe(7900); // 全件 read → 上がる
    expect(resolveMonotonicCommentCount(s, 'lv1', 7800)).toBe(7900); // 遅延経路 → 据え置き
  });

  it('resets on lv change (別配信は別カウント)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', 5000)).toBe(5000);
    expect(resolveMonotonicCommentCount(s, 'lv2', 3)).toBe(3); // 新配信は低い値でもリセット
    expect(s.lv).toBe('lv2');
    expect(s.max).toBe(3);
  });

  it('case/whitespace変化では同一lvとして扱う', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv9', 100)).toBe(100);
    expect(resolveMonotonicCommentCount(s, '  LV9 ', 50)).toBe(100); // 同一lv→据え置き
  });

  it('lvが取れないときはゲートせず素通し(状態は汚さない)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, '', 1234)).toBe(1234);
    expect(resolveMonotonicCommentCount(s, 'co999', 1234)).toBe(1234);
    expect(s.lv).toBe('');
    expect(s.max).toBe(0);
  });

  it('0件も正しく扱う', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', 0)).toBe(0);
    expect(resolveMonotonicCommentCount(s, 'lv1', 5)).toBe(5);
    expect(resolveMonotonicCommentCount(s, 'lv1', 0)).toBe(5); // 0に戻さない
  });

  it('state を直接 lv=\'\'/max=0 に書き換えるとリセットとして機能する(resetOfficialCommentSamplingState の配線を担保)', () => {
    const s = createMonotonicCommentCountState();
    // 同一配信で値を積んだ後
    resolveMonotonicCommentCount(s, 'lv1', 500);
    expect(s.max).toBe(500);
    // 配信切替/リセット時に content-entry.js は lv=''/max=0 を直書きする
    s.lv = '';
    s.max = 0;
    // リセット後: 同一 lv でも低い値から正しく再開する
    expect(resolveMonotonicCommentCount(s, 'lv1', 3)).toBe(3);
    expect(s.max).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// v0.1.804: per-live Map 版(「記録がまた減る」根治)
// ---------------------------------------------------------------------------

describe('resolveMonotonicCommentCountForLive (per-live Map)', () => {
  it('lv ごとに独立して max を保持する(複数配信同時でも混ざらない)', () => {
    const m = createMonotonicCommentCountMap();
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 100)).toBe(100);
    expect(resolveMonotonicCommentCountForLive(m, 'lv2', 5)).toBe(5);
    // lv1 に低い値が来ても lv1 の max は据え置き、lv2 は独立
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 80)).toBe(100);
    expect(resolveMonotonicCommentCountForLive(m, 'lv2', 9)).toBe(9);
  });

  it('同一 lv 内で後退させない(核心)', () => {
    const m = createMonotonicCommentCountMap();
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 88)).toBe(88);
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 7)).toBe(88); // テール seed の小さい値→据え置き
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 120)).toBe(120); // 伸びる
  });

  it('recording OFF/ON 相当(Map を触らない)では max が保持される=経路1 根治', () => {
    const m = createMonotonicCommentCountMap();
    resolveMonotonicCommentCountForLive(m, 'lv1', 88);
    // 旧実装は resetOfficialCommentSamplingState でゲートを消していた。
    // 新実装は Map を触らないので、トグル後にテール seed の小さい値が来ても後退しない。
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 7)).toBe(88);
  });

  it('非数値/負は null・lv 不正は素通し(Map を汚さない)', () => {
    const m = createMonotonicCommentCountMap();
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', '文言')).toBeNull();
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', -1)).toBeNull();
    expect(resolveMonotonicCommentCountForLive(m, 'co1', 50)).toBe(50);
    expect(resolveMonotonicCommentCountForLive(m, '', 50)).toBe(50);
    expect(m.size).toBe(0);
  });

  it('case/whitespace 変化は同一 lv 扱い', () => {
    const m = createMonotonicCommentCountMap();
    expect(resolveMonotonicCommentCountForLive(m, 'lv9', 100)).toBe(100);
    expect(resolveMonotonicCommentCountForLive(m, '  LV9 ', 50)).toBe(100);
  });
});

describe('forgetMonotonicCommentCountForLive (genuine switch のみ 0 から)', () => {
  it('該当 lv のエントリだけ消す=同 lv を新セッションで 0 から数え直せる', () => {
    const m = createMonotonicCommentCountMap();
    resolveMonotonicCommentCountForLive(m, 'lv1', 500);
    resolveMonotonicCommentCountForLive(m, 'lv2', 300);
    forgetMonotonicCommentCountForLive(m, 'lv1');
    // lv1 は消えた→低い値から再開、lv2 は残る
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 3)).toBe(3);
    expect(resolveMonotonicCommentCountForLive(m, 'lv2', 10)).toBe(300);
  });

  it('lv 不正・非 Map は no-op(壊れない)', () => {
    const m = createMonotonicCommentCountMap();
    resolveMonotonicCommentCountForLive(m, 'lv1', 100);
    forgetMonotonicCommentCountForLive(m, '');
    forgetMonotonicCommentCountForLive(m, 'co1');
    forgetMonotonicCommentCountForLive(null, 'lv1');
    expect(resolveMonotonicCommentCountForLive(m, 'lv1', 50)).toBe(100); // 消えていない
  });
});
