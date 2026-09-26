import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 配信詳細モーダル(2026-09-26 council-fable設計)の【配線】検査。
 *
 * ■ なぜ要るか
 *   設計書(_docs/live-detail-modal-DESIGN.md)の核心は「load() の成功/失敗どちらでも
 *   モーダルへ結果を伝える」「モーダルを閉じる呼び出しは closeDetail 系統だけに閉じる」
 *   という配線そのものにある。関数を書いただけで呼ばれていない/意図しない場所からも
 *   閉じられる、を機械で防ぐ。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const ENTRY = 'src/extension/live-ranking-entry.js';

describe('配信詳細モーダルの配線', () => {
  it('★load() 成功時に safeDetailSync が render の後に呼ばれている', () => {
    const code = read(ENTRY);
    const renderAt = code.indexOf('render(data);');
    const syncAt = code.indexOf('safeDetailSync(data);');
    expect(renderAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(renderAt);
  });

  it('★load() 失敗時に showState の後で safeDetailSyncError が呼ばれている', () => {
    const code = read(ENTRY);
    const showStateAt = code.indexOf('showState(msg);');
    const errAt = code.indexOf('safeDetailSyncError(msg);');
    expect(showStateAt).toBeGreaterThan(-1);
    expect(errAt).toBeGreaterThan(-1);
    expect(errAt).toBeGreaterThan(showStateAt);
  });

  it('★elList.innerHTML の代入が paintDetail 関数の中には無い(#list全置換とモーダルの分離)', () => {
    const code = read(ENTRY);
    const start = code.indexOf('function paintDetail(');
    expect(start).toBeGreaterThan(-1);
    const end = code.indexOf('\nfunction ', start + 1);
    const body = code.slice(start, end > -1 ? end : undefined);
    expect(body).not.toContain('elList.innerHTML');
  });

  it('★dialog.close() の呼び出しは closeDetail 関数の中にしかない(勝手に閉じる経路を作らない)', () => {
    const code = read(ENTRY);
    const closeCalls = [...code.matchAll(/elDialog\.close\(\)/g)];
    expect(closeCalls.length).toBe(1);
    const idx = closeCalls[0].index ?? -1;
    const fnStart = code.lastIndexOf('function closeDetail(', idx);
    expect(fnStart).toBeGreaterThan(-1);
    // closeDetail の直前の関数境界より後ろにあることだけ確認(同じ関数内であることの簡易チェック)。
    const prevFnEnd = code.lastIndexOf('\n}\n', idx);
    expect(fnStart).toBeGreaterThan(prevFnEnd - 200); // 大きく離れていない=同一関数内
  });

  it('★モーダルの後始末(finishCloseDetail)は close イベントと closeDetail の両方から呼ばれる(非同期close対策)', () => {
    const code = read(ENTRY);
    const calls = [...code.matchAll(/finishCloseDetail\(/g)];
    // 定義1回 + 呼び出し2箇所(closeDetail 内・close イベントリスナー内)
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('★renderRows/renderCommentCol は既定引数で一覧用 tracker を保ちつつ、モーダル用に差し替え可能', () => {
    const code = read(ENTRY);
    expect(code).toMatch(/function renderRows\(rows, liveId, kind, tr = tracker\)/);
    expect(code).toMatch(/function renderCommentCol\(l, tr = tracker\)/);
    // モーダル描画(paintDetail)は専用の _detailTracker を渡している(一覧の tracker を奪わない)。
    const start = code.indexOf('function paintDetail(');
    const end = code.indexOf('\nfunction ', start + 1);
    const body = code.slice(start, end > -1 ? end : undefined);
    expect(body).toContain('_detailTracker');
    expect(body).not.toMatch(/renderRows\([^)]*\btracker\b[^)]*\)/);
  });

  it('★liveDetailView.js の純関数を実際に import して使っている(未配線のimportで終わらない)', () => {
    const code = read(ENTRY);
    expect(code).toContain("from '../lib/liveDetailView.js'");
    for (const fn of ['readDetailQuery', 'withDetail', 'withoutDetail', 'findLive', 'detailBanner']) {
      expect(code).toContain(fn);
      // import 文だけでなく、実際に呼び出されている(定義行以外にもう1回以上出現する)。
      const uses = code.split(fn).length - 1;
      expect(uses).toBeGreaterThanOrEqual(2);
    }
  });

  it('★popstate は readDetailQuery を読んで openDetail/closeDetail のどちらかへ分岐する', () => {
    const code = read(ENTRY);
    const start = code.indexOf("addEventListener('popstate'");
    expect(start).toBeGreaterThan(-1);
    // 次の関数/トップレベル文の境界(行頭の '}' か次の宣言)までを body とみなす。
    const end = code.indexOf('\n});', start);
    expect(end).toBeGreaterThan(start);
    const body = code.slice(start, end);
    expect(body).toContain('readDetailQuery(location.search)');
    expect(body).toContain('openDetail(');
    expect(body).toContain('closeDetail(');
  });
});
