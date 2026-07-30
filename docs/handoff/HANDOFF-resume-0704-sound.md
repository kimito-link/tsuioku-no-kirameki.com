# HANDOFF 2026-07-04: 音源刷新+パチンコ的ゲーム性(次チャット引き継ぎ)

> 前セッション(コンテキスト満杯で終了)の続き。ブランチ `feat/mirror-bundle-phase1`。
> **[2026-07-04 更新] push済み・リモートと同期(v0.1.1060まで)・copy:ext済み**。
> **パチンコPhase1(effectDirector.js)は v0.1.1060 で実装完了**。残りは実機試聴とPhase2〜3。

## ✅ 今セッションでコミット済み(3コミット・全て verify:cc 緑)

| commit | version | 内容 |
|---|---|---|
| `1847189c` | v0.1.1057 | status-entry.js の片翼統合修正(giftEffectDiagToActionCards配線漏れ)+ **HTMLレポート組み立てを popup/report/htmlReportDocument.js へ切り出し**(popup-entry.js 21764→19974行・max-linesラチェット20024へ) |
| `935777c8` | v0.1.1058 | ギフトitemName欠落でも汎用ラベル「ギフト」で投擲(giftThrowProjectile.js)+ **milestoneEffectDiag.js新設**(検知→演出→音の3段診断・healthCells/diagnosisRegistry/status-entry/aiShareFullText全面配線済み) |
| `3dcf54aa` | v0.1.1059 | **ギフト効果音刷新+パチンコ台的バリエーション23ファイル**(下記詳細) |

## v0.1.1059 の中身(音源)

- `scripts/build-sounds.mjs` 新設: `sound-src/`(CC0原素材)→ ffmpeg loudnorm(I=-14 LUFS/TP=-1.0)で正規化 → `extension/sound/` へ出力。`npm run sound:build` / `sound:build:all`。
- `effect-gift.mp3` をレジ音から「whoosh→impact→sparkle」3層自作ミックスに差し替え。
- `extension/sound/tiers/` に23ファイル追加: gift-small/medium/large/mega×各3、milestone-soft/hard/jackpot×各3、reach×2。**全てFreesound CC0**(出典は `sound-src/SOURCES.md`)。
- `effectSoundPlayer.js`: `EFFECT_SOUND_VARIANT_PATHS` + `resolveEffectSoundPath()`(ランダム1本選択・rng注入可)+ `effectSoundKindForGiftTier()`(tier→キー変換)。後方互換あり。
- `venueBar.js`: ギフト投擲時に `effectSoundKindForGiftTier(p.tier)` で金額帯別バリエーションを再生。マイルストーン音は popup-entry.js の既存呼び出しが自動的にバリエーション対応。
- manifest: `sound/tiers/*.mp3` を web_accessible_resources に追加。

## 🔑 Freesound APIキー

ユーザーが取得済み(アプリ名 kimitolink)。**キー本体はこのファイルに書かない**(前チャットの会話履歴、またはユーザーのFreesoundアカウント https://freesound.org/home/app_permissions/ で確認)。素材追加時に再利用可。

## ⏭ 残タスク(優先順)

1. **実機試聴の確認**: 拡張リロード(chrome://extensions で🔄)→watchタブF5で新音が鳴るはず。「レジ音より良いか」「バリエーションの感触」を確認。不満な音は `sound-src/tiers/` の該当mp3を差し替え→`npm run sound:build:all`→build→bumpで対応。
2. ~~push~~ **完了(2026-07-04)**: v0.1.1060までリモート同期済み。
3. **パチンコ的ゲーム性**(Fable設計済み・council/sound-and-pachinko-gamification.md):
   - ~~Phase 1~~ **完了(v0.1.1060)**: `src/lib/effectDirector.js` 新設(`meterStateFor`=減衰付き積算メーター半減期60秒、`directHit`=コンボ窓30秒でsoft→hard→jackpot昇格・決定論のみ)。milestoneEffectDiag 4段化済み(検知→director→演出→音・旧スナップショットは null=未計測で嘘の⚠を出さない。**Number(null)=0 の罠**に注意)。popup-entry は判定の計上のみ(音の差し替えは Phase 3)。
   - Phase 2: 盛り上がりメーターDOM 1要素を embed_watch に追加(**一度作ったら絶対removeしない**・CSSクラス切替とtextContentのみ=churn地雷対策)。`reach` 音種でリーチ発火(コメント数が次マイルストーンまで残り10%以内で1回だけ)。※reach音源2本は tiers/ に配置済み・EFFECT_SOUND_VARIANT_PATHS にキーも定義済み。メーターの入力は meterStateFor をそのまま使う。
   - Phase 3: 畳み掛け=maybePlayMilestoneEffectSound の音種選択を `_milestoneComboState.kind`(directHitの昇格結果)に差し替える(配線は popup-entry.js に準備済み)。
   - **却下事項**: 乱数・確率的な激アツ演出は禁止(ギャンブル前提に抵触)。メーターは決定論。順位変動にリーチは付けない(嘘のリーチになる)。
4. **popup-entry.js リファクタ残Phase**(Fable設計・前チャット): Phase 1.5(パリティ診断Phase1=HANDOFF-perfect-parity-diag.md)→Phase 2(celebration系1216〜2360行を popup/celebration/ へ)→Phase 3(scheduler)→Phase 4(render系・renderStoryUserLaneは除外)→Phase 5(initPopupマニフェスト化)。ラチェット運用: 抽出のたび実測+50へ下げる。refresh()/paintは凍結。
5. **片翼統合の構造的再発防止**(Fable設計): `buildActionCardsFromDiag(registry, state)` を lib の単一共有関数にして aiShareFullText.js と status-entry.js が同じ関数を呼ぶ形へ。diagnosisRegistry 各エントリに fixture(そのセルを必ず発生させる最小入力)を必須化。
6. **スコアパネル**(HANDOFF-broadcast-score-panel.md): broadcastScore.js/broadcastScoreHtml.js(テスト17件緑)が未コミットのまま作業ツリーに残存。

## ⚠ 未コミットの残置ファイル

- `scripts/council-roles.mjs` / `scripts/meeting.mjs`: 会議ハーネス自体の変更(今回のスコープ外として意図的に除外)。中身を確認してから別コミットに。
- `src/lib/broadcastScore.js` 系(上記6)。
- 大量の council/*.json・HANDOFF-*.md 等の未追跡ファイル(従来からの状態)。

## 地雷(繰り返し禁止)

- Audiostock/DOVA/PIXTA は拡張組み込みがグレー〜禁止。**購入しない**(問い合わせ回答が出るまで凍結)。効果音ラボは明確に禁止。
- verify:cc は build のたび tree-map/site-health/feature-map がドリフトする → `npm run tree-map` / `site-health` / `feature-map` を再生成してから再実行(今セッションで3回踏んだ)。
- changelog summary は35字以内(verify:bump が落ちる)。
- サブエージェント委任は完了報告を鵜呑みにせず `git status` で裏取り(前チャットで2段委任が両方とも実行せず終了した実例)。
- ②INLINE_PASSIVE に storage 書込禁止 / refresh()/paint の read path 不触 / sig に時刻禁止 / 「消す・空にする経路」に計器なしで演出DOMを触らない。
