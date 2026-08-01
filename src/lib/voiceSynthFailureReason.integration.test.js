import { describe, expect, it } from 'vitest';
import { synthesizeVoice } from './voicevoxClient.js';
import { classifyVoiceSynthFailureReason } from './voiceSynthFailureReason.js';

/**
 * v0.1.1224: 「合成失敗のその他N件」を名前で割る配線が、
 * 【本番の synthesizeVoice を通して】実際に効くことを断言する。
 *
 * ★純関数の単体テストだけでは「分類器は正しいが呼ばれていない」を見逃す
 *   ([[integration-test-must-import-real-code]])。ここは実 import で経路ごと検証する。
 */
describe('synthesizeVoice の失敗理由通知(実コード経由)', () => {
  it('★VOICEVOX 未起動(接続拒否)を unreachable として通知する', async () => {
    /** @type {any[]} */
    const seen = [];
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    const wav = await synthesizeVoice('こんばんは', { styleId: 3 }, {
      fetchFn,
      onFailure: (info) => seen.push(info)
    });
    expect(wav).toBeNull(); // 戻り値の契約は不変(既存呼び出しを壊さない)
    expect(seen).toHaveLength(1);
    expect(classifyVoiceSynthFailureReason(seen[0])).toBe('unreachable');
  });

  it('★audio_query が HTTP エラーなら query_http(過負荷の疑い)', async () => {
    /** @type {any[]} */
    const seen = [];
    const fetchFn = async () => ({ ok: false, status: 500 });
    const wav = await synthesizeVoice('こんばんは', { styleId: 3 }, {
      fetchFn,
      onFailure: (info) => seen.push(info)
    });
    expect(wav).toBeNull();
    expect(seen).toHaveLength(1);
    expect(classifyVoiceSynthFailureReason(seen[0])).toBe('query_http');
  });

  it('★synthesis が HTTP エラーなら synth_http(query は成功している)', async () => {
    /** @type {any[]} */
    const seen = [];
    let call = 0;
    const fetchFn = async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ speedScale: 1, pitchScale: 0 }) };
      }
      return { ok: false, status: 503 };
    };
    const wav = await synthesizeVoice('こんばんは', { styleId: 3 }, {
      fetchFn,
      onFailure: (info) => seen.push(info)
    });
    expect(wav).toBeNull();
    expect(seen).toHaveLength(1);
    expect(classifyVoiceSynthFailureReason(seen[0])).toBe('synth_http');
  });

  it('audio_query の本文が不正なら query_body', async () => {
    /** @type {any[]} */
    const seen = [];
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => null });
    await synthesizeVoice('こんばんは', { styleId: 3 }, {
      fetchFn,
      onFailure: (info) => seen.push(info)
    });
    expect(classifyVoiceSynthFailureReason(seen[0])).toBe('query_body');
  });

  it('onFailure 未指定でも壊れない(既存呼び出しの後方互換)', async () => {
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      synthesizeVoice('こんばんは', { styleId: 3 }, { fetchFn })
    ).resolves.toBeNull();
  });

  it('onFailure が例外を投げても読み上げを止めない(計器は本処理を壊さない)', async () => {
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      synthesizeVoice('こんばんは', { styleId: 3 }, {
        fetchFn,
        onFailure: () => {
          throw new Error('instrument exploded');
        }
      })
    ).resolves.toBeNull();
  });
});
