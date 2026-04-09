import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popupPath = path.join(repoRoot, 'extension', 'popup.html');

describe('extension/popup.html — 匿名 Identicon 説明', () => {
  const html = readFileSync(popupPath, 'utf8');

  it('ヒント段落と data 属性でコピーを固定できる', () => {
    expect(html).toContain('id="anonymousIdenticonHint"');
    expect(html).toContain('data-nl-popup-copy="anonymous-identicon"');
  });

  it('チェックと LP 深いリンク・既定オンを含む', () => {
    expect(html).toContain('id="anonymousIdenticonEnabled"');
    expect(html).toContain('aria-describedby="anonymousIdenticonHint"');
    expect(html).toContain('https://tsuioku-no-kirameki.com/#lp-anonymous-identicon');
    expect(html).toContain('既定オン');
  });
});
