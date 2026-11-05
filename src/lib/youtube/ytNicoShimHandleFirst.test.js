// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { numericUidForYtKey, __fixTextNodeForTest } from '../../../extension-youtube/src/ytNicoShim.js';

/** ニコ生版の人物タイル(personTileDom)と同じ形: 1行目=ID・2行目=名前 */
function tile(idText, nameText) {
  const meta = document.createElement('span');
  meta.className = 'nl-story-userlane-meta';
  const id = document.createElement('span');
  id.className = 'nl-story-userlane-meta__id';
  id.textContent = idText;
  const nm = document.createElement('span');
  nm.className = 'nl-story-userlane-meta__name';
  nm.textContent = nameText;
  meta.append(id, nm);
  document.body.appendChild(meta);
  return { id, nm };
}

describe('人物タイルは @ハンドルを先・ID を後に(0.1.97 りんく)', () => {
  it('1行目の疑似IDを直すとき、@ハンドルを1行目・UC… を2行目にする', () => {
    const uid = numericUidForYtKey('UCnzFjewAAAAAAAAAALd_uRQ');
    const { id, nm } = tile(uid, '@eight-ul2cj');
    __fixTextNodeForTest(/** @type {Text} */ (id.firstChild));
    expect(id.textContent).toBe('@eight-ul2cj');
    expect(nm.textContent).toBe('UCnzFjew…Ld_uRQ');
  });

  it('@ハンドルしか分からない人(1行目と2行目が同じ)は同じ文字を2回出さない', () => {
    const uid = numericUidForYtKey('handle:@only-handle');
    const { id, nm } = tile(uid, '@only-handle');
    __fixTextNodeForTest(/** @type {Text} */ (id.firstChild));
    expect(id.textContent).toBe('@only-handle');
    expect(nm.textContent).toBe('@only-handle');
  });
});
