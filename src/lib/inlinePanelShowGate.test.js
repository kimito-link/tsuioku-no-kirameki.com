import { describe, it, expect } from 'vitest';
import { shouldHideInlinePanelByAutoshow } from './inlinePanelShowGate.js';

describe('shouldHideInlinePanelByAutoshow — 2026-08-05 実測の矛盾を潰す', () => {
  it('★真因の再現: 一度表示したのに全フラグが false になった瞬間、消さない', () => {
    // 実測: パネルは表示されているのに autoshow_off が4回・0.4秒周期で記録された。
    //   = フラグが立つ前の窓、またはフラグが巻き戻る経路が存在する。
    const r = shouldHideInlinePanelByAutoshow({
      autoshowEnabled: false,
      toolbarPressed: false,
      activatedThisSession: false,
      everShown: true // ★実際に出した事実は覆らない
    });
    expect(r.hide).toBe(false);
    expect(r.reason).toBe('shown-before');
  });

  it('★初回は従来どおり消す(「こん太を押すまで出さない」を壊さない)', () => {
    const r = shouldHideInlinePanelByAutoshow({
      autoshowEnabled: false,
      toolbarPressed: false,
      activatedThisSession: false,
      everShown: false
    });
    expect(r.hide).toBe(true);
    expect(r.reason).toBe('autoshow-off');
  });

  it('ツールバーを押していれば従来どおり表示', () => {
    expect(shouldHideInlinePanelByAutoshow({ toolbarPressed: true }).hide).toBe(false);
  });

  it('自動表示が ON なら従来どおり表示', () => {
    expect(shouldHideInlinePanelByAutoshow({ autoshowEnabled: true }).hide).toBe(false);
  });

  it('このセッションで表示済みなら従来どおり表示', () => {
    const r = shouldHideInlinePanelByAutoshow({ activatedThisSession: true });
    expect(r.hide).toBe(false);
    expect(r.reason).toBe('allowed');
  });

  it('★曖昧な値は「立っていない」扱い(暗黙の true を作らない)', () => {
    for (const v of [undefined, null, 0, '', 'true', 1, {}]) {
      expect(shouldHideInlinePanelByAutoshow({
        autoshowEnabled: v, toolbarPressed: v, activatedThisSession: v, everShown: v
      }).hide).toBe(true);
    }
  });

  it('引数が空でも落ちない(描画を止めない)', () => {
    expect(shouldHideInlinePanelByAutoshow(undefined)).toMatchObject({ hide: true });
  });
});
