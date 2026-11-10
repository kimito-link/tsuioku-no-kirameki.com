/**
 * service worker の本体(extension/background.js)に、束ねた中身の指紋を1行で刻む(v0.1.1971)。
 *
 * ★経緯(PC 実測 2026-11-10): manifest の版は 0.1.1970 なのに、service worker が importScripts で読む
 *   dist/yt-background.js が古い中身のまま動いていた(読み込まれた中身 83,928 文字・ディスクは 85,902 文字)。
 *   background.js 本体は版をまたいで1バイトも変わっていなかった。Chrome は service worker の本体が同じなら
 *   読み込み済みの importScripts の中身を使い回すことがある → YouTube 系の裏方の修正が届かない。
 *   本体に指紋を刻み、束ねた中身が変わるたびに本体のバイトも変わるようにする。
 */
export const SW_STAMP_PREFIX = '// nls-sw-fingerprint: ';

/**
 * @param {string} text background.js の中身
 * @param {string} fingerprint 指紋(英数字)
 * @returns {string} 刻んだ後の中身(同じ指紋なら元と同じ文字列)
 */
export function stampSwScript(text, fingerprint) {
  const fp = String(fingerprint || '').replace(/[^0-9a-z]/gi, '').slice(0, 16);
  const src = String(text || '');
  if (!fp) return src;
  const line = `${SW_STAMP_PREFIX}${fp}`;
  const re = /^\/\/ nls-sw-fingerprint: [0-9a-z]*$/im;
  if (re.test(src)) return src.replace(re, line);
  // 先頭の説明コメント(/** … */)の直後に入れる。無ければ先頭。
  const end = src.startsWith('/**') ? src.indexOf('*/') : -1;
  if (end >= 0) {
    const at = end + 2;
    return `${src.slice(0, at)}\n${line}${src.slice(at)}`;
  }
  return `${line}\n${src}`;
}
