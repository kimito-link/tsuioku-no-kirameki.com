import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from './statusExtrasBatch.js';
import { KEY_TOP_SUPPORTERS_MIRROR } from './storageKeys.js';

/**
 * ★v0.1.1705: 応援者ランキングの【値】の突き合わせ(popup鏡 vs 診断のレポート集計)の配線。
 * status が popup の応援者鏡を extras の統合 get で読み、jsonBlob.supportersParity に判定を載せ、AI共有全文に1行出す。
 * 嘘の🔴を出さない(取れなければ保留)=判定は supportersParity.js(純関数)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const status = read('src/extension/status-entry.js');
const full = read('src/lib/aiShareFullText.js');

describe('★応援者ランキングの値の突き合わせの配線', () => {
  it('popup の応援者鏡のキーは status の統合 get(EXTRAS_BATCH_KEYS)に同梱=読み取り回数は増えない・重複しない', () => {
    expect(EXTRAS_BATCH_KEYS).toContain(KEY_TOP_SUPPORTERS_MIRROR);
    expect(new Set(EXTRAS_BATCH_KEYS).size).toBe(EXTRAS_BATCH_KEYS.length);
  });

  it('pickExtrasBatchValues は topSupportersMirror を取り出す(欠損は null)', () => {
    const rec = { liveId: 'lv1', rooms: [{ userKey: 'a', count: 3 }] };
    expect(pickExtrasBatchValues({ [KEY_TOP_SUPPORTERS_MIRROR]: rec }, 1).topSupportersMirror).toEqual(rec);
    expect(pickExtrasBatchValues({}, 1).topSupportersMirror).toBeNull();
  });

  it('status-entry: 統合 get の結果を cache → renderAll → jsonBlob まで通し、判定を jsonBlob.supportersParity に載せる', () => {
    expect(status).toMatch(/import \{ judgeSupportersParity \} from '\.\.\/lib\/supportersParity\.js';/);
    // 取り出し(統合 get の結果+cache からの再取り出し)・cache・renderAll の呼び出しと定義・判定の6か所すべてを通す
    expect((status.match(/topSupportersMirror/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(status).toContain('_extrasCache = { reportPreview, watchTabMap');
    expect(status).toMatch(/jsonBlob\.supportersParity = judgeSupportersParity\(topSupportersMirror, reportPreview, scoreLiveId, Date\.now\(\)\);/);
  });

  it('AI共有全文: パリティ判定の行の直後に、値の突き合わせを1行出す(取れなければ出さない)', () => {
    expect(full).toMatch(/import \{ formatSupportersParityLine \} from '\.\/supportersParity\.js';/);
    const at = full.indexOf('lines.push(formatParityVerdictLine(parity));');
    const sp = full.indexOf('formatSupportersParityLine(', at);
    expect(at).toBeGreaterThan(-1);
    expect(sp).toBeGreaterThan(at);
    expect(sp - at).toBeLessThan(600);
    // 判定の結果を実際に行へ出す(判定だけして捨てない)
    expect(full).toContain('if (supportersLine) lines.push(supportersLine);');
  });
});
