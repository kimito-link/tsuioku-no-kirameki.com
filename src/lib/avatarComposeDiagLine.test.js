import { describe, expect, it } from 'vitest';
import { formatAvatarComposeDiagLine, KEY_AVATAR_COMPOSE_DIAG } from './avatarComposeDiagLine.js';

const NOW = 1_800_000_010_000;
const rec = (stats) => ({ at: NOW - 7000, stats });

describe('formatAvatarComposeDiagLine', () => {
  it('★記録が無ければ空(速報に何も足さない)', () => {
    expect(formatAvatarComposeDiagLine(null, NOW)).toBe('');
    expect(formatAvatarComposeDiagLine({ at: NOW }, NOW)).toBe('');
    expect(formatAvatarComposeDiagLine(/** @type {any} */ ('x'), NOW)).toBe('');
  });

  it('★Worker が動いた回の数・フォールバックの数・永続キャッシュの数を出す', () => {
    const line = formatAvatarComposeDiagLine(
      rec({ requested: 40, cacheHit: 3, persistedHit: 20, workerComposed: 15, workerFallback: 2, worker: { state: 'ready', started: 1, rendered: 15, failed: 2, timedOut: 0, lastError: '' } }),
      NOW
    );
    expect(line).toContain('7秒前');
    expect(line).toContain('要求40');
    expect(line).toContain('永続キャッシュ20');
    expect(line).toContain('Worker成功15');
    expect(line).toContain('Worker失敗→従来合成2');
    expect(line).toContain('Worker=ready');
    expect(line).toContain('起動1・成功15・失敗2・時間切れ0');
  });

  it('★dead のときは最後のエラーを出す(動いているつもりにならない)', () => {
    const line = formatAvatarComposeDiagLine(rec({ requested: 5, worker: { state: 'dead', lastError: 'onerror: Script error' } }), NOW);
    expect(line).toContain('Worker=dead');
    expect(line).toContain('最後のエラー: onerror: Script error');
  });

  it('Worker を使っていない(unused)なら、そう言う・壊れた値でも落ちない', () => {
    expect(formatAvatarComposeDiagLine(rec({ requested: 0 }), NOW)).toContain('Worker=unused');
    expect(() => formatAvatarComposeDiagLine(rec({ requested: 'x', worker: null }), NOW)).not.toThrow();
  });

  it('キーは契約として固定(popup が書き sidepanel が読む)', () => {
    expect(KEY_AVATAR_COMPOSE_DIAG).toBe('nls_avatar_compose_diag_v1');
  });
});
