import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(path.join(root, 'extension-youtube/src/mx-content-entry.js'), 'utf8');

describe('ミクチャの送りは SHOWROOM / YouTube と同じ共通経路', () => {
  it('送信は withRevealedVenueOfficialComposer と、間隔を置いて findMxCommentInput をやり直すだけ', () => {
    expect(src).toContain('withRevealedVenueOfficialComposer');
    expect(src).toContain('for (let i = 0; !input && i < 6; i += 1)');
    expect(src).toContain('await sleep(250)');
    expect(src).toContain('input = findMxCommentInput(document)');
    expect(src).toContain("Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, text)");
    expect(src).toContain("input.dispatchEvent(new Event('input', { bubbles: true }))");
  });

  it('0.1.2184 で足した独自の MutationObserver 待ちは使わない', () => {
    const send = src.slice(src.indexOf("msg.type !== 'MX_SEND_COMMENT'"));
    expect(send).not.toContain('new MutationObserver');
    expect(send).not.toContain('const waitForInput');
  });
});
