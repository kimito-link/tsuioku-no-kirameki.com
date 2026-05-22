import { describe, it, expect } from 'vitest';
import { resolveCommentKindnessDisplayModel } from './commentKindnessDisplayModel.js';

const FACE_LEVELS = ['mild', 'strong'];
const SOFT = '送る前に、ひと呼吸おいて言い換えも考えてみよう。';

describe('resolveCommentKindnessDisplayModel', () => {
  it('warning が無いとき非表示・既定 mild・hop しない', () => {
    const m = resolveCommentKindnessDisplayModel(
      { warning: null, visibleKey: '' },
      { faceLevels: FACE_LEVELS }
    );
    expect(m.visible).toBe(false);
    expect(m.level).toBe('mild');
    expect(m.faceLevel).toBe('mild');
    expect(m.title).toBe('');
    expect(m.body).toBe('');
    expect(m.confirmText).toBe('');
    expect(m.shouldHop).toBe(false);
    expect(m.visibleKey).toBe('');
  });

  it('warning あり・confirmPending=false は soft nudge 文言', () => {
    const m = resolveCommentKindnessDisplayModel(
      {
        warning: { level: 'strong', title: 'タイトル', body: '本文', confirm: 'それでも送る' },
        confirmPending: false,
        visibleKey: 'strong|x|あ'
      },
      { faceLevels: FACE_LEVELS, softNudgeText: SOFT, lastVisibleKey: '' }
    );
    expect(m.visible).toBe(true);
    expect(m.level).toBe('strong');
    expect(m.faceLevel).toBe('strong');
    expect(m.title).toBe('タイトル');
    expect(m.body).toBe('本文');
    expect(m.confirmText).toBe(SOFT);
    // 前回キーが空なので hop する
    expect(m.shouldHop).toBe(true);
  });

  it('confirmPending=true は warning.confirm をそのまま出す', () => {
    const m = resolveCommentKindnessDisplayModel(
      {
        warning: { level: 'mild', title: 't', body: 'b', confirm: 'それでも送る' },
        confirmPending: true,
        visibleKey: 'k1'
      },
      { faceLevels: FACE_LEVELS, lastVisibleKey: 'k1' }
    );
    expect(m.confirmText).toBe('それでも送る');
    // 同じ visibleKey・forceHop なし → hop しない
    expect(m.shouldHop).toBe(false);
  });

  it('未知の level は face を mild にフォールバック（level 自体は保持）', () => {
    const m = resolveCommentKindnessDisplayModel(
      { warning: { level: 'unknownLevel', title: 't', body: 'b' }, visibleKey: 'k' },
      { faceLevels: FACE_LEVELS, lastVisibleKey: 'k' }
    );
    expect(m.level).toBe('unknownLevel');
    expect(m.faceLevel).toBe('mild');
  });

  it('forceHop=true なら同じキーでも hop する', () => {
    const m = resolveCommentKindnessDisplayModel(
      { warning: { level: 'mild', title: 't', body: 'b' }, visibleKey: 'same' },
      { faceLevels: FACE_LEVELS, lastVisibleKey: 'same', forceHop: true }
    );
    expect(m.shouldHop).toBe(true);
  });

  it('visibleKey が前回と変われば hop する', () => {
    const m = resolveCommentKindnessDisplayModel(
      { warning: { level: 'mild', title: 't', body: 'b' }, visibleKey: 'new' },
      { faceLevels: FACE_LEVELS, lastVisibleKey: 'old' }
    );
    expect(m.shouldHop).toBe(true);
  });

  it('confirm が空なら confirmPending でも soft nudge にフォールバック', () => {
    const m = resolveCommentKindnessDisplayModel(
      { warning: { level: 'mild', title: 't', body: 'b', confirm: '' }, confirmPending: true, visibleKey: 'k' },
      { faceLevels: FACE_LEVELS, softNudgeText: SOFT }
    );
    expect(m.confirmText).toBe(SOFT);
  });
});
