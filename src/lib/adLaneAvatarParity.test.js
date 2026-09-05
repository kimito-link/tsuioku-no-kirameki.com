import { describe, expect, it } from 'vitest';

import { adLanePicksFromRooms } from './adLanePicksFromRooms.js';
import { officialDomRankingRowsToStripRooms } from './officialDomRankingRowsToStripRooms.js';
import { normalizeNicoadRankingResponse } from './nicoadContributionRankingApi.js';
import { resolveStoryLaneAvatarSrc } from './storyLaneAvatarSrc.js';

/**
 * ★広告段だけサムネが出ない問題の根治(2026-08-07・v0.1.1286)。
 *
 * ■ 実機で確定した症状
 *   同じ人物(君斗りんく@クリエイター応援 uid=4046119)が、同じ画面の中で
 *     りんく段 → 個人サムネが出る
 *     広告段   → 白丸(サムネなし)
 *   になっていた。
 *
 * ■ 真因(構造)
 *   広告段だけが【正本の解決器 resolveStoryLaneAvatarSrc を通らない】唯一のレーンだった。
 *   adLanePicksFromRooms.js の import は deriveAvatarUrlFromUid のみで、
 *   他レーン(りんく/こん太/たぬ姉/ギフト)が使う
 *   「観測済みの実サムネ・記憶したアバター・本人(viewer)の画像」を一切使えなかった。
 *   user-identity-unification-DESIGN.md が「広告列の独自実装」として統合対象に挙げていた箇所。
 *
 * ■ ここで固定すること
 *   ★生産者に本物を置く: 広告APIの生JSON → normalizeNicoadRankingResponse(本物の書き手)
 *     → officialDomRankingRowsToStripRooms(本物) → adLanePicksFromRooms(本物)
 *     という実際の連鎖を通す。手作りの room リテラルを足さないこと
 *     ([[gate-fixture-must-come-from-the-writer-2026-08-07]])。
 *   ★消費者にも本物を置く: resolveAvatarForUid には他レーンと【同じ】
 *     resolveStoryLaneAvatarSrc を噛ませる(スタブで '' を返すだけにしない)。
 */

/** 広告APIの生JSON(モジュール冒頭ドキュメントの実形: data.ranking[{userId, advertiserName, ...}])。 */
function realAdApiJson() {
  return {
    meta: { status: 200 },
    data: {
      contentId: 'lv351120893',
      contentTotalContribution: 14600,
      ranking: [
        // 記名(uid あり)。公式はサムネを返さない=ここが白丸になっていた当事者。
        { userId: 4046119, advertiserName: '君斗りんく@クリエイター応援', totalContribution: 5000, rank: 1 },
        // 記名(uid あり)・別人。
        { userId: 3420704, advertiserName: 'けんぴ', totalContribution: 3000, rank: 2 },
        // 匿名(uid なし)=プラットフォーム上の匿名広告主。白丸(キャラ顔)が【仕様として正しい】。
        { advertiserName: 'ゲスト', totalContribution: 1000, rank: 3 },
        // 名前が「名無し」= uid があっても匿名扱いにする既存の法(誤リンク防止)。
        { userId: 999999, advertiserName: '名無し', totalContribution: 500, rank: 4 }
      ]
    }
  };
}

/** 本物の連鎖で広告段のタイルを作る。 */
function buildAdPicks({ resolveAvatarForUid } = {}) {
  const rows = normalizeNicoadRankingResponse(realAdApiJson());
  expect(Array.isArray(rows)).toBe(true); // 前提: 書き手が実際に行を吐いている
  const rooms = officialDomRankingRowsToStripRooms(rows, { userKeyKind: 'ad' });
  return adLanePicksFromRooms(rooms, {
    yukkuriFaceFor: (key) => `yukkuri:${key}`,
    ...(resolveAvatarForUid ? { resolveAvatarForUid } : {})
  });
}

/** 他レーンが使うのと同じ正本解決器。観測済みサムネを持つ人だけ URL を返す。 */
function realResolverFor(observedByUid) {
  return (uid) =>
    resolveStoryLaneAvatarSrc(
      { userId: uid, avatarUrl: '' },
      {
        snapshot: { viewerUserId: '', broadcasterUserId: '', broadcasterIconUrl: '' },
        isOwnPosted: false,
        rememberedAvatar: observedByUid[uid] || ''
      }
    );
}

