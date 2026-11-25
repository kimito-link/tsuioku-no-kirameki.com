import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(path.join(root, 'extension-youtube/src/sr-content-entry.js'), 'utf8');

describe('SHOWROOM のコメント送信経路', () => {
  it('公式欄の探し方と、会場を開いたまま公式へ通す処理を使う', () => {
    expect(src).toContain("from '../../src/lib/showroom/srCommentInput.js'");
    expect(src).toContain('findSrCommentInput');
    expect(src).toContain('findSrSendButton');
    expect(src).toContain('withRevealedVenueOfficialComposer');
  });

  it('値入れはニコ生と同じ InputEvent で、送る前に今の公式の欄へ入れ直す', () => {
    expect(src).toContain('function fillSrCommentInput');
    expect(src).toContain("new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text })");
    const send = src.slice(src.indexOf("msg.type !== 'SR_SEND_COMMENT'"));
    expect(send).toContain('fillSrCommentInput(input, text)');
    expect(send).toContain('findSrCommentInput(document)');
    expect(send).toContain("String(live.value || '').trim() !== text");
    expect(send).toContain("reason: 'value-not-set'");
    expect(send).not.toContain('new MutationObserver');
    expect(send).not.toContain('setInterval');
  });

  it('成功確認は waitUntilEditorReflectsSubmit で今の公式の欄を読み、同じ文が残っているときだけ再クリックする', () => {
    const send = src.slice(src.indexOf("msg.type !== 'SR_SEND_COMMENT'"));
    expect(send).toContain('waitUntilEditorReflectsSubmit');
    expect(send).toContain('readSrCommentConfirmText');
    expect(send).toContain('if (!ok && readConfirm() === text)');
    expect(send).not.toContain('await sleep(400)');
  });
});
