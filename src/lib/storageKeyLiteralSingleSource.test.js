/**
 * storage キー文字列が【1箇所にしか書かれていない】ことの機械照合（v0.1.1506）。
 *
 * ★なぜ要るか（2026-09-04・実測で発見した二重定義）
 *   同じキー文字列が複数ファイルに書かれていた:
 *     'nls_last_watch_url'            … storageKeys.js:14 / comeview-entry.js / status-entry.js の【3箇所】
 *     'nls_voice_reading_enabled_v1'  … comeview-entry.js / voicePlayer.js の【2箇所】
 *     'nls_voice_assignments_v1'      … 同上
 *     'nls_voice_read_name_enabled_v1'… 同上
 *
 *   ★二重定義は「片方だけ直す」事故を必ず生む。このリポは同型の事故を踏んでいる:
 *     v0.1.1324「キーに生 url を混ぜたせいで、同じ配信が別キーになり読めた全件を捨てた」
 *
 * ★この検査が守るのは「正本1つ・コピーを散らさない」(github/CLAUDE.md の原則)。
 *   ★人が気をつけるのではなく、増えたら赤くする。
 *
 * ★何を検査しないか（過剰検査は赤の信頼を毀損する）
 *   - キーの【値】が正しいかは見ない（それは各機能のテストの仕事）
 *   - メッセージの type は対象外。★大文字 `NLS_POST_COMMENT` 等は送り手と受け手の
 *     両方に書かれているのが正当（storage キーではない）ので、小文字 `nls_` だけを見る
 *   - 小文字でも `nls_backfill_sw_*` はメッセージ type なので明示除外
 *   - テストファイル内のリテラルは対象外（毒/期待値として書くのは正当）
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(libDir, '..');

/** src/ 配下の非テスト .js を全部集める。 */
function collectSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!name.endsWith('.js')) continue;
    if (name.includes('.test.')) continue;
    out.push(full);
  }
  return out;
}

/**
 * ★storage キーらしきリテラルだけを拾う。
 *   `nls_` 始まりで、かつ「storage キーとして使われている形」に限る。
 *   ★メッセージ type との誤検出を避けるため、既知の type 接頭辞は除外する。
 */
const MESSAGE_TYPE_PREFIXES = ['nls_backfill_sw_'];

/** @param {string} literal */
function isMessageType(literal) {
  return MESSAGE_TYPE_PREFIXES.some((p) => literal.startsWith(p));
}

describe('storage キー文字列の正本は1箇所（v0.1.1506）', () => {
  const files = collectSourceFiles(srcDir);

  it('★空振り防止: 走査対象のファイルが十分にある', () => {
    // ★0件走査を緑にしない(laneDensityLod が CRLF で空振りして死んだ前科)。
    expect(files.length).toBeGreaterThan(100);
  });

  it("★同じ 'nls_*' キー文字列が2箇所以上に書かれていない", () => {
    /** @type {Map<string, string[]>} */
    const byLiteral = new Map();
    for (const file of files) {
      const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      // ★小文字の nls_ のみ = storage キー。大文字 NLS_ はメッセージ type(送受で共有が正当)。
      const matches = src.match(/'nls_[a-z0-9_]+'/g) || [];
      for (const raw of new Set(matches)) {
        const literal = raw.slice(1, -1);
        if (isMessageType(literal)) continue;
        const rel = path.relative(srcDir, file).split(path.sep).join('/');
        if (!byLiteral.has(literal)) byLiteral.set(literal, []);
        const list = byLiteral.get(literal);
        if (!list.includes(rel)) list.push(rel);
      }
    }

    // ★走査が効いていること(1件も拾えていないなら検査が壊れている)。
    expect(byLiteral.size).toBeGreaterThan(20);

    const duplicated = [...byLiteral.entries()]
      .filter(([, places]) => places.length > 1)
      .map(([literal, places]) => `${literal} → ${places.join(' / ')}`);

    /*
     * ★ラチェット方式にする理由（このリポの実測に基づく）
     *   `audit-gates.mjs` が「このリポで死んだ仕掛けは全部『一度に全部直せ』と
     *   迫るものだった」と記録している。実際 v0.1.1506 時点で既存の重複は 15件あり、
     *   ★全部直せと迫ると、この検査ごと無効化されて死ぬ。
     *
     *   そこで「今より増えたら赤」にする。★今日直した4キー
     *   (nls_last_watch_url / 読み上げ3種) は既に1箇所になったので、
     *   ★戻したら 16 になって赤くなる＝退化が機械で止まる。
     *
     *   ★減らすのは歓迎（この数字を下げてよい）。増やすのだけを止める。
     */
    const KNOWN_DUPLICATE_MAX = 15;

    if (duplicated.length > KNOWN_DUPLICATE_MAX) {
      // 落ちたときに「どのキーがどこで重複したか」がそのまま出る。
      expect(duplicated).toEqual([]);
    }
    expect(duplicated.length).toBeLessThanOrEqual(KNOWN_DUPLICATE_MAX);
  });

  it('★今日1箇所に寄せたキーが、また複数箇所へ散っていない', () => {
    // ★ラチェットは総数しか見ないので、この4キーだけは名指しで固定する
    //   (総数が同じでも、別のキーを直してこの4つを戻す、をすり抜けさせない)。
    const SINGLE_SOURCED = [
      'nls_last_watch_url',
      'nls_voice_reading_enabled_v1',
      'nls_voice_assignments_v1',
      'nls_voice_read_name_enabled_v1'
    ];
    for (const literal of SINGLE_SOURCED) {
      const places = [];
      for (const file of files) {
        const src = readFileSync(file, 'utf8');
        if (src.includes(`'${literal}'`)) {
          places.push(path.relative(srcDir, file).split(path.sep).join('/'));
        }
      }
      // ★空振り防止: どこにも無いなら検査が壊れている(キー名を変えたなら此処も直す)。
      expect(places.length).toBeGreaterThan(0);
      expect(places).toHaveLength(1);
    }
  });
});
