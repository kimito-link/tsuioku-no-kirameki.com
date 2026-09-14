#!/usr/bin/env node
/**
 * check-agent-bootstrap.mjs — CLAUDE.md の1行目が `@AGENTS.md` の import であることを機械で守る。
 *
 * ★なぜ要るか(2026-09-06 の実害 → 2026-09-14 に検査化)
 *   Claude Code が起動時に自動で読むのは CLAUDE.md だけで、AGENTS.md(500行の本物のルール)は
 *   「必ず読んでください」と4回書いても【一度も context に入っていなかった】。
 *   結果、AGENTS.md:364「既存部品を検索して再利用」を破って5関数を重複実装した(lint も test も緑)。
 *   直し方は公式どおり CLAUDE.md 1行目の `@AGENTS.md` import。
 *
 *   ★しかし CLAUDE.md 自身が「この import を消しても何も壊れないが、scripts/check-agent-bootstrap.mjs
 *   が赤くする」と書きながら、その検査は【存在しなかった】(web-ios-android キットの check-doc-rot が
 *   2026-09-14 に検出)。文書に書いた判定はコードに置くまで効かない([[put-the-verdict-in-code-not-in-docs]])。
 *   このファイルがその判定の実体。
 *
 * ■ 判定(fail-closed)
 *   1. CLAUDE.md が存在する
 *   2. ★空行を除いた【1行目】が `@AGENTS.md` である(HTML コメントの中や途中行では
 *      「書いてあるのに読み込まれない」ので、位置まで見る)
 *   3. 同じディレクトリに AGENTS.md が実在する(import 先が消えていたら空を読む)
 *
 * 使い方:
 *   node scripts/check-agent-bootstrap.mjs            # リポ直下の CLAUDE.md を検査
 *   node scripts/check-agent-bootstrap.mjs <dir>      # 任意のディレクトリを検査
 *   node scripts/check-agent-bootstrap.mjs --selftest # 毒で赤が出るか自分で確かめる
 *
 * 終了コード: 0=合格 / 1=赤(fail-closed)
 */

import fs from 'node:fs';
import path from 'node:path';
import { runSelfTest } from './lib/instrument-core.mjs';

const SELFTEST = process.argv.includes('--selftest');
const IMPORT_LINE = '@AGENTS.md';

/**
 * 純ロジック: CLAUDE.md の本文と AGENTS.md の実在から問題を列挙する。
 * ★selftest から同じ関数を呼ぶ(本番と自己検査でロジックを分けない)。
 * @param {string|null} claudeText  CLAUDE.md の本文(無ければ null)
 * @param {boolean} agentsExists    AGENTS.md が同じディレクトリに実在するか
 * @returns {string[]} 問題(0件=合格)
 */
export function judgeAgentBootstrap(claudeText, agentsExists) {
  /** @type {string[]} */
  const problems = [];
  if (claudeText == null) {
    problems.push('CLAUDE.md が見つかりません(Claude Code が自動で読む入口が無い)');
    return problems;
  }
  const firstLine = String(claudeText)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine !== IMPORT_LINE) {
    const somewhere = String(claudeText).includes(IMPORT_LINE);
    problems.push(
      somewhere
        ? `CLAUDE.md の1行目が ${IMPORT_LINE} ではありません(途中行やコメント内では import として展開されない)`
        : `CLAUDE.md に ${IMPORT_LINE} の import がありません(AGENTS.md が context に入らない)`
    );
  }
  if (!agentsExists) {
    problems.push('AGENTS.md が同じディレクトリにありません(import 先が空)');
  }
  return problems;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function inspectDir(dir) {
  const claudePath = path.join(dir, 'CLAUDE.md');
  const agentsPath = path.join(dir, 'AGENTS.md');
  const claudeText = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : null;
  return judgeAgentBootstrap(claudeText, fs.existsSync(agentsPath));
}

if (SELFTEST) {
  const good = '@AGENTS.md\n\n# CLAUDE.md\n本文\n';
  const missing = '# CLAUDE.md\n必ず AGENTS.md を読んでください\n';
  const buried = '# CLAUDE.md\n<!--\n@AGENTS.md\n-->\n';
  const noop = () => {};
  const { ok, fails } = runSelfTest([
    {
      name: 'import が無ければ赤',
      poison: noop,
      restore: noop,
      isRed: () => judgeAgentBootstrap(missing, true).length > 0
    },
    {
      name: '★コメントの中に埋もれた import は赤(位置まで見る)',
      poison: noop,
      restore: noop,
      isRed: () => judgeAgentBootstrap(buried, true).length > 0
    },
    {
      name: 'AGENTS.md が消えていたら赤',
      poison: noop,
      restore: noop,
      isRed: () => judgeAgentBootstrap(good, false).length > 0
    },
    {
      name: '★正常形は赤にしない(誤検出よけ)',
      poison: noop,
      restore: noop,
      // ★この毒では「赤にならない」ことが正しい(isRed の意味を反転して返す)。
      isRed: () => judgeAgentBootstrap(good, true).length === 0
    }
  ]);
  if (!ok) {
    console.error('[check-agent-bootstrap] selftest FAILED');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('[check-agent-bootstrap] selftest OK(毒4ケース: 欠落/埋没/import先消失 → 赤・正常形 → 緑)');
  process.exit(0);
}

const targetDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.cwd();
const problems = inspectDir(targetDir);
if (problems.length > 0) {
  console.error(`[check-agent-bootstrap] 🔴 ${problems.length} 件`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  → 直し方: CLAUDE.md の1行目を `@AGENTS.md` にする(公式: Claude Code は AGENTS.md を直接読まない)。');
  process.exit(1);
}
console.log(`[check-agent-bootstrap] OK(CLAUDE.md 1行目 = ${IMPORT_LINE} / AGENTS.md 実在)`);
process.exit(0);
