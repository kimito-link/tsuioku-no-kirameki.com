import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 鏡の書き込み抑制(v0.1.1581)の「配線忘れ=CI赤」。
 *   ゲートを作っても popup が渡さなければ【黙って全部書き続ける】(従来どおりに見えるので気づけない)。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popupSrc = read('extension/popup-entry.js');

/** 関数本体を取り出す(対応する括弧まで)。 */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

describe('popup は配信別の鏡の書き込みにゲートを通す', () => {
  const publishBody = fnBody(popupSrc, 'function publishLaneMirror(input)');

  it('publishLaneMirror の本体が取れている(前提)', () => {
    expect(publishBody.length).toBeGreaterThan(200);
  });

  it('★publishLaneMirrorPerLive の第4引数にゲートを渡している(行頭インデントまで固定)', () => {
    expect(publishBody).toMatch(/\n {4}\}, _laneMirrorWriteGate\);\n/);
  });

  it('ゲートはモジュールで1つだけ作る(呼び出しごとに作ると毎回「最初の1回」になって抑制が効かない)', () => {
    expect(popupSrc.match(/createLaneMirrorWriteGate\(/g)).toHaveLength(1);
    expect(popupSrc).toMatch(/\nconst _laneMirrorWriteGate = createLaneMirrorWriteGate\(\{ changeFloorMs: 8000 \}\);/);
  });

  it('★旧キー(バンドル)への合流は無条件のまま(会場の既存 reader は無変更)', () => {
    expect(publishBody).toMatch(/\n {4}mergeAndScheduleFlush\('lane', snap, snap && snap\.liveId, now\);\n/);
  });

  it('ゲート本体は chrome.* に触れない(純関数の層)', () => {
    const src = read('lib/laneMirrorWriteGate.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bchrome\./);
  });
});
