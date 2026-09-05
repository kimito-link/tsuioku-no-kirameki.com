import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIME_JUDGE_GRANDFATHERED } from './timeAuthorityRegistry.js';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(libDir, '..', '..');

/** 時点フィールドを独自に持つファイルを検出する正本パターン(ハンドオフに固定した実行文と同じ)。 */
const TIME_FIELD_RE = /capturedAt|persistedAt|measuredAt/;

/**
 * ★timeAuthority に判定を委ねているファイルを見分けるパターン(v0.1.1313)。
 *
 * このリストが止めたいのは「時点フィールドを**独自に解釈する**ファイルが増えること」で、
 * 「時点フィールドを**読む**ファイル」そのものではない。
 * timeAuthority から import して解釈を委ねているなら、それは【移行後の望ましい姿】であり
 * 祖父条項リストに載せるべきものではない(リストは単調減少＝追加禁止なので、
 * 委譲したファイルを載せるとリストが増えて規律が壊れる)。
 *
 * ★この免除があっても規律は緩まない: 独自に `Number(x.capturedAt)` 等で判定するファイルは
 *   import を持たないので、従来どおり赤になる。
 */
const DELEGATES_TO_TIME_AUTHORITY_RE =
  /from\s+'\.\/timeAuthority\.js'|from\s+"\.\/timeAuthority\.js"/;

/**
 * src/lib の実ファイル(テストと正本自身を除く)を走査して、
 * 【独自に】時点フィールドを解釈しているものを返す。
 * timeAuthority へ委譲済みのファイルは除く(=移行のゴール地点)。
 */
function scanTimeFieldFiles() {
  return fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !f.includes('.test.'))
    .filter((f) => f !== 'timeAuthority.js' && f !== 'timeAuthorityRegistry.js')
    .filter((f) => {
      const src = fs.readFileSync(path.join(libDir, f), 'utf8');
      if (!TIME_FIELD_RE.test(src)) return false;
      // ★判定を timeAuthority に委ねているなら「独自に持っている」ではない。
      return !DELEGATES_TO_TIME_AUTHORITY_RE.test(src);
    })
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

  it('★委譲パターン自身の自己検査(免除が広がりすぎると規律が消える)', () => {
    /*
     * ★この免除が緩いと「時点を独自に判定するファイル」まで素通りして、
     *   リストの意味が消える。陽性/陰性を毎回確かめる。
     */
    expect(
      DELEGATES_TO_TIME_AUTHORITY_RE.test("import { toEpochMs } from './timeAuthority.js';")
    ).toBe(true);
    expect(
      DELEGATES_TO_TIME_AUTHORITY_RE.test('import { ageMsOf } from "./timeAuthority.js";')
    ).toBe(true);
    // ★独自に判定しているファイル(import 無し)は免除されない=従来どおり検出される。
    expect(
      DELEGATES_TO_TIME_AUTHORITY_RE.test('const cap = Number(e.capturedAt) || 0;')
    ).toBe(false);
    // ★名前が似ているだけの別モジュールを誤って免除しない。
    expect(
      DELEGATES_TO_TIME_AUTHORITY_RE.test("import x from './timeAuthorityRegistry.js';")
    ).toBe(false);
  });

  it('★走査が実際に何かを見つけている(0件で緑にならない)', () => {
    // 走査経路が壊れて空配列を返すと、部分集合テストが自明に緑になる。
    expect(scanTimeFieldFiles().length).toBeGreaterThan(50);
  });
});
