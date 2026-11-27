import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * v0.1.2230 配線テスト: 「記録」の二重計上の根治(テール ⊥ メイン)が content-entry.js に
 *   実際に繋がっているかを固定する。判定は commentTailBuffer.js の純関数に隔離済み。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'content-entry.js'), 'utf8').replace(/\r\n/g, '\n');

function block(startMarker, len = 4000) {
  const i = source.indexOf(startMarker);
  expect(i).toBeGreaterThan(-1);
  return source.slice(i, i + len);
}

describe('記録件数の二重計上 根治の配線', () => {
  it('大口直行はテールを同じ書き込みに載せ、成功後に settle でテールと既知キーを戻す', () => {
    const b = block('if (batch.length >= TAIL_BULK_BYPASS_MIN_ROWS) {');
    expect(b).toMatch(/planMainWriteWithTailFold\(batch, tailRowsBuffer\)/);
    expect(b).toMatch(/__tailFoldCount:\s*plan\.foldLen/);
    expect(b).toMatch(/settleTailAfterMainWrite\(/);
    expect(b).toMatch(/tailKnownCommentNoKeys = settled\.knownKeys/);
    expect(b).toMatch(/observedRecordedCommentCount = settled\.recordedCount/);
    // 直行後も軽量サマリ(nls_csummary)を書き直す(件数と直近コメントを古いまま残さない)
    expect(b).toMatch(/summaryStorageKey\(lid\)/);
  });

  it('畳み込みは畳み込む件数を渡し、件数の床は knownStoredFloor で求める', () => {
    expect(block('async function compactTailIntoMain(')).toMatch(/__tailFoldCount:\s*snapshotLen/);
    expect(block('const knownStored = ', 400)).toMatch(/knownStoredFloor\(\{[\s\S]*tailFoldCount:\s*opts\?\.__tailFoldCount/);
  });

  it('保存集計の seed はメインだけ(テールを入れると畳み込みで二度数える)', () => {
    expect(source).toMatch(/_savedCommentsUidStatsRunning = aggregateSavedCommentsUidStats\(main\);/);
    expect(source).not.toMatch(/aggregateSavedCommentsUidStats\(main\.concat\(persistedTail\)\)/);
  });
});
