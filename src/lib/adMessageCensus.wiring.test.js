import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 広告メッセージ計器の【配線】検査。
 *
 * ■ なぜ要るか(2026-08-18 ユーザー確定)
 *   「広告はメッセージが送れるという価値があるので、そのメッセージも記録したい」。
 *   記録する前に【いま届いている生データに本文が入っているか】を実機で確定する必要がある
 *   (入っていれば画面を読まずに済む=壊れにくい)。
 *
 * ★計器を書いただけで呼ばれていない、を防ぐ(今日1度踏んだ)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const INTERCEPT = 'src/extension/page-intercept-entry.js';

describe('広告メッセージ計器の配線', () => {
  it('★生データ1件ごとに本文の有無を数えている', () => {
    const code = strip(read(INTERCEPT));
    expect(code).toContain('_ndgr.giftsMsg++');
    // 候補キーを順に見る(どの名前で来るか不明なため)
    expect(code).toMatch(/'message',\s*'adMessage',\s*'advertiserMessage'/);
  });

  it('★既存のギフト走査に相乗りしている(新しい走査を作らない)', () => {
    const code = strip(read(INTERCEPT));
    const at = code.indexOf('_ndgr.giftsRank++');
    expect(at).toBeGreaterThan(-1);
    // 既存カウンタのすぐ後ろで数える=ループを増やさない
    expect(code.slice(at, at + 400)).toContain('_ndgr.giftsMsg++');
  });

  it('★外に出る(data 属性に載らなければ速報に出ない=無いのと同じ)', () => {
    const code = strip(read(INTERCEPT));
    expect(code).toContain('gm=${_ndgr.giftsMsg}');
    expect(code).toContain('gmk=${_ndgr.giftsMsgKey');
    expect(code).toContain('gml=${_ndgr.giftsMsgMaxLen}');
  });

  it('★その属性は状態速報まで運ばれている(経路の実在確認)', () => {
    const content = strip(read('src/extension/content-entry.js'));
    expect(content).toContain("getAttribute('data-nls-ndgr')");
    expect(content).toMatch(/_debug\.ndgr\s*=/);
  });

  it('★本文そのものは data 属性に出さない(PIIを増やさない)', () => {
    const code = read(INTERCEPT);
    // 属性に載せるのは 件数/フィールド名/最大長 だけ。本文の変数を直接載せていないこと。
    const at = code.indexOf('gm=${_ndgr.giftsMsg}');
    const line = code.slice(at - 200, at + 200);
    expect(line).not.toMatch(/\$\{mv\}|\$\{.*sample.*\}/);
  });
});
