/**
 * ★v0.1.1393: 「なふだ」をPOPから操作する配線テスト。
 *   3層(POPのボタン → content のハンドラ → 公式トグル)が全部つながっていること。
 *   1層でも欠けると「押しても何も起きない」になる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describeNameplateResult } from './nameplateToggleBoot.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../extension/popup.html'), 'utf8');
const entry = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');
const content = readFileSync(join(here, '../extension/content-entry.js'), 'utf8');
const boot = readFileSync(join(here, 'nameplateToggleBoot.js'), 'utf8');

describe('なふだ切替の3層配線', () => {
  it('① POP にボタンと結果表示がある', () => {
    expect(html).toContain('nameplateOnBtn');
    expect(html).toContain('nameplateOffBtn');
    expect(html).toContain('nameplateToggleNote');
  });

  it('② popup が boot を読み込み、boot が watch タブへ送る', () => {
    expect(entry).toContain("import '../lib/nameplateToggleBoot.js'");
    expect(boot).toContain('NLS_NAMEPLATE_TOGGLE');
    expect(boot).toContain('tabs.sendMessage');
  });

  it('③ content 側に受け口があり、公式トグルを探して押す', () => {
    expect(content).toContain("msg.type === 'NLS_NAMEPLATE_TOGGLE'");
    expect(content).toContain('findNameplateToggle');
    expect(content).toContain('decideNameplateClick');
  });

  it('★状態が読めないときは押さない配線になっている(逆操作の事故防止)', () => {
    expect(content).toContain('unknown-state');
  });

  it('結果はユーザーの言葉で返す', () => {
    expect(describeNameplateResult({ ok: true, changedTo: true })).toContain('表示にしました');
    expect(describeNameplateResult({ ok: true, changedTo: false })).toContain('隠しました');
    expect(describeNameplateResult({ ok: true, reason: 'already', current: true })).toContain('すでに');
    expect(describeNameplateResult({ ok: false, error: 'これこれ' })).toBe('これこれ');
    expect(describeNameplateResult(null)).toContain('できませんでした');
  });

  it('★拡張側に状態を保存していない(公式が正本=食い違いを作らない)', () => {
    expect(boot).not.toMatch(/storage\.local\.set/);
  });
});
