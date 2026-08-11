import { describe, expect, it } from 'vitest';
import {
  adviseVoiceSynthFailure,
  classifyVoiceSynthFailureReason,
  formatVoiceSynthFailureReasonLine,
  VOICE_SYNTH_FAIL_REASONS
} from './voiceSynthFailureReason.js';

/**
 * v0.1.1334: 旧ラベルから taxonomy の canonicalLabel へ切り替えた対応表。
 * 旧ラベルもリテラルで残し、文言変更を「同じ関数同士の比較」で恒真にしない。
 */
const SYNTH_LABEL_CONTRACT = Object.freeze([
  { reason: 'timeout', oldLabel: '時間切れ', newLabel: '音声合成が時間切れ' },
  { reason: 'unreachable', oldLabel: '接続不能(VOICEVOX未起動/落ちた)', newLabel: '音声合成時にVOICEVOXへ接続できない' },
  { reason: 'query_http', oldLabel: '解析拒否(過負荷の疑い)', newLabel: '音声解析がエラーを返した' },
  { reason: 'query_body', oldLabel: '解析応答が不正', newLabel: '音声解析の応答が不正' },
  { reason: 'synth_http', oldLabel: '合成拒否(過負荷の疑い)', newLabel: '音声合成がエラーを返した' },
  { reason: 'synth_body', oldLabel: '音声の受信失敗', newLabel: '音声の受信に失敗' },
  { reason: 'unknown', oldLabel: '不明', newLabel: '音声合成に失敗(理由不明)' }
]);

/**
 * v0.1.1224: 「合成失敗17件(時間切れ1/その他16)」の【その他16】を名前で割る。
 * 原因ごとに打つ手が正反対(接続不能=拡張では直せない / 過負荷=投げる量を絞れば直る)なので、
 * 一括りにすると必ず対処を間違える。
 */
describe('classifyVoiceSynthFailureReason', () => {
  it('時間切れは stage を問わず timeout', () => {
    expect(classifyVoiceSynthFailureReason({ stage: 'query', error: new Error('voicevox_timeout') })).toBe('timeout');
    expect(classifyVoiceSynthFailureReason({ stage: 'synth', error: new Error('voicevox_body_timeout') })).toBe('timeout');
    expect(classifyVoiceSynthFailureReason({ stage: 'synth', error: new Error('The operation was aborted') })).toBe('timeout');
  });

  it('★接続不能(VOICEVOX未起動)を独立して名指しする', () => {
    // Chrome の fetch は接続拒否で TypeError('Failed to fetch') を投げる。
    expect(classifyVoiceSynthFailureReason({ stage: 'query', error: new TypeError('Failed to fetch') })).toBe('unreachable');
    expect(classifyVoiceSynthFailureReason({ stage: 'synth', error: new Error('ECONNREFUSED') })).toBe('unreachable');
  });

  it('HTTPエラーは stage ごとに分ける(拒否=過負荷の疑い)', () => {
    expect(classifyVoiceSynthFailureReason({ stage: 'query', httpStatus: 500 })).toBe('query_http');
    expect(classifyVoiceSynthFailureReason({ stage: 'synth', httpStatus: 503 })).toBe('synth_http');
  });

  it('本文不正は stage ごとに分ける', () => {
    expect(classifyVoiceSynthFailureReason({ stage: 'query', bodyInvalid: true })).toBe('query_body');
    expect(classifyVoiceSynthFailureReason({ stage: 'synth', bodyInvalid: true })).toBe('synth_body');
  });

  it('判定材料が無ければ unknown(「判定不能」を用意する)', () => {
    expect(classifyVoiceSynthFailureReason({})).toBe('unknown');
    expect(classifyVoiceSynthFailureReason(null)).toBe('unknown');
  });
});

describe('formatVoiceSynthFailureReasonLine', () => {
  it('公開理由トークンの全7値域を契約表に固定する', () => {
    expect(VOICE_SYNTH_FAIL_REASONS).toEqual(SYNTH_LABEL_CONTRACT.map(({ reason }) => reason));
  });

  it.each(SYNTH_LABEL_CONTRACT)(
    '$reason のラベルを旧「$oldLabel」から新「$newLabel」へ対応づける',
    ({ reason, oldLabel, newLabel }) => {
      expect(oldLabel).not.toBe(newLabel);
      expect(formatVoiceSynthFailureReasonLine({ [reason]: 1 }))
        .toBe(`合成失敗の内訳(1件): ${newLabel}1`);
    }
  );

  it('0件なら何も出さない(静かな計器)', () => {
    expect(formatVoiceSynthFailureReasonLine({})).toBe('');
    expect(formatVoiceSynthFailureReasonLine(null)).toBe('');
  });

  it('★実測レジーム(その他16/時間切れ1)を内訳で説明できる', () => {
    const line = formatVoiceSynthFailureReasonLine({ timeout: 1, unreachable: 16 });
    expect(line).toContain('17件');
    expect(line).toContain('時間切れ1');
    expect(line).toContain('音声合成時にVOICEVOXへ接続できない16');
  });

  it('合計は各理由の和(帳尻が合う)', () => {
    const line = formatVoiceSynthFailureReasonLine({ query_http: 3, synth_http: 4, timeout: 2 });
    expect(line).toContain('9件');
  });
});

describe('adviseVoiceSynthFailure', () => {
  it('接続不能が主なら「拡張では直せない」と言い切る', () => {
    expect(adviseVoiceSynthFailure({ unreachable: 16, timeout: 1 })).toContain('接続できていません');
  });

  it('★HTTP拒否が主なら過負荷=絞れば直ると案内する', () => {
    expect(adviseVoiceSynthFailure({ query_http: 10, synth_http: 5, timeout: 1 })).toContain('過負荷');
  });

  it('時間切れが主なら処理が重いと案内する', () => {
    expect(adviseVoiceSynthFailure({ timeout: 20, unreachable: 1 })).toContain('時間内に終わって');
  });

  it('0件なら何も言わない', () => {
    expect(adviseVoiceSynthFailure({})).toBe('');
  });

  it('拮抗時は「拡張では直せない」側を優先(誤った実装変更を防ぐ)', () => {
    expect(adviseVoiceSynthFailure({ unreachable: 5, query_http: 5 })).toContain('接続できていません');
  });
});
