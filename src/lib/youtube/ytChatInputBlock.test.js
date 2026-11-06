/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { classifyYtChatInputBlock } from './ytChatInputBlock.js';

const docOf = (html) => {
  const d = document.implementation.createHTMLDocument('');
  d.body.innerHTML = html;
  return d;
};

describe('classifyYtChatInputBlock', () => {
  it('ログインの入口リンクがあれば not-signed-in', () => {
    const d = docOf('<div id="input-panel"><a href="https://accounts.google.com/ServiceLogin?x">ログイン</a></div>');
    expect(classifyYtChatInputBlock(d).reason).toBe('not-signed-in');
  });
  it('「ログインしてチャット」の文言でも not-signed-in', () => {
    const d = docOf('<div id="input-panel"><span>ログインしてチャットを始める</span></div>');
    expect(classifyYtChatInputBlock(d).reason).toBe('not-signed-in');
  });
  it('メンバー限定の帯だけ(ログイン中)は chat-restricted で、ログインしていないとは言わない', () => {
    const d = docOf(
      '<div id="input-panel"><yt-live-chat-restricted-participation-renderer><div id="message">メンバー限定モードです。メンバーになるとチャットできます。</div></yt-live-chat-restricted-participation-renderer></div>',
    );
    const r = classifyYtChatInputBlock(d);
    expect(r.reason).toBe('chat-restricted');
    expect(r.note).toContain('メンバー限定');
  });
  it('制限の帯の中にログインの入口があれば not-signed-in', () => {
    const d = docOf(
      '<yt-live-chat-restricted-participation-renderer><a href="https://www.youtube.com/ServiceLogin">ログイン</a></yt-live-chat-restricted-participation-renderer>',
    );
    expect(classifyYtChatInputBlock(d).reason).toBe('not-signed-in');
  });
  it('どれも無ければ no-input', () => {
    expect(classifyYtChatInputBlock(docOf('<div></div>')).reason).toBe('no-input');
  });
});
