import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIME_JUDGE_GRANDFATHERED } from './timeAuthorityRegistry.js';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(libDir, '..', '..');

/** 時点フィールドを独自に持つファイルを検出する正本パターン(ハンドオフに固定した実行文と同じ)。 */
const TIME_FIELD_RE = /capturedAt|persistedAt|measuredAt/;

/** src/lib の実ファイル(テストと正本自身を除く)を走査して、時点フィールドを持つものを返す。 */
function scanTimeFieldFiles() {
  return fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !f.includes('.test.'))
    .filter((f) => f !== 'timeAuthority.js' && f !== 'timeAuthorityRegistry.js')
    .filter((f) => TIME_FIELD_RE.test(fs.readFileSync(path.join(libDir, f), 'utf8')))
    .map((f) => `src/lib/${f}`)
    .sort();
}

/**
 * ★v0.1.1304: 時点フィールドの独自実装を【増やさない】ための凍結リスト。
 *
 * 2026-08-10 の実測で src/lib の122ファイルが独自に時点フィールドを持ち、
 * 判定が共有されていないことが7版事件の構造的原因と判明した。
 * 一度に全部は移行できないので、現状を凍結して増殖だけ止める。
 *
 * ★このリストは【単調減少のみ】。移行したら削る。増やす方向の編集はレビューで止める。
 */
describe('timeAuthority registry(祖父条項の凍結)', () => {
  it('★新しく時点フィールドを持ち込んだファイルは無い(リストの部分集合)', () => {
    const found = scanTimeFieldFiles();
    const allowed = new Set(TIME_JUDGE_GRANDFATHERED);
    const newcomers = found.filter((f) => !allowed.has(f));
    /*
     * ここが赤になったら: 新しいファイルが独自に時点フィールドを持った。
     * → src/lib/timeAuthority.js の classifyReading / ageMsOf を使うよう直す。
     *   どうしても独自に持つ必要があるなら、理由をコメントに書いてリストへ追加する
     *   (ただしそれは「増やす」なので、レビューで本当に必要か問うこと)。
     */
    expect(newcomers).toEqual([]);
  });

  it('★リストの各エントリは実在する(移行済みの削り忘れを検出)', () => {
    const missing = TIME_JUDGE_GRANDFATHERED.filter(
      (rel) => !fs.existsSync(path.join(repoRoot, rel))
    );
    expect(missing).toEqual([]);
  });

  it('★リストに載っているが既に時点フィールドを持たないファイルは削れる(単調減少の督促)', () => {
    const found = new Set(scanTimeFieldFiles());
    const removable = TIME_JUDGE_GRANDFATHERED.filter((f) => !found.has(f));
    /*
     * ここが赤になったら: 移行が済んだのにリストから削っていない。
     * → 該当エントリを timeAuthorityRegistry.js から削除する(リストは短くなるのが正しい)。
     */
    expect(removable).toEqual([]);
  });

  it('★検出パターン自身の自己検査(regex が腐ると全部素通しになる)', () => {
    /*
     * ★アンカーずれ等でパターンが何にもマッチしなくなると、
     *   「新規持ち込みゼロ」で永久に緑になる=最悪の恒真テストになる。
     *   既知の陽性/陰性フィクスチャで、パターンが生きていることを毎回確かめる。
     *   ([[mutation-test-needs-anchored-regex-2026-08-05]])
     */
    expect(TIME_FIELD_RE.test('const x = { capturedAt: 1 };')).toBe(true);
    expect(TIME_FIELD_RE.test('snap.persistedAt')).toBe(true);
    expect(TIME_FIELD_RE.test('domSelf.measuredAt')).toBe(true);
    expect(TIME_FIELD_RE.test('const y = { unrelated: 1 };')).toBe(false);
  });

  it('★走査が実際に何かを見つけている(0件で緑にならない)', () => {
    // 走査経路が壊れて空配列を返すと、部分集合テストが自明に緑になる。
    expect(scanTimeFieldFiles().length).toBeGreaterThan(50);
  });
});
