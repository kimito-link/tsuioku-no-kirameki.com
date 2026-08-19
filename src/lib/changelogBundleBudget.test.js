import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXTENSION_CHANGELOG } from './changelog.js';
import { EXTENSION_CHANGELOG_ARCHIVE } from './changelog-archive.js';

/**
 * ★changelog が popup のバンドルを膨らませないことを【数で固定】する。
 *
 * ■ 何が起きたか(2026-08-19 実測)
 *   `changelog.js` が **7,212行 / 780版 / 1,042KB** に膨れ、
 *   popup バンドル 2,404KB の **43%** を占めていた。
 *   iframe(popup.html)のロードで **親スレッドが最大1,373ms停止** し、
 *   その間 iframe は about:blank のまま = **UAが黒を敷く** = サイドパネルの黒。
 *   (実機速報の `最大タイマー遅延=1076ms` とほぼ一致。分割後は **106ms**)
 *
 * ■ ★なぜ「一度直したのに戻った」のか(構造的原因)
 *   2026-06-11 の `9e6e9c45` で **232行(直近20版)** に分割済みだった。
 *   それが2ヶ月で31倍に戻った理由は「自動化していなかったから」ではない。
 *   退避スクリプト(`scripts/split-changelog.mjs`)は**存在していた**。
 *
 *     [足す側] 版を足さないと `verify:bump` が【赤】＝出荷できない → 100%実行される
 *     [減らす側] 退避しなくても **何も赤くならない**              → 2ヶ月ゼロ回
 *
 *   ★**「サボると赤くなるか」だけが、仕掛けが生きるか死ぬかを決める。**
 *   同じ理由で `KNOWN_NA_DEBT<=14` は機能し、`diagChannelRegistry` は3ヶ月放置された。
 *   → このテストが「減らす側」の赤である。これが無い限り必ずまた戻る。
 *
 * ■ 運用
 *   赤くなったら `node scripts/split-changelog.mjs` を実行して archive へ押し出す。
 *   ★履歴は消えない(archive へ移すだけ)。合計版数も下で固定している。
 */

const here = dirname(fileURLToPath(import.meta.url));
const changelogSrc = readFileSync(join(here, 'changelog.js'), 'utf8');

/** 同梱してよい版数の上限。分割スクリプトの RECENT(20) と揃える。 */
const MAX_BUNDLED_VERSIONS = 20;

/**
 * 同梱してよいサイズの上限(バイト)。
 * ★20版で実測 約12KB。倍の余裕を見て 40KB。
 *   これを超える＝退避を忘れている(1,042KB まで放置された前科がある)。
 */
const MAX_BUNDLED_BYTES = 40 * 1024;

describe('changelog がバンドルを膨らませない(減らす側の赤)', () => {
  it('★同梱する版数が上限を超えていない(超えたら split-changelog.mjs を実行する)', () => {
    expect(
      EXTENSION_CHANGELOG.length,
      `changelog.js が ${EXTENSION_CHANGELOG.length} 版に膨れています。` +
        ' `node scripts/split-changelog.mjs` で archive へ押し出してください。'
    ).toBeLessThanOrEqual(MAX_BUNDLED_VERSIONS);
  });

  it('★同梱するサイズが上限を超えていない(黒画面の再発防止)', () => {
    const bytes = Buffer.byteLength(changelogSrc, 'utf8');
    expect(
      bytes,
      `changelog.js が ${(bytes / 1024).toFixed(0)}KB です(上限 ${MAX_BUNDLED_BYTES / 1024}KB)。` +
        ' 1,042KB まで放置してサイドパネルを黒くした前科があります。'
    ).toBeLessThanOrEqual(MAX_BUNDLED_BYTES);
  });

  it('★archive は popup のバンドルに入らない(入れると黒が戻る)', () => {
    // popup-entry.js が archive を import していないこと。
    const popupSrc = readFileSync(join(here, '..', 'extension', 'popup-entry.js'), 'utf8');
    expect(popupSrc).not.toContain('changelog-archive');
  });

  it('★履歴は失われていない(退避しても合計は減らない)', () => {
    /*
     * ★2026-08-19、分割スクリプトには2つの破壊的バグがあった:
     *   (1) archive を**丸ごと上書き**する(既存550版が消える)
     *   (2) 切り出しのオフバイワン(`slice(i,i+14)` で15文字と比較)で**常に0件**になり、
     *       その0件で書き込んで**全1,331版を消した**(バックアップから復旧)
     *   → 合計版数を固定して、二度と静かに消えないようにする。
     */
    /*
     * ★1330 は【実データで数えた版数】(2026-08-19 の分割直後)。
     *   ★grep の `version:` 出現数(1331)は typedef のコメント1件を含むので**使わない**
     *     (私が一度それを基準にして、失われていないのに赤にした)。
     */
    const total = EXTENSION_CHANGELOG.length + EXTENSION_CHANGELOG_ARCHIVE.length;
    expect(
      total,
      '版の総数が減っています＝履歴が失われた可能性があります。'
    ).toBeGreaterThanOrEqual(1330);
  });

  it('★changelog と archive で版が重複しない(二重登録)', () => {
    const a = new Set(EXTENSION_CHANGELOG.map((e) => e.version));
    const dup = EXTENSION_CHANGELOG_ARCHIVE.filter((e) => a.has(e.version)).map((e) => e.version);
    expect(dup, `重複: ${dup.join(', ')}`).toEqual([]);
  });

  it('★archive も新しい順(降順)を保っている', () => {
    const vs = EXTENSION_CHANGELOG_ARCHIVE.map((e) => e.version);
    const num = (v) => String(v).split('.').map(Number);
    for (let i = 1; i < vs.length; i++) {
      const [aM, aN, aP] = num(vs[i - 1]);
      const [bM, bN, bP] = num(vs[i]);
      const newer = aM > bM || (aM === bM && (aN > bN || (aN === bN && aP > bP)));
      expect(newer, `降順でない: ${vs[i - 1]} → ${vs[i]}`).toBe(true);
    }
  });
});
