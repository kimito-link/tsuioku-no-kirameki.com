import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AB_COMMENT_AREA_SEL,
  AB_COMMENT_BUTTON_SEL,
  AB_PANEL_NOTE,
  abOpenCommentEnabled,
  createAbPanelController,
  stepAbCommentPanel,
} from './abCommentPanel.js';

/**
 * @param {{ open?: boolean, hasButton?: boolean }} [init]
 */
function page(init = {}) {
  let open = !!init.open;
  const clicks = [];
  const button = {
    click() {
      clicks.push(1);
      open = true;
    },
  };
  return {
    clicks,
    close() {
      open = false;
    },
    setButton(on) {
      init.hasButton = on;
    },
    querySelector(sel) {
      if (sel === AB_COMMENT_AREA_SEL) return open ? { id: 'area' } : null;
      if (sel === AB_COMMENT_BUTTON_SEL) return init.hasButton === false ? null : button;
      return null;
    },
  };
}

describe('ABEMA のコメント欄を一度だけ開く', () => {
  it('未設定はオン', () => {
    expect(abOpenCommentEnabled(undefined)).toBe(true);
    expect(abOpenCommentEnabled(true)).toBe(true);
    expect(abOpenCommentEnabled(false)).toBe(false);
  });

  it('ボタンを一度だけ押し、利用者が閉じたら押し直さない', () => {
    const doc = page();
    const ctrl = createAbPanelController();
    const first = stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    expect(first.click).toBe(true);
    expect(doc.clicks).toEqual([1]);
    expect(stepAbCommentPanel(ctrl, doc, { now: 3_000 }).click).toBe(false);
    expect(doc.clicks).toEqual([1]);
    doc.close();
    const closed = stepAbCommentPanel(ctrl, doc, { now: 5_000 });
    expect(closed.click).toBe(false);
    expect(closed.userClosed).toBe(true);
    expect(stepAbCommentPanel(ctrl, doc, { now: 7_000 }).click).toBe(false);
    expect(stepAbCommentPanel(ctrl, doc, { now: 29_000 }).click).toBe(false);
    expect(doc.clicks).toEqual([1]);
  });

  it('URL が変わったあとは、また一度だけ押す', () => {
    const doc = page();
    const ctrl = createAbPanelController();
    stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    doc.close();
    stepAbCommentPanel(ctrl, doc, { now: 3_000 });
    expect(doc.clicks).toEqual([1]);
    ctrl.reset();
    const again = stepAbCommentPanel(ctrl, doc, { now: 5_000 });
    expect(again.click).toBe(true);
    expect(doc.clicks).toEqual([1, 1]);
  });

  it('設定がオフのときは押さない', () => {
    const doc = page();
    const ctrl = createAbPanelController();
    expect(stepAbCommentPanel(ctrl, doc, { enabled: false, now: 1_000 }).click).toBe(false);
    expect(doc.clicks).toEqual([]);
    expect(stepAbCommentPanel(ctrl, doc, { enabled: true, now: 3_000 }).click).toBe(true);
    expect(doc.clicks).toEqual([1]);
  });

  it('30 秒たってもボタンが無いときは、その後も押さない', () => {
    const doc = page({ hasButton: false });
    const ctrl = createAbPanelController();
    stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    doc.setButton(true);
    expect(stepAbCommentPanel(ctrl, doc, { now: 32_000 }).click).toBe(false);
    expect(doc.clicks).toEqual([]);
  });

  it('入口は同じ判定と案内文を使う', () => {
    const src = readFileSync(new URL('../../../extension-youtube/src/ab-content-entry.js', import.meta.url), 'utf8');
    expect(AB_PANEL_NOTE).toBe('ABEMAのコメント欄（画面右下の吹き出しボタン）を開くと記録が始まります');
    expect(src).toContain('stepAbCommentPanel');
    expect(src).toContain('AB_PANEL_NOTE');
    expect(src).toContain('panel.reset()');
    expect(src).toContain('pickAbBroadcasterImage');
    expect(src).not.toContain("broadcasterIconUrl: ''");
  });
});
