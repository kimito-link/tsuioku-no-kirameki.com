# 実装ハンドオフ: サムネ表示不安定の根治(MVP)

> 正本設計: [`avatar-stability-DESIGN.md`](avatar-stability-DESIGN.md)
> 日付: 2026-07-18。3段構えワークフロー手順3の産物。実装はこのファイルを読めば着手できる粒度。

## 背景(1行)

UID→サムネURL計算式が7箇所に重複実装され割れている(白丸バグ・パリティ崩れの母体)。
会場の「空ctx」は精密調査の結果、実質的な穴は狭い(popup第2分岐=entries逆順走査相当のみ)と
判明したため、会場には新state追加せず「埋めない」裁定で確定(設計書§A)。

## MVPスコープ(今回はこれだけ)

設計書§Fの4項目のみ。**[C3]関所・[C1]の委譲は`venueSeats.js`1件のみ**、他5実装の委譲・
`reportUserThumb.js`の裁定は次フェーズ。

## 着手手順

### 1. ブランチを切る

```bash
git checkout -b feat/avatar-stability-mvp
```

### 2. 等価性テスト先行: `src/lib/deriveAvatarUrlFromUid.equivalence.test.js`

正本`deriveAvatarUrlFromUid`と、まだ委譲していない5実装(venueSeats/adLanePicksFromRooms/
supportGrowthTileSrc/domain-user-avatar/reportUserThumbは**除外**)の出力を、境界値
(`99`/`9999`/`10000`/`10999`/`86255751`/14桁/15桁/非数値/空)で比較。

- `reportUserThumb.buildNiconicoDefaultUserIconUrl`は**意図的に比較対象から除外**(設計書
  事実6: `/s/`セグメントが無く出力が異なる。別テストで現状維持を記録するのは任意)。
- テスト名に「`^\d{5,14}$`下で`max(1,floor)` ≡ `floor`」の等価性を明記すること(設計書§H-2)。

### 3. [C4] CI構造ガード: `src/lib/usericonUrlGuard.test.js`

設計書§Dの検出パターンで新規作成。**許可リストに現状の全違反ファイルを列挙して緑で導入**:

```js
const ALLOWLIST_BUILD = [
  'src/lib/deriveAvatarUrlFromUid.js', // 正本(恒久)
  'src/lib/venueSeats.js',
  'src/lib/adLanePicksFromRooms.js',
  'src/lib/supportGrowthTileSrc.js',
  'src/domain/user/avatar.js',
  'src/domain/user/avatarResolver.js', // 削除予定(手順5で外す)
  'src/lib/reportUserThumb.js' // /s/ 無しバリアント。設計書§B手順6の裁定まで残置
];
const ALLOWLIST_STRING_ONLY = [
  'src/lib/supportGrowthTileSrc.js',
  'src/domain/user/avatar.js'
];
```

`*.test.js`は検査対象から除外すること(地雷§H-8)。テスト実行して緑になることを確認してから
先へ進む。

### 4. `venueSeats.js`の委譲(設計書§B手順2)

```js
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';

export function deriveNicoUserIconUrl(uid) {
  const s = String(uid || '').trim();
  if (!/^\d{2,15}$/.test(s)) return ''; // precondition は温存(挙動不変)
  return deriveAvatarUrlFromUid(s, 's');
}
```

置換後、`ALLOWLIST_BUILD`から`'src/lib/venueSeats.js'`を削除(ratchet)。

**確認**: `venueBar.js`4176行目付近の呼び出し元は無変更のはず(export名維持)。
`venueAvatar.test.js`・v0.1.1167/1170関連テストが無変更で緑であることを確認。赤くなったら
等価性テストの反例=手順2に漏れがある。

### 5. `avatarResolver.js`は削除しない(設計書§B手順5・訂正済み)

当初「未配線dead codeなので削除」としていたが、実装時にファイル冒頭のコメントで
「設計の正本として意図的に残置。再配線時は`docs/plan-avatar-resolver-refactor.md`の
5phaseに沿う」という明示的な保持方針が確認されたため、**削除しない**(2026-07-18ユーザー判断)。
`ALLOWLIST_BUILD`にはそのまま残す(理由コメント付き)。**このステップは完了扱い(作業不要)**。

