import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AB_COMMENT_AREA_SEL,
  AB_COMMENT_BUTTON_SEL,
  AB_PANEL_NOTE,
  AB_PANEL_WAIT_MS,
  abOpenCommentEnabled,
  createAbPanelController,
  rankAbCommentControl,
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

  it('ボタンが遅れて出ても、諦めの前なら押す。諦めのあとは押さない', () => {
    const doc = page({ hasButton: false });
    const ctrl = createAbPanelController();
    stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    doc.setButton(true);
    expect(stepAbCommentPanel(ctrl, doc, { now: 32_000 }).click).toBe(true);
    expect(doc.clicks).toEqual([1]);
    const late = page({ hasButton: false });
    const slow = createAbPanelController();
    stepAbCommentPanel(slow, late, { now: 1_000 });
    late.setButton(true);
    const stop = stepAbCommentPanel(slow, late, { now: 1_000 + AB_PANEL_WAIT_MS + 1_000 });
    expect(stop.click).toBe(false);
    expect(stop.gaveUp).toBe(true);
    expect(late.clicks).toEqual([]);
  });

  /**
   * @param {{ text?: string, className?: string, attrs?: Record<string, string>, own?: boolean, chrome?: boolean, icon?: boolean, onClick?: () => void }} spec
   */
  function control(spec) {
    return {
      className: spec.className || '',
      innerText: spec.text || '',
      textContent: spec.text || '',
      getAttribute(/** @type {string} */ name) {
        return spec.attrs?.[name] ?? null;
      },
      closest(/** @type {string} */ sel) {
        if (spec.own && sel.includes('nl-ab-open')) return { id: 'own' };
        if (spec.chrome && /Comment|Footer/.test(sel)) return { id: 'chrome' };
        return null;
      },
      querySelector() {
        return spec.icon ? { id: 'icon' } : null;
      },
      matches(/** @type {string} */ sel) {
        return /button|tab|role/.test(sel);
      },
      click() {
        spec.onClick?.();
      },
    };
  }

  it('番組詳細が開いていても、コメントのタブを先に押す', () => {
    const clicks = [];
    let open = false;
    const tab = control({
      text: 'コメント',
      attrs: { role: 'tab', 'aria-label': 'コメント' },
      onClick() {
        clicks.push('tab');
        open = true;
      },
    });
    const footer = control({
      className: 'com-tv-LinearFooterCommentButton',
      text: '3662',
      chrome: true,
      onClick() {
        clicks.push('footer');
      },
    });
    const nodes = [
      control({ text: 'エピソード一覧', className: 'com-slot-group-SlotList' }),
      control({ text: 'こちらもおすすめ' }),
      footer,
      tab,
    ];
    const doc = {
      querySelector(sel) {
        if (String(sel).includes('CommentArea') || String(sel).includes('CommentBlock')) return open ? { id: 'area' } : null;
        return null;
      },
      querySelectorAll(sel) {
        if (String(sel).includes('textarea')) return [];
        return nodes;
      },
    };
    const ctrl = createAbPanelController();
    const first = stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    expect(first.click).toBe(true);
    expect(clicks).toEqual(['tab']);
    expect(stepAbCommentPanel(ctrl, doc, { now: 5_000 }).click).toBe(false);
    expect(clicks).toEqual(['tab']);
  });

  it('タブを押しても開かなければ、次は吹き出しを押す。応答が来たら止める', () => {
    const clicks = [];
    const tab = control({
      text: 'コメント',
      attrs: { role: 'tab' },
      onClick() {
        clicks.push('tab');
      },
    });
    const footer = control({
      className: 'button com-tv-LinearFooterCommentButton',
      text: '3662',
      chrome: true,
      onClick() {
        clicks.push('footer');
      },
    });
    const doc = {
      querySelector() {
        return null;
      },
      querySelectorAll(sel) {
        if (String(sel).includes('textarea')) return [];
        return [tab, footer, control({ text: 'エピソード一覧' })];
      },
    };
    const ctrl = createAbPanelController();
    stepAbCommentPanel(ctrl, doc, { now: 1_000 });
    stepAbCommentPanel(ctrl, doc, { now: 5_000 });
    expect(clicks).toEqual(['tab', 'footer']);
    expect(stepAbCommentPanel(ctrl, doc, { now: 9_000, arrived: true }).click).toBe(false);
    expect(clicks).toEqual(['tab', 'footer']);
  });

  it('詳細の件数や自分の設定は押さない。コメントのアイコンは押す', () => {
    expect(rankAbCommentControl({ label: 'エピソード一覧', className: '' }).rank).toBe(0);
    expect(rankAbCommentControl({ label: 'こちらもおすすめ', className: '' }).rank).toBe(0);
    expect(rankAbCommentControl({ label: '3.7万', className: '' }).rank).toBe(0);
    expect(rankAbCommentControl({ label: 'コメント欄を自動で開く', inOwnUi: true }).rank).toBe(0);
    expect(rankAbCommentControl({ label: 'コメント', role: 'tab' }).rank).toBe(1);
    expect(rankAbCommentControl({ label: '', className: 'com-tv-LinearFooterCommentButton', hasCommentIcon: true }).rank).toBe(2);
    expect(rankAbCommentControl({ label: '3662', inCommentChrome: true }).rank).toBe(5);
  });

  it('入口は同じ判定と案内文を使う', () => {
    const src = readFileSync(new URL('../../../extension-youtube/src/ab-content-entry.js', import.meta.url), 'utf8');
    expect(AB_PANEL_NOTE).toBe('ABEMAのコメント欄（画面右下の吹き出しボタン）を開くと記録が始まります');
    expect(src).toContain('stepAbCommentPanel');
    expect(src).toContain('AB_PANEL_NOTE');
    expect(src).toContain('panel.reset()');
    expect(src).toContain('arrived: sawPayload');
    expect(src).toContain('pushState');
    expect(src).toContain('pickAbBroadcasterImage');
    expect(src).not.toContain("broadcasterIconUrl: ''");
  });
});
