import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const venue = readFileSync(new URL('../../app/live-view-venue.js', import.meta.url), 'utf8');

describe('配線: スマホのかんたん会場モード(v0.1.1739)', () => {
  it('★スナップショットを塗るたびにコメント鏡の行を会場へ渡し、🎪 ボタンを付ける(閲覧は止めない)', () => {
    expect(liveView).toContain('try { _venue.onRows(restoreCommentTimelineRows(jsonBlob.commentTimelineMirror || null)); } catch');
    expect(liveView).toContain('try { mountPhoneVenueUi(_venue); } catch');
  });
  it('★届いた文字は textContent だけ・顔が読めなければ既定の顔', () => {
    expect(venue).not.toMatch(/innerHTML/);
    expect(venue).toContain('img.src = DEFAULT_FACE;');
  });
  it('★閉じている間も「見た」ことは覚える(開いた瞬間に一斉に吹き出さない)', () => {
    expect(venue).toMatch(/seen = r\.seen;\s*if \(!isOpen\(\)\) return;/);
  });
});
