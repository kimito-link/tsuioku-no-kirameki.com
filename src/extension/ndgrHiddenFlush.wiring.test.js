import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ★v0.1.1417 配線テスト: 「裏タブでコメントが数十秒遅れる」根治が
 *   content-entry.js に実際に繋がっているかを固定する。
 *
 * 判定は純関数(ndgrHiddenFlushThreshold.js)に隔離済みなので、ここで見るのは
 * 【その判定が NDGR の flush 経路で実際に使われているか】だけ。
 *
 * ★意図を検査する(記述の形に固定しない):
 *   - 純関数を import していること
 *   - flush のしきい値比較が、素の定数ではなく解決済みの値を使っていること
 *   - 可視状態(document.hidden)を判定に渡していること
 *   これらが崩れると「裏タブだけ遅い」が黙って戻る。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'content-entry.js'), 'utf8');

describe('NDGR 裏タブ flush の配線', () => {
  it('純関数 resolveNdgrPendingThreshold を import している', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*resolveNdgrPendingThreshold[^}]*\}\s*from\s*'\.\.\/lib\/ndgrHiddenFlushThreshold\.js'/
    );
  });

  it('★しきい値の解決に document.hidden を渡している(可視状態で切り替わる)', () => {
    // 呼び出しブロックを取り出して、hidden が引数に含まれることを見る。
    const call = source.match(/resolveNdgrPendingThreshold\(\{[\s\S]{0,300}?\}\)/);
    expect(call).not.toBeNull();
    expect(call?.[0]).toMatch(/hidden\s*:/);
    expect(call?.[0]).toMatch(/document\.hidden/);
    expect(call?.[0]).toMatch(/visibleThreshold\s*:\s*NDGR_PENDING_FLUSH_THRESHOLD/);
  });

  it('★flush 判定が素の定数ではなく解決済みしきい値と比較している', () => {
    // 解決値との比較が存在すること。
    expect(source).toMatch(
      /ndgrChatRowsPending\.length\s*>=\s*pendingFlushThreshold/
    );
    // 素の定数との比較に戻っていないこと(これが戻ると裏タブ遅延が再発する)。
    expect(source).not.toMatch(
      /ndgrChatRowsPending\.length\s*>=\s*NDGR_PENDING_FLUSH_THRESHOLD/
    );
  });
});
