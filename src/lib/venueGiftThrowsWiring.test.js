import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 発言パネルのギフト明細の配線(v0.1.1659)。判定は lib(venueGiftThrowsForUser.js)に集約。
 * ここでは「venueBar が名前での突き合わせや独自の合計計算をしない」「lib を必ず通す」ことを固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const iHelper = src.indexOf('const readGiftHtmlForSpeech = async (uid, statsText) => {');
const helper = src.slice(iHelper, src.indexOf('その人の全発言を読み込んでパネルに出す', iHelper));
const iOpen = src.indexOf('const openSpeechPanelFor = async (who) => {');
const open = src.slice(iOpen, src.indexOf('const toggleRosterPanel', iOpen));

describe('発言パネルのギフト明細の配線', () => {
  it('★明細は lib を通して作る(uid・配信ID・タイルの🎁ptを渡す)', () => {
    expect(iHelper).toBeGreaterThan(0);
    expect(helper).toContain('giftThrowsForUser({');
    expect(helper).toContain('giftThrowsSectionHtml(');
    expect(helper).toContain('parseTileStatsText(statsText).gift');
    expect(helper).toContain('giftSubAppHistoryStorageKey(');
  });
  it('★storage の読みにタイムアウトを付ける(「読み込み中…」で固まらない)', () => {
    expect(helper).toContain('runStorageOpWithTimeout(');
  });
  it('★venueBar 側で名前(senderName / displayName)による絞り込みをしない', () => {
    expect(helper).not.toContain('senderName');
    expect(helper).not.toContain('displayName');
    expect(helper).not.toContain('.filter(');
  });
  it('★パネルは明細の区画を描画に入れる(取れなくても発言一覧は出す)', () => {
    expect(open).toContain('readGiftHtmlForSpeech(uid, statsText)');
    expect(open).toContain("insertAdjacentHTML('beforebegin', html)");
    // 閉じられた/別の人に替わったあとに差し込まない
    expect(open).toContain('gen !== speechOpenGen');
  });
});
