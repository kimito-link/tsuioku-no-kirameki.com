import { describe, it, expect } from 'vitest';
import { decideVisibilityAction } from './popupVisibilityGate.js';

describe('decideVisibilityAction（隠れタブ refresh skip ゲート・v0.1.440）', () => {
  it('hidden=true・gateEnabled=true・initialDone=true → skip（多タブ reflow 削減の本筋）', () => {
    expect(decideVisibilityAction({ hidden: true, gateEnabled: true, initialDone: true })).toBe(
      'skip'
    );
  });

  it('hidden=false → run（可視タブは常に描画）', () => {
    expect(decideVisibilityAction({ hidden: false, gateEnabled: true, initialDone: true })).toBe(
      'run'
    );
  });

  it('gateEnabled=false → hidden=true でも run（フォールバック動作・緊急時 v0.1.439 互換）', () => {
    // ⛔ これを外したら確実に落ちる＝改修無効化を検知するネガティブコントロール。
    expect(decideVisibilityAction({ hidden: true, gateEnabled: false, initialDone: true })).toBe(
      'run'
    );
  });

  it('initialDone=false → hidden=true でも run（初回描画前は必ず通す＝表示空白回避）', () => {
    // ⛔ これも外したら確実に落ちる＝初回保護のネガティブコントロール。
    expect(decideVisibilityAction({ hidden: true, gateEnabled: true, initialDone: false })).toBe(
      'run'
    );
  });

  it('hidden=undefined → run（SSR/Node 環境・document 未定義時の防御）', () => {
    expect(decideVisibilityAction({ hidden: undefined })).toBe('run');
  });

  it('hidden に文字列等の壊れた値 → run（defensive・true 以外は hidden 扱いしない）', () => {
    expect(decideVisibilityAction({ hidden: 'true' })).toBe('run');
    expect(decideVisibilityAction({ hidden: 1 })).toBe('run');
    expect(decideVisibilityAction({ hidden: null })).toBe('run');
  });

  it('既定値（hidden だけ true で他を省略）→ gateEnabled/initialDone とも既定 true で skip', () => {
    expect(decideVisibilityAction({ hidden: true })).toBe('skip');
  });

  it('空オブジェクト → 既定で run（hidden 未指定なら描画する）', () => {
    expect(decideVisibilityAction({})).toBe('run');
  });
});
