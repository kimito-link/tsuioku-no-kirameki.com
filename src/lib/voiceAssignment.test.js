import { describe, expect, it } from 'vitest';
import {
  assignVoiceForUser,
  resolveVoiceForUser
} from './voiceAssignment.js';

const styles = [1, 3, 8, 10, 14, 20];

describe('assignVoiceForUser', () => {
  it('同じ userKey は毎回同じ割り当てになる', () => {
    expect(assignVoiceForUser('u:123', styles)).toEqual(
      assignVoiceForUser('u:123', styles)
    );
  });

  it('styleIds の新しい配列でも同じ結果になる', () => {
    expect(assignVoiceForUser('u:123', [...styles])).toEqual(
      assignVoiceForUser('u:123', styles)
    );
  });

  it('別 userKey 群は複数の声パラメータへ分散する', () => {
    const assigned = new Set(
      Array.from({ length: 100 }, (_, index) =>
        JSON.stringify(assignVoiceForUser(`u:${index}`, styles))
      )
    );
    expect(assigned.size).toBeGreaterThan(20);
  });

  it('空 styleIds はずんだもんノーマルへフォールバックする', () => {
    expect(assignVoiceForUser('u:1', [])).toEqual({
      styleId: 3,
      pitchOffset: 0,
      speedOffset: 0
    });
  });

  it('配列でない styleIds もフォールバックする', () => {
    expect(assignVoiceForUser('u:1', null)).toEqual({
      styleId: 3,
      pitchOffset: 0,
      speedOffset: 0
    });
  });

  it('styleId は渡した一覧のいずれかになる', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(styles).toContain(assignVoiceForUser(`u:${index}`, styles).styleId);
    }
  });

  it('pitchOffset は規定の5段階のいずれかになる', () => {
    const allowed = [-0.06, -0.03, 0, 0.03, 0.06];
    for (let index = 0; index < 50; index += 1) {
      expect(allowed).toContain(
        assignVoiceForUser(`u:${index}`, styles).pitchOffset
      );
    }
  });

  it('speedOffset は規定の3段階のいずれかになる', () => {
    const allowed = [0, 0.05, 0.1];
    for (let index = 0; index < 50; index += 1) {
      expect(allowed).toContain(
        assignVoiceForUser(`u:${index}`, styles).speedOffset
      );
    }
  });

  it('日本語や匿名キーも決定論的に扱う', () => {
    const first = assignVoiceForUser('n:匿名の視聴者', styles);
    expect(assignVoiceForUser('n:匿名の視聴者', styles)).toEqual(first);
  });

  it('数値へ変換できない styleId は候補から除外する', () => {
    expect(assignVoiceForUser('u:1', ['invalid'])).toEqual({
      styleId: 3,
      pitchOffset: 0,
      speedOffset: 0
    });
  });
});

describe('resolveVoiceForUser', () => {
  it('対象 userKey の手動上書きを優先する', () => {
    const override = { styleId: 99, pitchOffset: -0.02, speedOffset: 0.08 };
    expect(
      resolveVoiceForUser('u:123', { 'u:123': override }, [1, 3, 8])
    ).toEqual(override);
  });

  it('対象 userKey の上書きが無ければ自動割り当てへ戻る', () => {
    expect(resolveVoiceForUser('u:123', { 'u:999': {} }, styles)).toEqual(
      assignVoiceForUser('u:123', styles)
    );
  });

  it('上書きの欠けた offset は0として補う', () => {
    expect(
      resolveVoiceForUser('u:123', { 'u:123': { styleId: 7 } }, styles)
    ).toEqual({ styleId: 7, pitchOffset: 0, speedOffset: 0 });
  });
});
