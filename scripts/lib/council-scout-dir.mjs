/**
 * council-scout/ の置き場所を返す唯一の正本。
 *
 * ★なぜ切り出したか（2026-10-12・実損から）:
 *  `scout-models.mjs` は `STATE_PATH` を**スクリプト位置基準**で解決していた
 *  （`join(__dirname, '..', 'council-scout')`）。この決め方自体は cwd 非依存で正しいが、
 *  **worktree で回すと worktree 側の council-scout/ を指す**。
 *  `council-scout/state.json` は **gitignore 対象＝チェックアウトに付いてこない**ため、
 *  新しい worktree では「ファイルが無い」→ `firstRun: true` と判定され、
 *  **全メンバーの連続失敗日数(streakDays)が 1 にリセットされる**。
 *
 *  実測（2026-10-12・master worktree を新規作成して scout を回した）:
 *    本体  : sambanova / magistral-medium / magistral-small = streakDays 4（初回 09-28）
 *    worktree: 同3体が streakDays 1（初回 10-12）＋ カタログ278件を「初回」として再登録
 *
 *  ★害は日付の見た目だけではない。警告のしきい値が `streakDays >= 2` なので、
 *   **本物の連続障害が「1日目」に戻されて警告が出なくなる**（クラッシュしないので気づけない）。
 *   2026-09-28 に「連続失敗カウントが実行回数だった」件を直したのと同じ性質の嘘を、
 *   別経路（置き場所）で作っていた。
 *
 * ★2026-10-06 には逆向きで踏んだ: worktree 側の古い state を本体へ戻し忘れると
 *  監視 state が巻き戻る。当時は「撤去前に手でコピーで戻す」と手順書に書いて済ませたが、
 *  **手順の記憶に依存する対策は、記憶が外れた時に黙って壊れる**（今回それが起きた）。
 *  そこで置き場所自体を本体へ固定し、worktree でもコピー不要にする。
 *
 * ★なぜ `git rev-parse --git-common-dir` か:
 *  worktree から叩くと**本体の .git** を指し、本体から叩くと `.git` を指す（実測）。
 *  その親ディレクトリが常に「本体のチェックアウト」になる。
 *  `--show-toplevel` は worktree 自身を指すので使えない。
 *
 * fail-open 方針: git が無い・リポ外・解決不能なときは**スクリプト位置基準の従来値**へ
 * 黙って戻す（監視が動かなくなるより、worktree 内に書いてでも動く方がよい）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * @param {string} fallbackRepoRoot スクリプト位置基準で求めた従来の REPO_ROOT
 * @returns {string} council-scout/ を置くべきディレクトリの絶対パス
 */
export function resolveCouncilScoutDir(fallbackRepoRoot) {
  const fallback = join(fallbackRepoRoot, 'council-scout');
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: fallbackRepoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return fallback;
    // 本体では相対 '.git' が返るので、cwd 基準で絶対化する
    const commonDir = isAbsolute(out) ? out : resolve(fallbackRepoRoot, out);
    if (!existsSync(commonDir)) return fallback;
    const mainRoot = dirname(commonDir);
    if (!existsSync(mainRoot)) return fallback;
    return join(mainRoot, 'council-scout');
  } catch {
    return fallback;
  }
}
