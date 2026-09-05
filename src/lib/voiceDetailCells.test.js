/**
 * voiceDetailCells.test.js — 読み上げ分解セルの判定。
 */
import { describe, it, expect } from 'vitest';
import { buildVoiceDetailCells } from './voiceDetailCells.js';

/** 使用中とみなされる最小の voiceDiag。 */
const ON = { enabled: true, spokenTotal: 10 };

/** @param {any} extra @param {string} id */
function cellOf(extra, id) {
  return buildVoiceDetailCells({ voiceDiag: { ...ON, ...extra } }).find((c) => c.id === id);
}

describe('読み上げの分解セル', () => {
  it('★使っていなければ1つも出さない(死にセルで埋めない)', () => {
    expect(buildVoiceDetailCells({ voiceDiag: { enabled: false, spokenTotal: 0, queueMax: 0 } }))
      .toEqual([]);
  });

  describe('合成の失敗(voice-synth-fail)', () => {
    it('★理由別の内訳を出す(多い順)', () => {
      const c = cellOf({ synthFailReasons: { timeout: 8, http: 2 } }, 'voice-synth-fail');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('timeout8件');
    });

    it('失敗なしなら ok', () => {
      const c = cellOf({ synthFailReasons: {} }, 'voice-synth-fail');
      expect(c?.level).toBe('ok');
    });
  });

  describe('空で返った(voice-synth-null)', () => {
    it('★時間切れ間際なら理由を添える', () => {
      const c = cellOf({ synthNullTotal: 12, synthNullNearTimeout: 5 }, 'voice-synth-null');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('VOICEVOXが重い');
    });
  });

  describe('追いつくための調整(voice-catchup)', () => {
    it('★どれだけ調整しても ok(防御=掟1)', () => {
      const c = cellOf({ mergeTotal: 900, rateClampTotal: 400, sustainedBoostTotal: 200 }, 'voice-catchup');
      expect(c?.level).toBe('ok');
      // 「なぜ静かなのか」を説明する
      expect(c?.text).toContain('900');
    });
  });

  describe('読み飛ばしの理由(voice-drop-reason)', () => {
    it('★件数上限が主因なら「設定で上げると読める」と言う', () => {
      const c = cellOf({ dropCountGateTotal: 20, dropHeadStaleTotal: 1, dropSweepStaleTotal: 1 }, 'voice-drop-reason');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('設定');
    });

    it('★鮮度切れが主因なら「合成が追いついていない」と言う(打ち手が違う)', () => {
      const c = cellOf({ dropCountGateTotal: 1, dropHeadStaleTotal: 10, dropSweepStaleTotal: 10 }, 'voice-drop-reason');
      expect(c?.text).toContain('追いついていません');
    });

    it('読み飛ばしなしなら ok', () => {
      const c = cellOf({}, 'voice-drop-reason');
      expect(c?.level).toBe('ok');
    });
  });

  describe('待ち(voice-queue)', () => {
    it('★満杯に近ければ warn', () => {
      const c = cellOf({ queueNow: 10, effectiveQueueMax: 10 }, 'voice-queue');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('いっぱい');
    });

    it('余裕があれば ok', () => {
      const c = cellOf({ queueNow: 1, effectiveQueueMax: 10 }, 'voice-queue');
      expect(c?.level).toBe('ok');
    });
  });

  describe('再生の打ち切り(voice-playback-timeout)', () => {
    it('★安全網で復帰したことを緑のまま記録する(少なければ)', () => {
      const c = cellOf({ playbackTimeoutTotal: 2 }, 'voice-playback-timeout');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('復帰');
    });

    it('多発すれば warn', () => {
      const c = cellOf({ playbackTimeoutTotal: 9 }, 'voice-playback-timeout');
      expect(c?.level).toBe('warn');
    });
  });
});
