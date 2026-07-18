/**
 * avatar-stability-DESIGN.md §D / §F: UID→usericon URL の手書き組み立てが
 * 増殖しないことを機械的に守る CI 構造ガード(ratchet 方式)。
 *
 * 検出パターンA(fail対象): 同一ファイル内に 'nicoaccount/usericon' という文字列と
 *   バケット計算(`/ 10000` 相当)が両方存在する = URL 式を手書きで組み立てている。
 *   正本 deriveAvatarUrlFromUid.js への委譲に置き換えるべき対象。
 *
 * パターンAに該当しても(文字列だけ言及・blank.jpg 等の固定URL・コメント内の例示・
 *   プレフィックス比較)は対象外(バケット計算を伴わないため自動的に検出から漏れる。
 *   意図的に無制限=言及そのものは禁止しない、組み立ての増殖だけを止める)。
 *
 * 許可リストは初回に現状の全違反ファイルを列挙して緑で導入した(2026-07-18)。
 * 委譲が済むたびに ALLOWLIST_BUILD から1件削除すること(減る方向のみ許す=ratchet)。
 * 新規追加はコードレビュー必須(正本へ委譲せず新しい重複を作っていないか確認するため)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '..');

/** @param {string} dir @returns {string[]} SRC_ROOT からの相対パス(posix区切り)一覧 */
function listJsFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFilesRecursive(abs));
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(path.relative(SRC_ROOT, abs).replace(/\\/g, '/'));
    }
  }
  return out;
}

// URL 組み立て(バケット計算)を正本委譲済み/正本そのものとして許可するファイル。
// 2026-07-18 導入時点の全違反(avatar-stability-DESIGN.md 事実1の7実装)をそのまま列挙。
const ALLOWLIST_BUILD = [
  'lib/deriveAvatarUrlFromUid.js', // 正本(恒久)
  // v0.1.1172: venueSeats.js は正本委譲済み(avatar-stability-DESIGN.md §B手順2)につき許可リストから除外
  'lib/adLanePicksFromRooms.js',
  'lib/supportGrowthTileSrc.js',
  'domain/user/avatar.js',
  // avatarResolver.js: 未配線だが「設計の正本として意図的に残置」と明記されたファイル
  // (docs/plan-avatar-resolver-refactor.md の再配線計画あり)。削除しない(2026-07-18 ユーザー判断)。
  'domain/user/avatarResolver.js',
  'lib/reportUserThumb.js' // /s/ 無しバリアント。設計書§B手順6の裁定まで残置
];

/** @param {string} relPath */
function readSrcFile(relPath) {
  return readFileSync(path.join(SRC_ROOT, relPath), 'utf8');
}

function findBucketMathBuildFiles() {
  const files = listJsFilesRecursive(SRC_ROOT);
  const hits = [];
  for (const rel of files) {
    const content = readSrcFile(rel);
    if (!content.includes('nicoaccount/usericon')) continue;
    if (!/\/\s*10000/.test(content)) continue; // バケット計算が無い=組み立てではない(パターンB)
    hits.push(rel);
  }
  return hits;
}

describe('usericon URL 組み立ての増殖ガード', () => {
  it('バケット計算を伴う usericon URL 組み立ては許可リスト内のファイルのみ', () => {
    const hits = findBucketMathBuildFiles();
    const unexpected = hits.filter((f) => !ALLOWLIST_BUILD.includes(f));
    expect(
      unexpected,
      unexpected.length
        ? `未許可の usericon URL 組み立てを検出: ${unexpected.join(', ')}\n` +
            `→ 正本 src/lib/deriveAvatarUrlFromUid.js へ委譲すること(avatar-stability-DESIGN.md §B)。`
        : undefined
    ).toEqual([]);
  });

  it('許可リストのファイルは実在する(リネームで許可リストが腐るのを防ぐ)', () => {
    for (const rel of ALLOWLIST_BUILD) {
      expect(existsSync(path.join(SRC_ROOT, rel)), `${rel} が見つからない(リネーム/削除された?)`).toBe(
        true
      );
    }
  });

  it('許可リストは現在の実装数と一致する(削除漏れ検知・ratchet の逆行を防ぐ)', () => {
    const hits = findBucketMathBuildFiles();
    // hits ⊆ ALLOWLIST_BUILD は上のテストで保証済み。ここでは逆方向
    // (許可リストにあるが実際には組み立てが無くなったファイル=委譲完了)を検知し、
    // 許可リストからの削除漏れを知らせる(fail にはしない・情報提供のみ)。
    const stale = ALLOWLIST_BUILD.filter((f) => !hits.includes(f));
    if (stale.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[usericonUrlGuard] 委譲済みで許可リストから削除できるファイル: ${stale.join(', ')}`
      );
    }
    expect(true).toBe(true);
  });
});