### 6. popup第2分岐カウンタ(設計書§E-1) — 実装済み

`rememberedAvatarUrlForUserId`(popup-entry.js:5380)の直前にモジュールスコープの
`_avatarRememberedDiag`カウンタを追加し、関数内の各return直前でインクリメント
(`hitProfileCache`/`hitEntriesScan`/`hitSynth`)。`getAvatarRememberedDiagSnapshot()`を
追加し、`collectAiShareDevMonitorPayloadBundle`内の`avatarLoadDiag`の直後に
`avatarRememberedDiag`セクションとして配線済み(popup-entry.js 18712行目付近)。

**配線経路の訂正(実装時に確認)**: 当初想定した`statusFastDiagLite`へのpassthroughは
**不要と判明**。popup計器(`avatarLoadDiag`等)は`payload.popup`→`KEY_AI_SHARE_POPUP_DIAG`
という、content-entry由来の`fastDiag`/`statusFastDiagLite`とは別系統の経路で状態速報に
届く(`aiShareFullText.js`が`popupDiag.popup`をJSON.stringifyでそのまま出力)。
`avatarLoadDiag`と同じ`payload.popup`ブロックに置いたことで追加配線なしで状態速報に出る
(詳細は設計書§E「出力先」参照)。

### 7. `venueLaneBuckets.js`のコメント更新(設計書§H-6・地雷)

85-87行目のコメントを、設計書§Aの裁定内容に更新する(「会場はpopup固有stateを持たないため」
だけでなく「§A裁定=埋めない、理由は avatar-stability-DESIGN.md 参照」に更新)。
このコメント更新を怠ると将来また「会場は空ctxだ」と誤診され設計が再発明される。

## 機械的な完了判定

- [ ] `deriveAvatarUrlFromUid.equivalence.test.js`が境界値全パターンで緑
- [ ] `usericonUrlGuard.test.js`が許可リスト込みで緑、`venueSeats.js`削除後も緑
- [ ] `venueSeats.deriveNicoUserIconUrl`が委譲後も既存テスト無変更で緑
- [x] `avatarResolver.js`は削除しない(設計訂正・現状維持)
- [x] popup第2分岐カウンタが`payload.popup.avatarRememberedDiag`として配線され、状態速報の
      JSON出力に自動的に現れる(lite passthroughは不要と判明・設計書§E参照)
- [ ] `venueLaneBuckets.js`85-87行目のコメントが更新されている
- [ ] `npm run verify:cc`全緑
- [ ] 新規ファイル追加のためtree-map/feature-map再生成をコミットに含める
- [ ] 実機確認: 状態速報に`hitProfileCache`/`hitEntriesScan`/`hitSynth`が印字されることを確認
      (実配信で数字が入ることまでは今回のMVPでは必須としない。次回配信時の実測が§A再裁定の
      データになる)

## 地雷(設計書§Hより実装時に特に注意すべきもの再掲)

- `reportUserThumb.js`は**今回は一切触らない**(式が違う。設計書§B手順6は次フェーズ)。
- `*.test.js`をCI構造ガードの検査対象に含めない(期待値リテラルで即赤になる)。
- lite passthrough忘れ厳禁(v0.1.1124前科)。
- 検証エージェント並走中はcommitしない。
- 新規lib追加時は`npm run verify:cc`一本で確認し、個別コマンドのpiecemeal実行に頼らない。

## 次フェーズ(MVP完了後、このハンドオフのスコープ外)

- [C1]残り5実装(adLanePicksFromRooms/supportGrowthTileSrc/domain-user-avatar)の委譲統合
  (設計書§B手順1・3・4)
- `reportUserThumb.js`の実機裁定(§B手順6)
- [C3]resolveUserIdentity関所の新設(設計書§C)。委譲が3件済んでから着手。
- avatarPathId分布計器(設計書§E-2)。関所実装後に着手。
- §Aの再裁定: popup第2分岐カウンタの実配信データが貯まってから、`hitEntriesScan`の比率が
  1%を超えるようなら(b)案(会場にも代替情報源)を再検討する。
