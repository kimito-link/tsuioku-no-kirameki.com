import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場の Esc キー(v0.1.1657)。
 *   調査(2026-10-18): Esc が ①日本語入力の変換中 ②コメント欄など入力欄での操作中 ③「しまう」中 でも、
 *   会場ごと閉じていた(しまう=記録と表示を保ったままコメントを打つための機能なのに、Esc で全部捨てて閉じる)。
 *   ここでは onEscapeKey の入口の振る舞いを契約として固定する(中身の「発言→状態→一覧→会場」の順は別テスト)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('const onEscapeKey = (event) => {');
const body = src.slice(start, src.indexOf('const addEscapeListener', start));

describe('onEscapeKey の入口', () => {
  it('★変換中(isComposing / keyCode 229)は何もしない', () => {
    expect(start).toBeGreaterThan(0);
    expect(body).toContain('event.isComposing');
    expect(body).toContain('event.keyCode === 229');
  });

  it('★会場の外の入力欄(コメント欄など)での Esc は何もしない', () => {
    expect(body).toContain('isEditableOutsideVenue');
  });

  it('★しまい中の Esc は「戻す」だけで、会場を閉じない(パネル判定より前)', () => {
    const iTuck = body.indexOf('if (tucked)');
    const iSpeech = body.indexOf('if (!speechPanel.hidden)');
    expect(iTuck).toBeGreaterThan(0);
    expect(iSpeech).toBeGreaterThan(iTuck);
    expect(body.slice(iTuck, iSpeech)).toContain('setTucked(false)');
    expect(body.slice(iTuck, iSpeech)).toContain('return;');
  });

  it('★最後に会場を閉じる経路は残っている', () => {
    expect(body).toContain('setOpen(false, true)');
  });
});
