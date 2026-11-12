#!/usr/bin/env node
// measure-chat-input-widths.mjs — 窓の幅で、各サービスの公式のコメント入力欄・送信ボタンが DOM にあるか/見えているかを測る計器。
//
// ★2026-11-12 りんく「ミクチャの会場モードからコメント送信ができない」「広くするとコメントうてるっぽい」
//   「全部の配信サイトで同じ現象あるかもなので確認して」。会場の「ここから発言」は、各サービスの入口
//   (extension-youtube/src/*-content-entry.js)が公式の入力欄に文字を入れて公式のボタンを押す。
//   窓が狭いとサービス側がコメント欄を消す/隠すことがあり、そのとき入口が何を拾うかを幅ごとに記録する。
//
// 使い方(PC・新しい一時プロファイル・拡張なし・ログインなし):
//   node scripts/measure-chat-input-widths.mjs --out D:\chat-width-check <service>=<url> [<service>=<url> ...]
//   service は mixch / twitch / kick / whowatch / showroom / tiktok / abema / twitcasting / youtube / nico
//   幅は既定 1500,1000,760(--widths 1500,1000 で変えられる)。各幅でスクショと JSON を out に書く。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/** 各入口が実際に使っているセレクタ(入口のコードと同じ。変えたらここも) */
const SELECTORS = {
  mixch: { input: 'textarea[placeholder*="コメント"], input[placeholder*="コメント"], form textarea, form input[type="text"]', button: null },
  twitch: { input: '[data-a-target="chat-input"] [contenteditable="true"], [data-a-target="chat-input"][contenteditable="true"], textarea[data-a-target="chat-input"]', button: 'button[data-a-target="chat-send-button"]' },
  kick: { input: '#message-input, [data-testid="chat-input"], #chatroom-footer [contenteditable="true"], [data-lexical-editor="true"], textarea[placeholder*="message" i]', button: '#send-message-button, [data-testid="send-message-button"], #chatroom-footer button[aria-label*="send" i], button[aria-label*="Send message" i]' },
  whowatch: { input: 'form.item-form-area input, form.item-form-area textarea, textarea[placeholder*="コメント"], input[placeholder*="コメント"], textarea[name="comment"], input[name="comment"], form textarea', button: null },
  showroom: { input: 'input[placeholder="コメントを投稿"], textarea[placeholder="コメントを投稿"], .st-comment input[type="text"]', button: 'button.st-comment__button, .st-comment button[type="submit"]' },
  tiktok: { input: '[data-e2e="room-chat-input-field"]', button: '[data-e2e="room-chat-send-btn"]' },
  abema: { input: 'textarea, input[type="text"], [contenteditable="true"]', button: null },
  twitcasting: { input: '#comment-list-app textarea, #comment-list-app input[type="text"], form textarea[name="comment"], textarea[placeholder*="コメント"], input[placeholder*="コメント"]', button: null },
  youtube: { input: 'iframe#chatframe', button: null },
  nico: { input: 'textarea, input[type="text"], [contenteditable="true"]', button: null },
};

const args = process.argv.slice(2);
let out = path.resolve('.artifacts/chat-width-check');
let widths = [1500, 1000, 760];
/** @type {[string, string][]} */
const targets = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--out') out = path.resolve(args[++i]);
  else if (a === '--widths') widths = args[++i].split(',').map(Number).filter((n) => n > 0);
  else if (a.includes('=')) {
    const at = a.indexOf('=');
    targets.push([a.slice(0, at), a.slice(at + 1)]);
  }
}
if (!targets.length) {
  console.error('使い方: node scripts/measure-chat-input-widths.mjs --out <dir> mixch=https://mixch.tv/u/<番号>/live twitch=https://www.twitch.tv/<login> ...');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

/** ページの中で測る(関数は文字にして渡る) */
function probe(sel) {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.getClientRects().length > 0, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  };
  const anc = (el, n) => {
    const a = [];
    let p = el.parentElement;
    while (p && a.length < n) {
      a.push(`${p.tagName.toLowerCase()}${p.id ? `#${p.id}` : ''}${typeof p.className === 'string' && p.className ? `.${p.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`);
      p = p.parentElement;
    }
    return a;
  };
  const desc = (el) => ({
    tag: el.tagName.toLowerCase(),
    placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
    aria: el.getAttribute('aria-label') || '',
    cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
    inForm: !!el.closest('form'),
    ...vis(el),
    anc: anc(el, 5),
  });
  const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]')).slice(0, 30).map(desc);
  const sendButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
    .filter((b) => /送信|コメント|Send|Chat|Comment/i.test(`${b.textContent || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('value') || ''}`))
    .slice(0, 30)
    .map((b) => ({ text: String(b.textContent || '').trim().slice(0, 40), disabled: !!b.disabled, ...desc(b) }));
  const entryInput = sel.input ? document.querySelector(sel.input) : null;
  const entryButton = sel.button ? document.querySelector(sel.button) : null;
  return {
    url: location.href,
    viewport: [innerWidth, innerHeight],
    entryInput: entryInput ? desc(entryInput) : null,
    entryButton: entryButton ? desc(entryButton) : null,
    inputs,
    sendButtons,
  };
}

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(out, 'profile-')), { headless: false, viewport: null, args: ['--window-size=1500,1000'] });
const page = ctx.pages()[0] || (await ctx.newPage());
const summary = [];
for (const [svc, url] of targets) {
  const sel = SELECTORS[svc] || SELECTORS.nico;
  try {
    await page.setViewportSize({ width: widths[0], height: 1000 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
  } catch (e) {
    summary.push({ svc, url, error: String(e).slice(0, 200) });
    continue;
  }
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(4000);
    let r;
    try {
      r = await page.evaluate(probe, sel);
    } catch (e) {
      r = { error: String(e).slice(0, 200) };
    }
    fs.writeFileSync(path.join(out, `${svc}-${w}.json`), JSON.stringify(r, null, 2));
    await page.screenshot({ path: path.join(out, `${svc}-${w}.png`) }).catch(() => {});
    summary.push({
      svc,
      width: w,
      entryInput: r.entryInput ? `${r.entryInput.tag} shown=${r.entryInput.shown} ph=${r.entryInput.placeholder}` : 'なし',
      entryButton: sel.button ? (r.entryButton ? `shown=${r.entryButton.shown} disabled=${r.entryButton.disabled ?? ''}` : 'なし') : '(文字で探す)',
      inputsShown: (r.inputs || []).filter((x) => x.shown).length,
      inputsAll: (r.inputs || []).length,
      sendButtons: (r.sendButtons || []).map((b) => `${b.text || b.aria}${b.shown ? '' : '(隠)'}`).join(' / '),
    });
  }
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.table(summary);
await ctx.close();
