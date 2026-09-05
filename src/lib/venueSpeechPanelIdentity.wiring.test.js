import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { anonymousDisplayLabel } from './nicoUserPage.js';

/*
 * ★発言パネルの見出しが「人の情報セット」になっているかの配線ガード（2026-08-30）。
 *
 *   ■ なぜ要るか
 *     発言パネルは「アイコンを押す → その人の発言を全部読む」場所なのに、
 *     見出しが★名前だけのプレーンテキストで、その人へ行く手段が無かった。
 *       読む → 気に入る → でもプロフィールへ行けない（★行き止まり）
 *     AGENTS.md §3.5「サムネ・ID・ハンドルネーム・リンクをセットで出す。
 *     ID だけ・名前だけ…の中途半端な表示は原則違反」に当たる箇所だった。
 *
 *   ■ ★このテストが無いと、また名前だけに戻る
 *     実測: 変更前は nlsb-roster-title / nlsb-speech-panel を検査するテストが
 *     リポ内に【0件】だった。だから名前だけの状態が生き延びた。
 *
 *   ■ ★ここは席タイルでもホバーカードでもない
 *     ①POP=②プレビュー=③会場=④WEB のパリティ検査（順序・DOM構造・タイル寸法）は
 *     席タイル側の話で、このパネルは対象外。だから安全に触れる。
 */

const venueBarSrc = readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');

describe('★発言パネルの見出しは §3.5 のセットで出す', () => {
  it('見出しの組み立てが1箇所に束ねられている（2箇所でバラバラに組まない）', () => {
    // ★以前は「読み込み中」と「読み込み後」で別々に見出しを組んでいた＝片方だけ直る事故が起きる。
    expect(venueBarSrc).toMatch(/const buildSpeechPanelHeadHtml\s*=/);
    // 呼び出しは2箇所（読み込み中・読み込み後）。定義は `= (` なのでこの正規表現には当たらない。
    const calls = venueBarSrc.match(/ buildSpeechPanelHeadHtml\(/g) || [];
    expect(calls.length).toBe(2);
  });

  it('★名前がプロフィールリンクになっている（既存の共有部品を使う）', () => {
    expect(venueBarSrc).toMatch(/import \{ buildUserProfileLinkedLabelHtml \} from '\.\.\/lib\/userProfileLinkHtml\.js'/);
    const fnAt = venueBarSrc.indexOf('const buildSpeechPanelHeadHtml');
    const block = venueBarSrc.slice(fnAt, fnAt + 1200);
    expect(block).toMatch(/buildUserProfileLinkedLabelHtml\(uid, name\)/);
    // ★退化ガード: 名前を素の escapeHtml に戻したら赤。
    expect(block).not.toMatch(/nlsb-roster-title">\$\{escapeHtml\(name\)\}/);
  });

  it('★サムネを出す（新規取得はしない＝クリック元タイルから貰う）', () => {
    const fnAt = venueBarSrc.indexOf('const buildSpeechPanelHeadHtml');
    const block = venueBarSrc.slice(fnAt, fnAt + 1200);
    expect(block).toMatch(/nlsb-roster-avatar/);
    // 呼び出し側が既存 img の src を読んでいる（fetch や新規 Image を作らない）。
    expect(venueBarSrc).toMatch(/imgEl\.currentSrc \|\| imgEl\.src/);
    const callAt = venueBarSrc.indexOf('void openSpeechPanelFor(');
    const callBlock = venueBarSrc.slice(callAt - 800, callAt + 200);
    expect(callBlock).not.toMatch(/new Image\(|fetch\(/);
  });

  it('★匿名の見出しが生の a:xxxx にならない', () => {
    const fnAt = venueBarSrc.indexOf('const openSpeechPanelFor');
    const block = venueBarSrc.slice(fnAt, fnAt + 1400);
    expect(block).toMatch(/anonymousDisplayLabel\(uid\)/);
    // ★退化ガード: uid をそのままフォールバックに使う形に戻したら赤。
    expect(block).not.toMatch(/String\(who\?\.displayName \|\| ''\)\.trim\(\) \|\| uid \|\|/);
  });

  it('CSS が入っている（リンクが押せると見て分かる・サムネの箱がある）', () => {
    expect(venueBarSrc).toMatch(/\.nlsb-roster-avatar\s*\{/);
    expect(venueBarSrc).toMatch(/\.nlsb-roster-title \.nl-user-profile-link\s*\{/);
  });
});

describe('★リンク化の中身（共有部品の実挙動を固定する）', () => {
  it('数値IDはニコニコのユーザーページへのリンクになる', () => {
    const html = buildUserProfileLinkedLabelHtml('143140387', '銀ちゃ');
    expect(html).toContain('https://www.nicovideo.jp/user/143140387');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('銀ちゃ');
  });

  it('★匿名はリンクにならない（プロフィールページが存在しないため）', () => {
    const label = anonymousDisplayLabel('a:d8KyTJKlU_rTi7sC');
    const html = buildUserProfileLinkedLabelHtml('a:d8KyTJKlU_rTi7sC', label);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('nicovideo.jp/user');
    expect(html).toContain(label);
  });

  it('★名前は必ず escape される（コメント本文由来の名前でも壊れない）', () => {
    const html = buildUserProfileLinkedLabelHtml('143140387', '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('★一言は既存の純関数を使う（文言の正本を増やさない）', () => {
  it('venuePresenceNote を import している', () => {
    expect(venueBarSrc).toMatch(/import \{ buildVenuePresenceNote \} from '\.\.\/lib\/venuePresenceNote\.js'/);
  });

  it('★storage の追加読みをしない（手元の rows/total だけで組む）', () => {
    const at = venueBarSrc.indexOf('presenceNote = buildVenuePresenceNote(');
    expect(at).toBeGreaterThan(0);
    const block = venueBarSrc.slice(at - 600, at + 300);
    expect(block).not.toMatch(/chrome\.storage|await read|openCommentDb/);
    expect(block).toMatch(/count: total/);
  });
});
