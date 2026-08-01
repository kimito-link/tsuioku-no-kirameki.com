import { describe, it, expect, vi } from 'vitest';
import { copyTextWithFallback } from './copyTextWithFallback.js';

// copyTextWithFallback の段階フォールバックを固定する。

describe('copyTextWithFallback', () => {
  it('空文字は failed', async () => {
    expect(await copyTextWithFallback('', { clipboard: null, doc: null })).toBe('failed');
    expect(await copyTextWithFallback(null, { clipboard: null, doc: null })).toBe('failed');
  });

  it('clipboard.writeText 成功なら clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const out = await copyTextWithFallback('hello', { clipboard: { writeText }, doc: null });
    expect(out).toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('clipboard 失敗→execCommand 成功(selectEl あり)なら execCommand', async () => {
    // v0.1.1223: selectEl があっても一時 textarea 経由で【引数】をコピーする契約に変更。
    //   旧実装は selectEl を select していたが、それは textarea の中身をコピーする=
    //   引数と食い違う(鮮度バナーが落ちる/空なら何もコピーされない)。
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const select = vi.fn();
    const focus = vi.fn();
    const selectEl = /** @type {any} */ ({ select, focus });
    const fakeTa = { value: '', style: {}, focus: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const doc = {
      execCommand: vi.fn().mockReturnValue(true),
      createElement: vi.fn().mockReturnValue(fakeTa),
      body: { appendChild: vi.fn() }
    };
    const out = await copyTextWithFallback('x', {
      clipboard: { writeText },
      doc: /** @type {any} */ (doc),
      selectEl
    });
    expect(out).toBe('execCommand');
    expect(fakeTa.value).toBe('x');
    expect(select).not.toHaveBeenCalled();
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
  });

  it('clipboard なし→execCommand 成功(selectEl なし=一時 textarea)なら execCommand', async () => {
    const appended = [];
    const fakeTa = { value: '', style: {}, focus: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const doc = {
      execCommand: vi.fn().mockReturnValue(true),
      createElement: vi.fn().mockReturnValue(fakeTa),
      body: { appendChild: vi.fn((el) => appended.push(el)) }
    };
    const out = await copyTextWithFallback('payload', {
      clipboard: null,
      doc: /** @type {any} */ (doc)
    });
    expect(out).toBe('execCommand');
    expect(fakeTa.value).toBe('payload');
    expect(fakeTa.remove).toHaveBeenCalled(); // 一時要素は片付ける
  });

  it('clipboard 失敗・execCommand 失敗→selectEl 選択で selected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no'));
    const select = vi.fn();
    const focus = vi.fn();
    const selectEl = /** @type {any} */ ({ select, focus });
    const doc = { execCommand: vi.fn().mockReturnValue(false) };
    const out = await copyTextWithFallback('y', {
      clipboard: { writeText },
      doc: /** @type {any} */ (doc),
      selectEl
    });
    expect(out).toBe('selected');
    expect(select).toHaveBeenCalled();
  });

  it('何もできない(clipboard/doc/selectEl すべて不可)なら failed', async () => {
    const out = await copyTextWithFallback('z', { clipboard: null, doc: null, selectEl: null });
    expect(out).toBe('failed');
  });

  /**
   * ★v0.1.1223 回帰: selectEl があっても【引数 body】をコピーすること。
   *
   * 旧実装は selectEl を select して execCommand していた=コピーされるのは
   * 【textarea の中身】であって引数ではない。v0.1.1222 で本文の先頭に鮮度バナーを
   * 足したことで、バナー無しの古い中身がコピーされる(textarea が空なら何も
   * コピーされない)不具合として実機で表面化した。
   */
  it('★selectEl があっても引数の本文をコピーする(textarea の中身ではない)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no'));
    const fakeTa = { value: '', style: {}, focus: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const doc = {
      execCommand: vi.fn().mockReturnValue(true),
      createElement: vi.fn().mockReturnValue(fakeTa),
      body: { appendChild: vi.fn() }
    };
    // 画面上の textarea は「古い本文」を持っている(バナー無し)。
    const staleSelectEl = /** @type {any} */ ({
      value: '古い本文(バナー無し)',
      select: vi.fn(),
      focus: vi.fn()
    });
    const wanted = '⚠️ この状態速報は【57秒前の値】です / 本文';
    const out = await copyTextWithFallback(wanted, {
      clipboard: { writeText },
      doc: /** @type {any} */ (doc),
      selectEl: staleSelectEl
    });
    expect(out).toBe('execCommand');
    // 一時 textarea に渡された値が、引数そのものであること(ここが核心)。
    expect(fakeTa.value).toBe(wanted);
    // 画面の textarea を select して済ませていない(=古い中身をコピーしていない)。
    expect(staleSelectEl.select).not.toHaveBeenCalled();
  });

  it('clipboard 失敗でも execCommand が使えれば selectEl は select されない(自動コピー優先)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no'));
    const fakeTa = { value: '', style: {}, focus: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const doc = {
      execCommand: vi.fn().mockReturnValue(true),
      createElement: vi.fn().mockReturnValue(fakeTa),
      body: { appendChild: vi.fn() }
    };
    const out = await copyTextWithFallback('w', { clipboard: { writeText }, doc: /** @type {any} */ (doc) });
    expect(out).toBe('execCommand');
  });
});
