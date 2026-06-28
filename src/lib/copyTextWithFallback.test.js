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
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const select = vi.fn();
    const focus = vi.fn();
    const selectEl = /** @type {any} */ ({ select, focus });
    const doc = { execCommand: vi.fn().mockReturnValue(true) };
    const out = await copyTextWithFallback('x', {
      clipboard: { writeText },
      doc: /** @type {any} */ (doc),
      selectEl
    });
    expect(out).toBe('execCommand');
    expect(select).toHaveBeenCalled();
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
