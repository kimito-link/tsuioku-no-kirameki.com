import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPopupErrorLine, buildPopupErrorProbe } from './popupErrorLine.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★v0.1.1377: popup の例外を速報に出す(バグ検出の計器)。
 *
 * 旧実装は popup の error/unhandledrejection を購読していたが
 * 「Extension context invalidated」を握り潰すだけで**他は何も記録しなかった**。
 * ＝ユーザーが一番見る画面で例外が出ても、速報にも storage にも1件も残らない。
 * content-entry.js は v0.1.201 から同じ ring buffer を持っており、popup だけが
 * 非対称に無防備だった。
 */
describe('formatPopupErrorLine — 読んで次の一手が決まる形にする', () => {
  it('0件は「異常なし」と断言せず、観測できていることを示す', () => {
    // [[zero-count-may-mean-unmeasured-2026-08-04]]: 0 が「異常なし」か「未計測」かを区別する。
    const line = formatPopupErrorLine({ recentErrors: [], totalCount: 0, ignoredCount: 0 });
    expect(line).toContain('0件');
    expect(line).toContain('観測中');
  });

  it('★件数だけでなく【直近のメッセージ】を出す(件数だけでは直せない)', () => {
    const line = formatPopupErrorLine(
      {
        recentErrors: [
          { message: 'old one', source: 'window.error', timestamp: 1000 },
          { message: "Cannot read properties of undefined (reading 'foo')", source: 'window.error', timestamp: 2000 }
        ],
        totalCount: 2,
        ignoredCount: 0
      },
      2000
    );
    expect(line).toContain('2件');
    // 最新のものが出ること(古い方ではない)。
    expect(line).toContain("Cannot read properties of undefined (reading 'foo')");
    expect(line).not.toContain('old one');
  });

  it('同期/非同期(unhandledrejection)を区別して出す', () => {
    const sync = formatPopupErrorLine(
      { recentErrors: [{ message: 'x', source: 'window.error', timestamp: 1 }], totalCount: 1 },
      1
    );
    expect(sync).toContain('同期');
    const async_ = formatPopupErrorLine(
      { recentErrors: [{ message: 'x', source: 'unhandledrejection', timestamp: 1 }], totalCount: 1 },
      1
    );
    expect(async_).toContain('非同期');
  });

  it('無害なもの(ノイズ)は別掲する=実害だけを主役にする', () => {
    const line = formatPopupErrorLine(
      { recentErrors: [{ message: 'boom', source: 'window.error', timestamp: 1 }], totalCount: 1, ignoredCount: 7 },
      1
    );
    expect(line).toContain('無害なもの7件は除外');
  });

  it('長すぎるメッセージは切り詰める(速報を埋めない)', () => {
    const long = 'E'.repeat(500);
    const line = formatPopupErrorLine(
      { recentErrors: [{ message: long, source: 'window.error', timestamp: 1 }], totalCount: 1 },
      1
    );
    expect(line).toContain('…');
    expect(line.length).toBeLessThan(300);
  });

  it('経過時間を出す(いま起きているのか昔なのかで一手が変わる)', () => {
    const line = formatPopupErrorLine(
      { recentErrors: [{ message: 'x', source: 'window.error', timestamp: 1000 }], totalCount: 1 },
      1000 + 5000
    );
    expect(line).toContain('5秒前');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatPopupErrorLine(null)).toBe('');
  });
});

describe('buildPopupErrorProbe — 診断ペイロードの組み立て', () => {
  it('snapshot に line を添えて返す', () => {
    const fake = {
      snapshot: () => ({
        recentErrors: [{ message: 'boom', source: 'window.error', timestamp: Date.now() }],
        totalCount: 1,
        ignoredCount: 0
      })
    };
    const out = buildPopupErrorProbe(fake);
    expect(out.totalCount).toBe(1);
    expect(out.line).toContain('1件');
    expect(out.recentErrors).toHaveLength(1);
  });

  it('★buffer が壊れていても null を返すだけ(診断の生成を止めない)', () => {
    expect(buildPopupErrorProbe(null)).toBeNull();
    expect(buildPopupErrorProbe({})).toBeNull();
    expect(buildPopupErrorProbe({ snapshot: () => { throw new Error('x'); } })).toBeNull();
  });
});

describe('★配線 — 記録しても速報に出さなければ「無いのと同じ」', () => {
  const popupSrc = read('src/extension/popup-entry.js');
  const reportSrc = read('src/lib/aiShareFullText.js');

  it('popup が ring buffer を install している(記録の入口)', () => {
    expect(popupSrc).toContain('createConsoleErrorBuffer');
    expect(popupSrc).toMatch(/_popupErrorBuffer\.install\(globalThis\)/);
  });

  it('★popup 診断の snapshot に載せている(ここに無いと速報に出ない)', () => {
    /*
     * [[fastdiag-lite-is-the-printer-subset]] / [[unwired-judgement-is-systemic-2026-08-12]]
     * ★組み立ては lib(buildPopupErrorProbe)に置く。popup-entry.js は max-lines 上限
     *   (22119)に張り付いており、ここに数行足すだけで lint が赤くなるため。
     */
    expect(popupSrc).toMatch(/popupErrorProbe: buildPopupErrorProbe\(_popupErrorBuffer\)/);
    expect(popupSrc).toContain("from '../lib/popupErrorLine.js'");
  });

  it('★状態速報の本文に1行出している(通さないとコピペに永久に出ない)', () => {
    expect(reportSrc).toContain('popupErrorProbe?.line');
    expect(reportSrc).toMatch(/if \(errLine\) \{ lines\.push\(errLine\)/);
  });

  it('★旧実装の「握り潰すだけ」に戻っていない(記録せず捨てる形の再発防止)', () => {
    /*
     * 旧: addEventListener('error') で isExtensionContextInvalidatedError のときだけ
     *     preventDefault し、それ以外は【何もしない】=記録が1件も残らなかった。
     * install() が context invalidated の抑止も内包しているので、素の購読は不要。
     */
    const start = popupSrc.indexOf('function installExtensionContextErrorGuard()');
    const body = popupSrc.slice(start, popupSrc.indexOf('\n}\n', start));
    expect(body).not.toMatch(/addEventListener\('error'/);
    expect(body).not.toMatch(/addEventListener\('unhandledrejection'/);
  });
});
