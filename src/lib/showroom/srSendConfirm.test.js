import { describe, expect, it } from 'vitest';
import { isEditorReflectingSubmit } from '../commentSubmitConfirm.js';
import { readSrCommentConfirmText } from './srSendConfirm.js';

describe('readSrCommentConfirmText', () => {
  it('切り離された欄に文字が残っていても、今の公式の欄が空なら成功と読む', () => {
    const detached = { isConnected: false, value: '女の子は大変' };
    const live = { isConnected: true, value: '' };
    expect(readSrCommentConfirmText(detached, live)).toBe('');
    expect(isEditorReflectingSubmit('女の子は大変', readSrCommentConfirmText(detached, live))).toBe(true);
  });

  it('今の公式の欄が無ければ、書き込んだ欄の文字を返す', () => {
    const detached = { isConnected: false, value: '女の子は大変' };
    expect(readSrCommentConfirmText(detached, null)).toBe('女の子は大変');
    expect(isEditorReflectingSubmit('女の子は大変', readSrCommentConfirmText(detached, null))).toBe(false);
  });

  it('今の公式の欄に別の文字があれば、そちらを返す', () => {
    const written = { isConnected: true, value: '女の子は大変' };
    const live = { isConnected: true, value: 'こんにちは' };
    expect(readSrCommentConfirmText(written, live)).toBe('こんにちは');
  });
});
