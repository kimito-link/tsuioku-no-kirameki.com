# 実装ハンドオフ — 効果音最適化

正本設計: [sound-optimization-DESIGN.md](sound-optimization-DESIGN.md)

## 前提

会議ハーネス(4体)→Fable設計の結果。**会議が提示した具体的ファイル名は幻覚(実在しない)なので無視**。実際の差し替え対象は司令塔の実コード裏取りで確定済み(下記)。

## スコープ

1. `voice-complete.mp3`/`voice-watch.mp3`の出典調査(最優先・コード変更ゼロ)
2. `effect-ad.mp3`・`effect-rank-up.mp3`・`effect-rank-down.mp3`(現役OtoLogic CC BY 4.0)をCC0音源へ差し替え
3. OtoLogic依存の完全撤去(CREDITS.md・popup.htmlフッター整理)

## 着手手順(TDD)

1. ブランチを切る(例: `feat/sound-optimization-ad-rank`)
2. T1(voice出典調査)を先に実施。`dns-osint-pro`リポと`v0.1.806`前後のコミット/HANDOFFをgrep。特定できればCREDITS.mdの該当行を確定記録に置換、できなければ再生成タスクとして別途起票
3. T2: Freesound CC0からad/rank-up/rank-down用の音源を選定(設計書§2の基準: 短さ・音色・価値序列)
4. T3: `sound-src/tiers/`へ配置、`sound-src/SOURCES.md`に出典追記(ID・投稿者・ライセンス)
5. T4: `scripts/build-sounds.mjs`に新カテゴリ追加、`extension/sound/tiers/ad-*.mp3`等を正規化出力
6. T5(先にテスト): `effectSoundPlayer.test.js`に`resolveEffectSoundPath('ad', {rng})`等のテストを追加→`EFFECT_SOUND_VARIANT_PATHS`にAD/RANK_UP/RANK_DOWNを追加
7. T6: フォールバック単一ファイルもCC0代表音に差し替え、旧OtoLogic mp3削除、CREDITS.md OtoLogic節+popup.htmlフッター表記を撤去(T5と同一コミットにすること)
8. `npm run verify:cc`全緑確認
9. version bump(3点セット)+`npm run copy:ext`
10. reality-checkerに検証委任

## 機械的な完了判定

- `npm run verify:cc`全緑
- `rg -i "otologic" src extension`が0件(依存完全撤去の確認)
- 実機確認(ユーザーへ依頼): 診断ページの試聴機能で新しいad/rank-up/rank-down音を聞く。rank-up/rank-downは実配信でイベント順位変動時に実際に発火するか確認

## 地雷(正本設計から再掲)

1. T5(variant追加)とT6(フォールバック差し替え+クレジット撤去)は別コミットにしない
2. rank-downの音量調整はbuild時でなく`playEffectSound`のvolume引数側で行う(loudnorm後の再減衰はTP保証を崩す)
3. manifestの`web_accessible_resources`が`sound/tiers/*`を包含しているか要確認(断言せず実ファイルで検証)

## 次に必要な作業

実装は次チャット、または別モデルへ委譲してよい。着手時はこの1枚と正本設計を参照すること。