describe('★広告段のサムネが他レーンと同じ正本経路で解決される', () => {
  it('★修正前の再現: 正本を注入しないと、観測済みサムネがあっても使われない', () => {
    const picks = buildAdPicks(); // resolveAvatarForUid なし = 旧挙動
    const rinku = picks.find((p) => p.title === '君斗りんく@クリエイター応援');
    expect(rinku).toBeTruthy();
    // 旧挙動では CDN 導出 URL(uid由来)止まり=観測済みの実サムネは使えない。
    expect(rinku.displaySrc).not.toContain('observed-real-thumb');
  });

  it('★修正後: 観測済みの実サムネ(他レーンで出ているもの)が広告段でも使われる', () => {
    const observed = { '4046119': 'https://secure-dcdn.cdn.nimg.jp/observed-real-thumb.jpg' };
    const picks = buildAdPicks({ resolveAvatarForUid: realResolverFor(observed) });
    const rinku = picks.find((p) => p.title === '君斗りんく@クリエイター応援');
    expect(rinku.displaySrc).toBe('https://secure-dcdn.cdn.nimg.jp/observed-real-thumb.jpg');
    // ★これが「りんく段では出るのに広告段では白丸」の解消そのもの。
  });

  it('観測済みが無い記名広告主は従来どおり uid 由来の CDN URL へ落ちる(退行なし)', () => {
    const picks = buildAdPicks({ resolveAvatarForUid: realResolverFor({}) });
    const kenpi = picks.find((p) => p.title === 'けんぴ');
    // ゆっくり顔ではなく、uid 由来の実URLが出ること(v0.1.908 の「ぱき」対処を壊さない)。
    expect(kenpi.displaySrc).toMatch(/^https?:\/\//);
    expect(kenpi.displaySrc).not.toMatch(/^yukkuri:/);
  });

  it('★匿名広告主(uid なし)は正本を呼ばずキャラ顔のまま=推測で他人の顔を出さない', () => {
    const calls = [];
    const picks = buildAdPicks({
      resolveAvatarForUid: (uid) => { calls.push(uid); return 'https://x/should-not-be-used.jpg'; }
    });
    const guest = picks.find((p) => p.title === 'ゲスト');
    expect(guest.displaySrc).toMatch(/^yukkuri:/);       // キャラ顔=仕様どおり
    // uid を持たない行では解決器を呼ばない(誤リンクより false negative の既存方針を維持)。
    expect(calls).not.toContain('');
    // 「名無し」も uid があっても匿名扱い=正本を呼ばない。
    const nanashi = picks.find((p) => p.title === '名無し');
    expect(nanashi.displaySrc).toMatch(/^yukkuri:/);
    expect(calls).not.toContain('999999');
  });

  it('公式APIがサムネを返しているときは最優先(既存の解決順を壊さない)', () => {
    const rows = normalizeNicoadRankingResponse(realAdApiJson());
    const rooms = officialDomRankingRowsToStripRooms(rows, { userKeyKind: 'ad' }).map((r) =>
      r.nickname === 'けんぴ' ? { ...r, avatarUrl: 'https://official/thumb.jpg' } : r
    );
    const picks = adLanePicksFromRooms(rooms, {
      yukkuriFaceFor: (k) => `yukkuri:${k}`,
      resolveAvatarForUid: () => 'https://resolver/other.jpg'
    });
    const kenpi = picks.find((p) => p.title === 'けんぴ');
    expect(kenpi.displaySrc).toBe('https://official/thumb.jpg');
  });
});

// ─────────────────────────────────────────────────────────────────
// wiring: popup-entry.js が実際に正本を注入しているか(配線忘れ=CI赤)
// ─────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// CRLF 正規化(アンカー付き regex が改行を跨ぐため)。
const popupSrc = fs
  .readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('★配線: 広告段に正本の解決器が注入されている', () => {
  it('★resolveAvatarForUid に他レーンと同じ storyGrowthAvatarSrcCandidate を渡している', () => {
    // アンカーを前後まで固定する(緩めると別の関数に化けても素通りする)。
    expect(popupSrc).toMatch(
      /resolveAvatarForUid: \(uid\) =>\n\s*storyGrowthAvatarSrcCandidate\(\{ userId: uid, avatarUrl: '' \}, lid, storageRows\),/
    );
  });

  it('★注入は1箇所だけ(数で断言=片方だけ壊す変異を通さない)', () => {
    const hits = popupSrc.match(/resolveAvatarForUid:/g) || [];
    expect(hits.length).toBe(1);
  });

  it('★広告段の呼び出し自体が無条件文として残っている', () => {
    expect(popupSrc).toMatch(
      /STORY_SOURCE_STATE\.adThrowerPicks = adLanePicksFromRooms\(\n\s*officialDomRankingRowsToStripRooms\(nicoadApiRows, \{ userKeyKind: 'ad' \}\),/
    );
  });
});
