import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ★v0.1.1298: sidepanel-entry.js を【実際に実行】して、
 *   「最初は黒い → 途中から正常」という実機どおりの経過で、
 *   最終的に storage に残るのが 🔴(黒を見た) であることを測る。
 *
 * 配線テスト(sidepanelFlashNotOverwritten.wiring.test.js)は書き方を固定するだけ。
 * ここは【時間経過で値が変わる】状況を再現して、後の✅が先の🔴を消さないことを実測する。
 *
 * ■ 実機の症状(2026-08-09 ユーザー報告)
 *   「出てくるとき黒いのが出て、しばらくしたら直る」
 *   修正前はこの経過で最終値が ✅ になり、症状が永久に見えなかった。
 */
describe('サイドパネル自己診断: 黒→正常 の経過で🔴が残る(実行して測る)', () => {
  /**
   * sidepanel-entry.js を偽の DOM / chrome で実行する。
   * @param {(elapsedMs: () => number) => { outerBg: string, innerBg: string }} styleAt
   *   経過msに応じて各層の背景色を返す(黒い瞬間を再現する)。
   */
  async function runEntry(styleAt) {
    vi.useFakeTimers();
    const writes = [];
    let now = 0;
    const elapsed = () => now;

    const makeDoc = (which) => ({
      documentElement: { __which: which, getAttribute: () => '' },
      body: { children: { length: 3 } },
      readyState: 'complete'
    });
    const innerDoc = makeDoc('inner');
    const iframeEl = {
      __which: 'iframe',
      contentDocument: innerDoc,
      getBoundingClientRect: () => ({ width: 400, height: 800 }),
      addEventListener: () => {}
    };
    const outerDoc = makeDoc('outer');

    globalThis.document = {
      documentElement: outerDoc.documentElement,
      body: outerDoc.body,
      querySelector: (sel) => (sel === 'iframe' ? iframeEl : null)
    };
    globalThis.window = { innerWidth: 400, innerHeight: 800 };
    globalThis.getComputedStyle = (el) => {
      const s = styleAt(elapsed);
      const which = el && el.__which;
      const bg = which === 'inner' ? s.innerBg : which === 'iframe' ? s.innerBg : s.outerBg;
      return { backgroundColor: bg, backgroundImage: 'none', colorScheme: 'light' };
    };
    globalThis.chrome = {
      runtime: { getManifest: () => ({ version: '0.1.1298' }) },
      storage: { local: { set: (obj) => { writes.push(obj); return Promise.resolve(); } } }
    };

    // モジュールを毎回新しく読み込む(トップレベルのタイマーが走る)。
    const url = path.join(root, 'extension/sidepanel-entry.js');
    await import(`file://${url.replace(/\\/g, '/')}?t=${Math.random()}`);

    // 時間を進めながらタイマーを消化する。
    for (const step of [0, 60, 120, 200, 300, 450, 600, 800, 1100, 1500, 2000, 2500, 3500]) {
      now = step;
      vi.advanceTimersByTime(step === 0 ? 1 : step - (writes.length ? 0 : 0));
      vi.setSystemTime(step);
      vi.advanceTimersToNextTimer();
    }
    vi.runAllTimers();
    vi.useRealTimers();
    return writes;
  }

  const TRANSPARENT = 'rgba(0, 0, 0, 0)';
  const PAINTED = 'rgb(255, 255, 255)';

  it('★最初だけ黒い(外側が塗られていない)経過で、最終値が🔴のまま残る', async () => {
    // 実機どおり: 最初の ~300ms は外側が透明(=黒が出る)、以後は塗られる。
    const writes = await runEntry((elapsed) => ({
      outerBg: elapsed() < 300 ? TRANSPARENT : PAINTED,
      innerBg: PAINTED
    }));

    expect(writes.length).toBeGreaterThan(1);
    const last = writes[writes.length - 1];
    const rec = last[Object.keys(last)[0]];

    // ★ここが本丸: 後の✅で上書きされていないこと。
    expect(rec.ok).toBe(false);
    expect(rec.flashed).toBe(true);
    expect(rec.cause).toContain('外側');
    expect(rec.line).toContain('出た直後だけ黒い');
  });

  it('★最初から最後まで正常なら ✅ のまま(誤検知しない)', async () => {
    const writes = await runEntry(() => ({ outerBg: PAINTED, innerBg: PAINTED }));
    const last = writes[writes.length - 1];
    const rec = last[Object.keys(last)[0]];
    expect(rec.ok).toBe(true);
    expect(rec.flashed).toBe(false);
    expect(rec.line).toContain('✅正常');
  });
});
