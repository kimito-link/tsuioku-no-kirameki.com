import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 鏡のまとめ書き: 変わっていない鏡を書かない配線の固定(2026-10-08)。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popup = read('extension/popup-entry.js');
const sched = read('lib/mirrorBundleFlushScheduler.js');

describe('鏡のまとめ書き', () => {
  it('★popup は空のペイロードを書かない(全部同じなら storage.set を呼ばない)', () => {
    expect(popup).toMatch(/if \(Object\.keys\(out\.legacyPayload\)\.length\) void chrome\.storage\.local\.set\(out\.legacyPayload\)/);
  });
  it('★署名の正本は laneMirrorWriteSignature(時刻・受領証を除く)を使い、自前で作らない', () => {
    expect(sched).toMatch(/import \{ laneMirrorWriteSignature, laneMirrorStructureKey \} from '\.\/laneMirrorWriteGate\.js';/);
    expect(sched).toMatch(/laneMirrorWriteSignature\(sections\[section\]\)/);
  });
  it('★popup は中身だけの変化を8秒にまとめる設定でスケジューラを作る(渡さないと全部書きに戻る)', () => {
    expect(popup).toMatch(/createMirrorBundleFlushScheduler\(\{ changedFloorMs: 8000 \}\)/);
    expect(popup).toMatch(/createLaneMirrorWriteGate\(\{ changeFloorMs: 8000 \}\)/);
  });
  it('★既定の床は有限(0 のままだと従来の全部書きに戻る)', () => {
    expect(sched).toMatch(/const DEFAULT_UNCHANGED_FLOOR_MS = 15000;/);
  });
});
