import { describe, it, expect } from 'vitest';
import {
  isContextInvalidatedError,
  buildSilentErrorPayload,
  isExtensionContextAlive
} from './reportSilentError.js';

describe('isContextInvalidatedError', () => {
  it('Error オブジェクトの message に "Extension context invalidated" を含む → true', () => {
    expect(isContextInvalidatedError(new Error('Extension context invalidated'))).toBe(true);
  });
  it('message に含まない通常 Error → false', () => {
    expect(isContextInvalidatedError(new Error('quota exceeded'))).toBe(false);
  });
  it('文字列にフレーズを含む → true', () => {
    expect(isContextInvalidatedError('Extension context invalidated')).toBe(true);
  });
  it('null → false', () => {
    expect(isContextInvalidatedError(null)).toBe(false);
  });
  it('undefined → false', () => {
    expect(isContextInvalidatedError(undefined)).toBe(false);
  });
});

describe('buildSilentErrorPayload', () => {
  it('context と Error から payload を生成', () => {
    const p = buildSilentErrorPayload('persist', new Error('quota exceeded'));
    expect(p).toEqual(expect.objectContaining({
      context: 'persist',
      message: 'quota exceeded'
    }));
    expect(typeof p.at).toBe('number');
    expect(p.at).toBeGreaterThan(0);
  });

  it('context と string エラーから payload を生成', () => {
    const p = buildSilentErrorPayload('flush', 'write failed');
    expect(p.context).toBe('flush');
    expect(p.message).toBe('write failed');
  });

  it('err が null → message なし', () => {
    const p = buildSilentErrorPayload('deep', null);
    expect(p.context).toBe('deep');
    expect(p.message).toBeUndefined();
  });

  it('err が undefined → message なし', () => {
    const p = buildSilentErrorPayload('start', undefined);
    expect(p.context).toBe('start');
    expect(p.message).toBeUndefined();
  });

  it('Extension context invalidated → shouldReport: false', () => {
    const p = buildSilentErrorPayload('persist', new Error('Extension context invalidated'));
    expect(p.shouldReport).toBe(false);
  });

  it('通常エラー → shouldReport: true', () => {
    const p = buildSilentErrorPayload('persist', new Error('quota'));
    expect(p.shouldReport).toBe(true);
  });

  it('message が200文字超 → 切り詰め', () => {
    const long = 'x'.repeat(300);
    const p = buildSilentErrorPayload('test', new Error(long));
    expect(p.message.length).toBeLessThanOrEqual(200);
  });

  it('liveId を含めると payload に反映', () => {
    const p = buildSilentErrorPayload('persist', new Error('fail'), 'lv123');
    expect(p.liveId).toBe('lv123');
  });

  it('liveId なしだと payload に liveId がない', () => {
    const p = buildSilentErrorPayload('persist', new Error('fail'));
    expect(p.liveId).toBeUndefined();
  });
});

describe('isExtensionContextAlive', () => {
  it('runtime.id と storage.local が揃っていれば true', () => {
    const chromeRef = { runtime: { id: 'abc123' }, storage: { local: {} } };
    expect(isExtensionContextAlive(chromeRef)).toBe(true);
  });

  it('runtime.id が undefined（拡張リロード後の古いタブ）→ false', () => {
    const chromeRef = { runtime: { id: undefined }, storage: { local: {} } };
    expect(isExtensionContextAlive(chromeRef)).toBe(false);
  });

  it('runtime 自体が存在しない → false', () => {
    expect(isExtensionContextAlive({})).toBe(false);
  });

  it('storage.local が存在しない → false', () => {
    const chromeRef = { runtime: { id: 'abc123' }, storage: {} };
    expect(isExtensionContextAlive(chromeRef)).toBe(false);
  });

  it('null/undefined を渡しても crash しない → false', () => {
    expect(isExtensionContextAlive(null)).toBe(false);
  });

  it('アクセスで例外を投げるオブジェクトでも crash しない → false', () => {
    const chromeRef = {
      get runtime() {
        throw new Error('boom');
      }
    };
    expect(isExtensionContextAlive(chromeRef)).toBe(false);
  });

  it('引数省略時は globalThis.chrome が無ければ false（Node/test環境）', () => {
    expect(isExtensionContextAlive()).toBe(false);
  });
});
