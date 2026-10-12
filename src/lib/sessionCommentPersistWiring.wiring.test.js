/**
 * 全件配列の session 複製を「必要なときだけ」にする配線の固定(2026-10-12)。
 * 判定は sessionCommentCache.test.js(不変条件つき)。ここは popup-entry が使っているかを固定する。
 *
 * 実測: 読み込み1分後の重い時間帯(占有率約95%)の約3割(20秒窓で約6秒)が、heavy 読みのたびの全件複製だった。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'extension', 'popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('session への全件配列の複製は判定を通る(配線)', () => {
  const at = src.indexOf('if (!shouldPersistSessionCommentCache(_sessionCommentPersisted, lv, heavyArr.length, Date.now())) return;');
  const body = at < 0 ? '' : src.slice(at - 200, at + 900);

  it('判定の呼び出しが取れている(前提)', () => {
    expect(at).toBeGreaterThan(0);
  });

  it('判定は session.set の前にある(書く前に止める)', () => {
    expect(body.indexOf('shouldPersistSessionCommentCache(')).toBeLessThan(body.indexOf('chrome.storage.session'));
  });

  it('書く直前に記録し、書けなかったら記録を捨てる(次の機会に書き直す)', () => {
    expect(body).toContain('_sessionCommentPersisted = { lv: String(lv || \'\').trim().toLowerCase(), len: heavyArr.length, at: Date.now() };');
    expect(body).toContain('.catch(() => { _sessionCommentPersisted = null; });');
  });

  it('記録の宣言がある(モジュール先頭側)', () => {
    expect(src).toContain('let _sessionCommentPersisted = null;');
    expect(src.indexOf('let _sessionCommentPersisted = null;')).toBeLessThan(at);
  });

  it('import している', () => {
    expect(src).toMatch(/buildSessionCommentCache,\n\s+shouldPersistSessionCommentCache\n\} from '\.\.\/lib\/sessionCommentCache\.js';/);
  });
});
