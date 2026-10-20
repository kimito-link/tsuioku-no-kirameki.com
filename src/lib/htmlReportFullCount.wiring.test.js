import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateCommentsByUser } from './userRooms.js';

/**
 * ★v0.1.1707: HTML レポートのユーザー別件数は、重い配信(2,500件超)でも【全件】で数える。
 *
 * 経緯(2026-10-20 調査): htmlReportDocument.js は heavy のとき sampleMaxEntries=4000(均等サンプル)で集計していた。
 *   ユーザー別件数・字数合計・きらめきの賞・サムネ一覧が、サンプル由来の縮んだ値になり(1万件なら約0.4倍)、注記も無かった。
 *   全件の1パスは 6,300件で約2ms・2万件で約8ms(実測)で、レポートは「保存して開く」ものなので問題ない。
 *   表の人数の上限(maxRooms=500)は【表示のための切り】として残す(集計は全件)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/popup/report/htmlReportDocument.js'), 'utf8').replace(/\r\n/g, '\n');

describe('★HTML レポート: ユーザー別件数は全件で数える', () => {
  it('集計の入力をサンプルしない(sampleMaxEntries を渡さない・定数も import しない)', () => {
    expect(src).not.toContain('sampleMaxEntries');
    expect(src).not.toContain('HTML_REPORT_AGGREGATE_SAMPLE_MAX');
  });

  it('重いときも件数順の並びと表示の上限(maxRooms)は残す', () => {
    expect(src).toContain('maxRooms: HTML_REPORT_AGGREGATE_ROOM_CAP');
    expect(src).toContain('sortByCount: true');
    expect(src).toContain('trackCharTotals: true');
  });

  it('全件で数えると、2,500件超でもユーザー別件数の合計が実件数と一致する(サンプルなら縮む)', () => {
    const rows = [];
    for (let i = 0; i < 6300; i++) {
      rows.push({ userId: `a:${i % 120}`, nickname: '', text: `c${i}`, capturedAt: 1000 + i });
    }
    const rooms = aggregateCommentsByUser(rows, { requireText: true, trackCharTotals: true, maxRooms: 500, sortByCount: true });
    expect(rooms).toHaveLength(120);
    expect(rooms.reduce((n, r) => n + r.count, 0)).toBe(6300);
  });
});
