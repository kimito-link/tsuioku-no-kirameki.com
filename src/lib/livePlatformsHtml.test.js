import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlatformSectionHtml, buildPlatformCardHtml, platformsErrorHtml } from './livePlatformsHtml.js';

const FACES = { linkBlink: 'blink.png', linkNormal: 'normal.png', tanuHalf: 'tanu.png' };
const NOW = Date.parse('2026-10-01T05:00:00Z');

/** @param {Partial<import('./kickLivestreams.js').PlatformLive>} over */
function live(over = {}) {
  return {
    platform: 'kick', id: '1', url: 'https://kick.com/taro', title: '雑談', thumbnail: 'https://images.kick.com/t.webp',
    channel: { name: 'taro', icon: 'https://files.kick.com/i.webp', url: 'https://kick.com/taro' },
    viewers: 1234, startedAt: Date.parse('2026-10-01T03:40:00Z'), category: 'Just Chatting', mature: false, language: 'ja',
    ...over
  };
}

/** @param {any} [over] */
function section(over = {}) {
  return {
    ok: true, platform: 'kick', capturedAt: NOW - 2 * 60000, count: 3, shown: 3, truncated: false, matureCount: 0,
    language: 'ja', source: 'kick-public-api-v2',
    lives: [live({ id: '1', viewers: 900 }), live({ id: '2', viewers: 500 }), live({ id: '3', viewers: 10 })],
    ...over
  };
}

const opts = { nowMs: NOW, faces: FACES };

describe('buildPlatformSectionHtml', () => {
  it('ok:false / disabled / no credentials / undefined は空（描かない）', () => {
    expect(buildPlatformSectionHtml(undefined, opts)).toBe('');
    expect(buildPlatformSectionHtml({ ok: false, error: 'no credentials', lives: [] }, opts)).toBe('');
    expect(buildPlatformSectionHtml({ ok: false, disabled: true, error: 'disabled', lives: [] }, opts)).toBe('');
    expect(buildPlatformSectionHtml({ ok: false, error: 'not implemented', platform: 'youtube', lives: [] }, opts)).toBe('');
  });

  it('まだ取得できていない(not collected yet)は見出し＋その旨を出す', () => {
    const html = buildPlatformSectionHtml({ ok: false, platform: 'kick', error: 'not collected yet', lives: [] }, opts);
    expect(html).toContain('data-platform="kick"');
    expect(html).toContain('まだ取得できていません');
  });

  it('lives 空は見出し＋「表示できる日本語配信がありません」', () => {
    const html = buildPlatformSectionHtml(section({ lives: [], count: 0, shown: 0 }), opts);
    expect(html).toContain('data-platform="kick"');
    expect(html).toContain('表示できる日本語配信がありません');
    expect(html).not.toContain('class="plive"');
  });

  it('viewers 降順を変えず、maxLives で切る', () => {
    const many = Array.from({ length: 25 }, (_, i) => live({ id: String(i), viewers: 100 - i }));
    const html = buildPlatformSectionHtml(section({ lives: many, count: 25, shown: 25 }), opts);
    const ids = [...html.matchAll(/data-id="(\d+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(20);
    expect(ids.slice(0, 3)).toEqual(['0', '1', '2']);
    const html5 = buildPlatformSectionHtml(section({ lives: many }), { ...opts, maxLives: 5 });
    expect([...html5.matchAll(/data-id="/g)]).toHaveLength(5);
  });

  it('mature は既定で除外し「成人向け N 件は表示していません」。showMature:true なら描く', () => {
    const lives = [live({ id: '1' }), live({ id: '2', mature: true })];
    const html = buildPlatformSectionHtml(section({ lives }), opts);
    expect(html).toContain('data-id="1"');
    expect(html).not.toContain('data-id="2"');
    expect(html).toContain('成人向け 1 件は表示していません');
    const shown = buildPlatformSectionHtml(section({ lives }), { ...opts, showMature: true });
    expect(shown).toContain('data-id="2"');
    expect(shown).not.toContain('成人向け');
  });

  it('配信中 N は表示した件数（成人向けを除いた数）', () => {
    const lives = [live({ id: '1' }), live({ id: '2', mature: true }), live({ id: '3' })];
    const html = buildPlatformSectionHtml(section({ lives }), opts);
    expect(html).toContain('配信中 <b>2</b> 配信');
  });

  it('truncated:true で「上位のみ表示」', () => {
    expect(buildPlatformSectionHtml(section({ truncated: true }), opts)).toContain('上位のみ表示');
    expect(buildPlatformSectionHtml(section(), opts)).not.toContain('上位のみ表示');
  });

  it('stale な capturedAt で .stale と ⚠ 文言', () => {
    const html = buildPlatformSectionHtml(section({ capturedAt: NOW - 90 * 60000 }), opts);
    expect(html).toContain('class="stale"');
    expect(html).toContain('⚠ 90分前の情報です');
    expect(buildPlatformSectionHtml(section(), opts)).toContain('2分前 更新');
  });

  it('出典表示を必ず出す', () => {
    expect(buildPlatformSectionHtml(section(), opts)).toContain('出典: Kick 公式 API');
  });
});

describe('buildPlatformCardHtml', () => {
  it('title/name の <script> はエスケープされる', () => {
    const html = buildPlatformCardHtml(live({ title: '<script>x</script>', channel: { name: '<b>n</b>', icon: '', url: 'https://kick.com/taro' } }), 1, NOW, NOW, FACES);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;n&lt;/b&gt;');
  });

  it('url が空は <a> を作らない、thumbnail が空は .noimg', () => {
    const html = buildPlatformCardHtml(live({ url: '', thumbnail: '', channel: { name: 'a', icon: '', url: '' } }), 1, NOW, NOW, FACES);
    expect(html).not.toContain('<a ');
    expect(html).toContain('class="noimg"');
    expect(html).toContain('src="normal.png"');
  });

  it('同時視聴は桁区切り＋「（Kick の値）」、「推定」の語を含まない', () => {
    const html = buildPlatformCardHtml(live({ viewers: 12345 }), 1, NOW, NOW, FACES);
    expect(html).toContain('12,345人');
    expect(html).toContain('同時視聴（Kick の値）');
    expect(html).not.toContain('推定');
  });

  it('referrerpolicy="no-referrer" と cacheBust の ?t= が付く', () => {
    const html = buildPlatformCardHtml(live(), 2, 777, NOW, FACES);
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('t.webp?t=777');
    expect(html).toContain('class="rankno r2"');
  });

  it('開始時刻と経過は startedAt(ms) から出す', () => {
    const html = buildPlatformCardHtml(live(), 1, NOW, NOW, FACES);
    expect(html).toContain('12:40 開始');
    expect(html).toContain('1時間20分');
  });
});

describe('platformsErrorHtml', () => {
  it('メッセージをエスケープして出す', () => {
    const html = platformsErrorHtml('<x>', 'tanu.png');
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('tanu.png');
  });
});

describe('livePlatformsHtml.js の境界', () => {
  it('★推定・増分・順位推移の関数を import していない', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, 'livePlatformsHtml.js'), 'utf8');
    expect(src).not.toMatch(/estimateConcurrent|createGiftPulseRegistry|createRowChangeTracker|sortByEstimatedConcurrent/);
  });
});
