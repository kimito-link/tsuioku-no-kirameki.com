// @ts-check
/**
 * council-scout/ の置き場所解決の回帰テスト（2026-10-12 の実損から）。
 *
 * 守りたい不変条件はひとつだけ:
 *   **worktree から解決しても、本体から解決しても、同じ（本体の）ディレクトリを指す**。
 * ここが崩れると worktree 側に state.json が作られ、gitignore で付いてこないため
 * 「初回実行」と誤判定し、**連続失敗日数が 1 にリセットされて警告が出なくなる**。
 * （実測: 本体 streakDays=4 → worktree で回したら 1 に戻った）
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCouncilScoutDir } from './council-scout-dir.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function gitCommonDirOf(cwd) {
  const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return resolve(cwd, out);
}

describe('resolveCouncilScoutDir', () => {
  it('解決先は常に「.git 本体の隣」＝本体のチェックアウトを指す', () => {
    // ★このテスト自身が worktree から走ることがある（実際 2026-10-12 はそうだった）。
    //  そのため「テストの置き場所 = 本体」と書くと落ちる。正しい不変条件は
    //  「--git-common-dir の親ディレクトリの council-scout を指す」。
    const mainRoot = dirname(gitCommonDirOf(REPO_ROOT));
    expect(resolveCouncilScoutDir(REPO_ROOT)).toBe(join(mainRoot, 'council-scout'));
  });

  it('★worktree と本体で同じ場所を指す（分裂しない＝この実損の本体）', () => {
    // 実在する worktree を git に聞いて、あれば実物で検証する。
    // 無い環境（CI の単純 clone 等）では、同じ .git を共有する以上
    // --git-common-dir が一致することだけを確かめれば十分なのでスキップしない。
    const mainCommon = gitCommonDirOf(REPO_ROOT);
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    const paths = [...list.matchAll(/^worktree (.+)$/gm)].map((m) => m[1].trim());
    const others = paths.filter((p) => resolve(p) !== resolve(REPO_ROOT) && existsSync(p));

    const expected = resolveCouncilScoutDir(REPO_ROOT);
    for (const wt of others.slice(0, 3)) {
      // 同じリポの worktree である（= .git を共有している）ものだけを対象にする
      let common;
      try { common = gitCommonDirOf(wt); } catch { continue; }
      if (resolve(common) !== resolve(mainCommon)) continue;
      expect(resolveCouncilScoutDir(wt)).toBe(expected);
    }
  });

  it('git が使えない場所では、従来のスクリプト位置基準へ fail-open する', () => {
    // 監視が「動かなくなる」より「worktree 内に書いてでも動く」方を選ぶ設計。
    const outside = mkdtempSync(join(tmpdir(), 'scoutdir-'));
    expect(resolveCouncilScoutDir(outside)).toBe(join(outside, 'council-scout'));
  });
});
