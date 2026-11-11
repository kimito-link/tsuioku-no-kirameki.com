// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { numericUidForYtKey, ytDropEmptyIdTag, __fixTextNodeForTest } from '../../../extension-youtube/src/ytNicoShim.js';

describe('見せられる ID が無い人は「・ ID:」を残さない', () => {
  it('ID を持たないサービスの人(@ログイン名が分からない)は区切りごと消す', () => {
    const uid = numericUidForYtKey('ab:A2AmVn58ed3nrb');
    expect(ytDropEmptyIdTag(`A2AmVn58ed3nrb ・ ID:${uid}`)).toBe('A2AmVn58ed3nrb');
  });

  it('会場の PICK UP の1行目(文字の節)でも空の「・ ID:」が出ない', () => {
    const uid = numericUidForYtKey('ab:B3BnWo69fe4osc');
    const meta = document.createElement('div');
    meta.className = 'nlsb-pickup__meta';
    meta.textContent = `B3BnWo69fe4osc ・ ID:${uid}`;
    document.body.appendChild(meta);
    __fixTextNodeForTest(/** @type {Text} */ (meta.firstChild));
    expect(meta.textContent).toBe('B3BnWo69fe4osc');
  });

  it('YouTube の人は今までどおり ID を出す', () => {
    const uid = numericUidForYtKey('handle:@keep-handle');
    expect(ytDropEmptyIdTag(`名前 ・ ID:${uid}`)).toBe('名前 ・ ID:@keep-handle');
  });

  it('知らない数字はそのまま', () => {
    expect(ytDropEmptyIdTag('名前 ・ ID:8000000001')).toBe('名前 ・ ID:8000000001');
  });
});
