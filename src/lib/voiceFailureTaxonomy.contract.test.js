import { describe, expect, it } from 'vitest';
import { classifyVoicevoxAliveFailure } from './voicevoxClient.js';
import { classifyVoiceSynthFailureReason } from './voiceSynthFailureReason.js';
import {
  canonicalLabel,
  fromAliveFailure,
  fromSynthFailure
} from './voiceFailureTaxonomy.js';

/*
 * 旧分類器へ渡す代表入力。新taxonomyとは独立した起点として、旧分類器の出力を固定する。
 * 正常系だけでは移設ミスを捕まえられないため、失敗経路を全種類含める。
 */
const ALIVE_LEGACY_CASES = [
  { name: 'fetch未配線', input: { hasFetch: false }, token: 'no-fetch' },
  { name: '時間切れ', input: { error: new Error('voicevox_timeout') }, token: 'timeout' },
  { name: '接続不能', input: { error: new TypeError('Failed to fetch') }, token: 'refused' },
  { name: 'HTTPエラー', input: { response: { ok: false } }, token: 'http-error' },
  { name: '失敗なし', input: { response: { ok: true } }, token: '' }
];

const SYNTH_LEGACY_CASES = [
  { name: '時間切れ', input: { stage: 'query', error: new Error('AbortError') }, token: 'timeout' },
  { name: '接続不能', input: { stage: 'synth', error: new TypeError('Failed to fetch') }, token: 'unreachable' },
  { name: '解析HTTPエラー', input: { stage: 'query', httpStatus: 503 }, token: 'query_http' },
  { name: '解析body不正', input: { stage: 'query', bodyInvalid: true }, token: 'query_body' },
  { name: '合成HTTPエラー', input: { stage: 'synth', httpStatus: 500 }, token: 'synth_http' },
  { name: '合成body不正', input: { stage: 'synth', bodyInvalid: true }, token: 'synth_body' },
  { name: '理由不明', input: {}, token: 'unknown' }
];

/*
 * 旧トークンの全値域をリテラルで書き写した、新taxonomy側の独立した起点。
 * 旧分類器を新関数の内部から呼ぶと恒真になるため、ここでは入力トークンを直接渡す。
 */
const ALIVE_TOKEN_CONTRACT = [
  { token: 'no-fetch', normalized: { cause: 'not_wired', stage: 'probe' }, label: '拡張の通信経路が切れている(ページ再読み込みが必要)' },
  { token: 'timeout', normalized: { cause: 'timeout', stage: 'probe' }, label: 'VOICEVOXが応答しない(起動はしている)' },
  { token: 'refused', normalized: { cause: 'down', stage: 'probe' }, label: 'VOICEVOXに接続できない(未起動の可能性)' },
  { token: 'http-error', normalized: { cause: 'http', stage: 'probe' }, label: 'VOICEVOXがエラーを返した' },
  { token: '', normalized: null, label: '' }
];

const SYNTH_TOKEN_CONTRACT = [
  { token: 'timeout', normalized: { cause: 'timeout', stage: 'synth' }, label: '音声合成が時間切れ' },
  { token: 'unreachable', normalized: { cause: 'down', stage: 'synth' }, label: '音声合成時にVOICEVOXへ接続できない' },
  { token: 'query_http', normalized: { cause: 'http', stage: 'query' }, label: '音声解析がエラーを返した(過負荷の疑い)' },
  { token: 'query_body', normalized: { cause: 'payload', stage: 'query' }, label: '音声解析の応答が不正' },
  { token: 'synth_http', normalized: { cause: 'http', stage: 'synth' }, label: '音声合成がエラーを返した(過負荷の疑い)' },
  { token: 'synth_body', normalized: { cause: 'payload', stage: 'synth' }, label: '音声の受信に失敗' },
  { token: 'unknown', normalized: { cause: 'unknown', stage: 'synth' }, label: '音声合成に失敗(理由不明)' }
];

describe('voiceFailureTaxonomy 旧分類器との契約', () => {
  it('alive旧分類器の全値域5個を代表入力から固定する', () => {
    expect(ALIVE_LEGACY_CASES.map(({ input }) => classifyVoicevoxAliveFailure(input)))
      .toEqual(['no-fetch', 'timeout', 'refused', 'http-error', '']);
  });

  it('synth旧分類器の全値域7個を代表入力から固定する', () => {
    expect(SYNTH_LEGACY_CASES.map(({ input }) => classifyVoiceSynthFailureReason(input)))
      .toEqual(['timeout', 'unreachable', 'query_http', 'query_body', 'synth_http', 'synth_body', 'unknown']);
  });

  it.each(ALIVE_TOKEN_CONTRACT)('alive旧トークン "$token" を2軸へ変換する', ({ token, normalized, label }) => {
    const failure = fromAliveFailure(token);
    expect(failure).toEqual(normalized);
    expect(canonicalLabel(failure)).toBe(label);
  });

  it.each(SYNTH_TOKEN_CONTRACT)('synth旧トークン "$token" を2軸へ変換する', ({ token, normalized, label }) => {
    const failure = fromSynthFailure(token);
    expect(failure).toEqual(normalized);
    expect(canonicalLabel(failure)).toBe(label);
  });

  it('代表入力→alive旧トークン→新taxonomyの通し結果がリテラル契約と一致する', () => {
    for (const legacyCase of ALIVE_LEGACY_CASES) {
      const oldToken = classifyVoicevoxAliveFailure(legacyCase.input);
      expect(oldToken).toBe(legacyCase.token);
      const contract = ALIVE_TOKEN_CONTRACT.find((row) => row.token === legacyCase.token);
      expect(fromAliveFailure(oldToken)).toEqual(contract?.normalized);
    }
  });

  it('代表入力→synth旧トークン→新taxonomyの通し結果がリテラル契約と一致する', () => {
    for (const legacyCase of SYNTH_LEGACY_CASES) {
      const oldToken = classifyVoiceSynthFailureReason(legacyCase.input);
      expect(oldToken).toBe(legacyCase.token);
      const contract = SYNTH_TOKEN_CONTRACT.find((row) => row.token === legacyCase.token);
      expect(fromSynthFailure(oldToken)).toEqual(contract?.normalized);
    }
  });
});
