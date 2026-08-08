import { describe, it, expect } from 'vitest';
import { judgeSidepanelBlack, layerPaints } from './sidepanelSelfDiag.js';

/**
 * サイドパネル自己診断の判定テスト。
 *
 * ★この計器の存在理由: 黒画面が【開発環境で再現しない】(2026-08-08)。
 *   ユーザーに DevTools を開いてもらう往復をやめ、パネル自身に書かせて
 *   いつもの「状態速報コピー」だけで原因が分かるようにする。
 *   だから【原因を1つに名指しする】ことが最重要
 *   ([[instrument-must-name-the-cause-2026-08-01]])。
 */

const PAINT = { bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'grad', colorScheme: 'light' };
const base = (over = {}) => ({
  version: '0.1.1294',
  panelW: 400,
  panelH: 900,
  outer: PAINT,
  iframe: { ...PAINT, w: 400, h: 900, canRead: true },
  inner: { ...PAINT, bodyKids: 3, cloak: '' },
  ...over
});

describe('layerPaints', () => {
  it('背景色が透明でも背景画像(グラデ)があれば塗っている', () => {
    expect(layerPaints({ bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'grad' })).toBe(true);
  });
  it('色も画像も無ければ塗っていない', () => {
    expect(layerPaints({ bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' })).toBe(false);
  });
  it('不正入力で落ちない', () => {
    expect(layerPaints(null)).toBe(false);
    // @ts-expect-error 異常系
    expect(layerPaints('x')).toBe(false);
  });
});

describe('judgeSidepanelBlack — 原因を1つに名指しする', () => {
  it('3層とも塗っていれば ✅正常', () => {
    const r = judgeSidepanelBlack(base());
    expect(r.ok).toBe(true);
    expect(r.cause).toBe('');
    expect(r.line).toContain('✅正常');
    expect(r.line).toContain('v0.1.1294'); // ★版が出る=「修正が届いていないだけ」を即判定できる
  });

  it('外側が塗っていない → 外側を名指し', () => {
    const r = judgeSidepanelBlack(base({ outer: { bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' } }));
    expect(r.ok).toBe(false);
    expect(r.cause).toContain('外側');
    expect(r.line).toContain('🔴黒くなりうる');
  });

  it('iframe が潰れている → 寸法つきで名指し', () => {
    const r = judgeSidepanelBlack(base({ iframe: { ...PAINT, w: 0, h: 0, canRead: true } }));
    expect(r.cause).toContain('iframeが潰れている(0x0)');
  });

  it('中身が読めない → 別オリジン/未ロードを名指し', () => {
    const r = judgeSidepanelBlack(base({ iframe: { ...PAINT, w: 400, h: 900, canRead: false } }));
    expect(r.cause).toContain('読めない');
  });

  it('中身が空(bodyの子0) → 描画前か失敗を名指し', () => {
    const r = judgeSidepanelBlack(base({ inner: { ...PAINT, bodyKids: 0 } }));
    expect(r.cause).toContain('中身が空');
  });

  it('★幕(cloak)が残っている → JSが途中で止まった疑いを名指し', () => {
    // v0.1.1285 で踏んだ経路(cloak が静的属性で残ると中身が見えない)。
    const r = judgeSidepanelBlack(base({ inner: { ...PAINT, bodyKids: 3, cloak: '1' } }));
    expect(r.cause).toContain('幕(cloak)');
  });

  it('★color-scheme が light でない → v0.1.1289 で直した退行を検出', () => {
    const r = judgeSidepanelBlack(base({ outer: { ...PAINT, colorScheme: 'light dark' } }));
    expect(r.cause).toContain('color-scheme');
    expect(r.cause).toContain('light dark');
  });

  it('優先順位: 外側が塗っていなければ他より先に名指しする(原因は1つに絞る)', () => {
    const r = judgeSidepanelBlack(
      base({
        outer: { bgColor: 'rgba(0, 0, 0, 0)', bgImage: 'none' },
        iframe: { ...PAINT, w: 0, h: 0, canRead: true }
      })
    );
    expect(r.cause).toContain('外側');
    expect(r.cause).not.toContain('iframe');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => judgeSidepanelBlack(/** @type {any} */ (null))).not.toThrow();
    expect(() => judgeSidepanelBlack(/** @type {any} */ ({}))).not.toThrow();
  });
});
