import { describe, it, expect } from 'vitest';
import {
  NLS_PANEL_VISIBILITY_TYPE,
  buildPanelVisibilityPayload,
  isPanelVisibilityMessageValid,
  createPanelActivity
} from './panelActivity.js';

const parent = { id: 'parent' };
const ev = (data, source = parent) => ({ data, source });

describe('buildPanelVisibilityPayload', () => {
  it('型・visible・nonce を詰める', () => {
    expect(buildPanelVisibilityPayload(false, 'n1')).toEqual({ type: NLS_PANEL_VISIBILITY_TYPE, visible: false, nonce: 'n1' });
    expect(buildPanelVisibilityPayload(true, 'n1')?.visible).toBe(true);
  });
  it('nonce が空なら送らない(null)', () => {
    expect(buildPanelVisibilityPayload(true, '')).toBeNull();
  });
  it('visible が真偽値以外なら false 扱いにせず…true だけが true(曖昧は隠す側にしない: 呼び出し側は boolean を渡す)', () => {
    expect(buildPanelVisibilityPayload('yes', 'n')?.visible).toBe(false);
  });
});

describe('isPanelVisibilityMessageValid', () => {
  const ok = { type: NLS_PANEL_VISIBILITY_TYPE, visible: false, nonce: 'n1' };
  it('型・nonce・送信元が合えば true', () => {
    expect(isPanelVisibilityMessageValid(ev(ok), 'n1', parent)).toBe(true);
  });
  it('nonce 不一致・nonce 未設定は false', () => {
    expect(isPanelVisibilityMessageValid(ev({ ...ok, nonce: 'x' }), 'n1', parent)).toBe(false);
    expect(isPanelVisibilityMessageValid(ev(ok), '', parent)).toBe(false);
  });
  it('送信元が親でなければ false(他ページの偽装で止められない)', () => {
    expect(isPanelVisibilityMessageValid(ev(ok, { id: 'other' }), 'n1', parent)).toBe(false);
    expect(isPanelVisibilityMessageValid(ev(ok), 'n1', null)).toBe(false);
  });
  it('型違い・visible が真偽値でないものは false', () => {
    expect(isPanelVisibilityMessageValid(ev({ ...ok, type: 'X' }), 'n1', parent)).toBe(false);
    expect(isPanelVisibilityMessageValid(ev({ ...ok, visible: 'no' }), 'n1', parent)).toBe(false);
    expect(isPanelVisibilityMessageValid(null, 'n1', parent)).toBe(false);
  });
});

describe('createPanelActivity', () => {
  it('★既定は見えている(通知が来なくても今までどおり動く)', () => {
    const a = createPanelActivity({ isDocHidden: () => false });
    expect(a.isHidden()).toBe(false);
  });
  it('document.hidden でも、親が隠したと伝えても、止める', () => {
    expect(createPanelActivity({ isDocHidden: () => true }).isHidden()).toBe(true);
    const a = createPanelActivity({ isDocHidden: () => false });
    a.setHostVisible(false);
    expect(a.isHidden()).toBe(true);
  });
  it('★隠れていた状態から戻った時だけ resumed(追いつき描画の合図)', () => {
    const a = createPanelActivity();
    expect(a.setHostVisible(false)).toEqual({ changed: true, resumed: false });
    expect(a.setHostVisible(false)).toEqual({ changed: false, resumed: false });
    expect(a.setHostVisible(true)).toEqual({ changed: true, resumed: true });
    expect(a.setHostVisible(true)).toEqual({ changed: false, resumed: false });
  });
  it('isDocHidden が例外を投げても見えている側に倒す', () => {
    const a = createPanelActivity({ isDocHidden: () => { throw new Error('x'); } });
    expect(a.isHidden()).toBe(false);
  });
});
