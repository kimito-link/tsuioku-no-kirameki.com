/**
 * avatar-stability-DESIGN.md §B 手順0: UID→サムネURL計算式の重複実装が、
 * 正本 deriveAvatarUrlFromUid と実際に同じ出力を返すことを固定する等価性テスト。
 *
 * 検証対象外: src/lib/reportUserThumb.js の buildNiconicoDefaultUserIconUrl は
 *   サイズセグメント `/s/` が無く出力URLが異なる(設計書 事実6)。委譲対象外なので
 *   ここでは比較しない(§B手順6で別途裁定)。
 *
 * ★重要な結合(地雷§H-2): niconicoDefaultUserIconUrl / synthesizeCanonicalUsericon の
 *   `Math.max(1, Math.floor(n / 10000))` は、precondition `^\d{5,14}$` の下では
 *   `Math.floor(n / 10000)`(正本の式)と数学的に等価(5桁最小=10000 → floor≥1)。
 *   この等価性は regex に結合している。将来 precondition を緩めて4桁以下の uid を
 *   通すようになった瞬間、この等価性は崩れる。緩める場合は本テストを見直すこと。
 */
import { describe, it, expect } from 'vitest';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { deriveNicoUserIconUrl } from './venueSeats.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import { resolveAvatarObservation } from '../domain/user/avatar.js';

// adLanePicksFromRooms.js の nicoIconUrlForUid は v0.1.1173(§B手順1)で正本へ委譲済み。
// ただし module-private のままのため直接 import できない(委譲そのもの=deriveAvatarUrlFromUid
// を1行呼ぶだけの形なので、正本の等価性テストが間接的にこのファイルもカバーする)。

const BOUNDARY_UIDS = [
  '99', // 1桁バケット境界
  '9999', // 5桁未満(niconicoDefaultUserIconUrl の precondition ^\d{5,14}$ 境界外)
  '10000', // 5桁最小(bucket=1 境界)
  '10999',
  '86255751', // 実機観測 uid
  '99999999999999', // 14桁(上限)
  '999999999999999' // 15桁(venueSeats/adLanePicks の precondition 上限)
];

describe('deriveAvatarUrlFromUid と各コピー実装の等価性(委譲前の現状固定)', () => {
  it.each(BOUNDARY_UIDS)('venueSeats.deriveNicoUserIconUrl(%s) は正本と同じ出力', (uid) => {
    // venueSeats の precondition は ^\d{2,15}$(正本 ^[0-9]+$ の部分集合)なので
    // このリストの全 uid で両者が定義される。
    expect(deriveNicoUserIconUrl(uid)).toBe(deriveAvatarUrlFromUid(uid));
  });

  it.each(BOUNDARY_UIDS)(
    'supportGrowthTileSrc.niconicoDefaultUserIconUrl(%s) は正本と同じ出力(precondition ^\\d{5,14}$ 内のみ)',
    (uid) => {
      const expected = /^\d{5,14}$/.test(uid) ? deriveAvatarUrlFromUid(uid) : '';
      expect(niconicoDefaultUserIconUrl(uid)).toBe(expected);
    }
  );

  it('bucket=0 は max(1,floor) と floor で唯一結果が割れる境界(precondition 内では発生しないことの確認)', () => {
    // uid=99 は ^\d{5,14}$ を満たさないため niconicoDefaultUserIconUrl は '' を返す。
    // つまり bucket=0 になりうる小さい uid は、max(1,floor) 系の precondition では
    // そもそも到達しない = 等価性が regex に結合しているという設計書の指摘の実測確認。
    expect(niconicoDefaultUserIconUrl('99')).toBe('');
    expect(deriveAvatarUrlFromUid('99')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.jpg'
    );
  });

  it.each(BOUNDARY_UIDS.filter((uid) => /^\d{5,14}$/.test(uid)))(
    'domain/user/avatar.js の合成 canonical(resolveAvatarObservation 経由、%s)は正本と同じ出力',
    (uid) => {
      // synthesizeCanonicalUsericon は module-private なので、公開関数
      // resolveAvatarObservation の displayAvatarUrl フォールバック経路から間接確認する
      // (観測ソースを全て空にすると、数値 userId の合成 canonical にフォールバックする)。
      const result = resolveAvatarObservation({ userId: uid });
      expect(result.displayAvatarUrl).toBe(deriveAvatarUrlFromUid(uid));
    }
  );

  it('非数値・空は全実装で空文字', () => {
    for (const bad of ['', 'abc', 'a:12345', null, undefined]) {
      expect(deriveNicoUserIconUrl(bad)).toBe('');
      expect(niconicoDefaultUserIconUrl(bad)).toBe('');
      expect(deriveAvatarUrlFromUid(bad)).toBe('');
    }
  });
});
