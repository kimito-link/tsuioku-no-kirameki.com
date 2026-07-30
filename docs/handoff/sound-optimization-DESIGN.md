# 設計書 — 効果音最適化(アプリの世界観にマッチさせる・メンテナンス期間中の差し替え)

- 設計: Fable(claude-fable-5サブエージェント) / 素材: 会議ハーネス(4体・動的ルーティング) / 統合・裏取り: 司令塔(Claude Code)
- 日付: 2026-07-15
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物

## 背景

ユーザーから「メンテナンス中なのでいまのうちに音を、アプリに入れてもいいものと差し替えたい」という依頼。会議ハーネス(gpt-oss-120b/mistral-large-3-675b/qwen3.6-27b/llama-3.3-70b)に投げたところ、具体的な差し替え候補として`metal_clang_01`・`wood_thud_02`・`cash_register_01`・`synth_riser_03`等のファイル名が挙がったが、**司令塔の実コード裏取りの結果これらは実在せず、会議側の幻覚と判明**。実際のファイル一覧・出典・配線状況を裏取りした上でFableに設計させ直した。

## 実コードの現状(裏取り済み・正)

**CC0(Freesound)で既に対応済み**:
- ギフト着弾音(投擲→着弾→余韻の3層構造・`scripts/build-sounds.mjs`でミックス+loudnorm正規化)
- `extension/sound/tiers/`配下23ファイル: gift-small/medium/large/mega・milestone-soft/hard/jackpot・reach、各2〜3バリエーション、全てFreesound CC0
- `resolveEffectSoundPath()`が`EFFECT_SOUND_VARIANT_PATHS`にエントリのあるカテゴリはtiers版を優先選択。milestone-soft/hard/jackpotは既にtiers版が実質稼働中(単層版effect-milestone-*.mp3はフォールバック専用で鳴っていない)。

**未対応・現役でOtoLogic(CC BY 4.0・クレジット表記必須)のまま**(今回の実質的な差し替え対象):
- `extension/sound/effect-ad.mp3`(元: Short_Accent01-1(Dry)) — ニコニ広告投稿時
- `extension/sound/effect-rank-up.mp3`(元: Inspiration02-1(High)) — イベント順位アップ時
- `extension/sound/effect-rank-down.mp3`(元: Onoma-Negative01-1(Dry)) — イベント順位ダウン時
- これら3つは`EFFECT_SOUND_VARIANT_PATHS`にエントリが無いため単一ファイルのまま鳴り続けている

**出典未記録・要調査**:
- `extension/sound/voice-complete.mp3`・`voice-watch.mp3`(読み上げ完了音声、v0.1.806〜)。CREDITS.md自身が「出典未記録・要調査」と自白している。

## 設計(Fable)

### 1. 差し替え対象の確定: ad/rank-up/rank-downの3音とも差し替える

法務上はOtoLogic CC BY 4.0をpopup.htmlフッターでクレジット表記済みのため既にクリアだが、品質構造の問題として差し替えを推奨:
- この3音だけ`EFFECT_SOUND_VARIANT_PATHS`に無く毎回同一音=v0.1.1059で全カテゴリに適用したパチンコ的バリエーション原則から取り残された旧世代
- tiers/23本の「ポップ→チャイム→ファンファーレ」という明るい高音域系の選定思想と系統が異なる
- 3本差し替え完了でOtoLogic依存がゼロになり、CREDITS.mdのOtoLogic節とpopup.htmlフッター表記を撤去でき、帰属管理コストが恒久的に消える

### 2. 選定基準(価値の序列との整合)

3イベントとも「ギフト未満の控えめ通知」層。gift-large/megaのファンファーレ感は禁止。

| イベント | 長さ目安 | 音の性格 | 序列上の位置 |
|---|---|---|---|
| ad(ニコニ広告) | 〜1.0秒 | gift-medium同族のチャイム/マリンバ系だが音色で区別(例: 木質2音) | gift-small〜medium相当 |
| rank-up | 〜0.8秒 | 2〜3音の短い上昇モチーフ、アタック強・減衰速。ファンファーレ化厳禁 | 通知(gift未満) |
| rank-down | 〜0.8秒 | 柔らかい下降2音、ブザー/エラー音の刺々しさ禁止 | 通知の中で最も控えめ |

共通: 頭からガツン(short-punchy原則)・loudnorm I=-14 LUFS/TP=-1.0(既存build-sounds.mjsパイプライン踏襲)・各2〜3バリエーション・Freesound CC0優先。

### 3. voice-complete/voice-watchの出典調査: 「調べ直す」を推奨(据え置き不可)

効果音でなく音声セリフであり、ライセンス種別自体が不明という唯一の同梱ファイル。CC BY表記漏れより一段悪く、CWS審査・権利者申立ての両面で同梱物中の最大リスク。手順: dns-osint-proリポと当時のコミット/HANDOFFをgrepし、(a)自作TTSなら合成エンジンの利用規約を確認しCREDITS.mdに記録、(b)特定不能なら規約明確なTTSで再生成して差し替え。

### 4. 優先順位(メンテナンス期間の活用)

1. **voice出典調査**(コード変更ゼロ・最大リスクの解消)
2. **ad/rank 3音のCC0差し替え**(診断ページの試聴機能で実配信不要=メンテ中が最適。rank-up/downの実発火確認だけは次の実配信送り)
3. **OtoLogic全廃の後始末**(フォールバック単層差し替え+CREDITS/フッター整理。2の完了が前提)

### 5. 実装引き継ぎタスクリスト

- **T1** voice出典調査: dns-osint-proリポ+v0.1.806前後のコミットをgrep→CREDITS.mdの「要調査」行を確定記録に置換。特定不能なら再生成タスクへ分岐
- **T2** 音源選定: Freesound CC0からad系3本・rank-up系2-3本・rank-down系2-3本(§2基準)。診断ページで試聴→ユーザー採否
- **T3** `sound-src/tiers/`へ配置+`sound-src/SOURCES.md`にID/投稿者/ライセンス追記
- **T4** `scripts/build-sounds.mjs`に3カテゴリ追加→`extension/sound/tiers/ad-1..3.mp3`等を正規化出力
- **T5(TDD可)** `effectSoundPlayer.test.js`に先にテスト追加: `resolveEffectSoundPath('ad', {rng})`がtiersバリアントを返す・rng固定で決定的・未知kindは従来フォールバック維持 → `EFFECT_SOUND_VARIANT_PATHS`にAD/RANK_UP/RANK_DOWN追加。manifestの`web_accessible_resources`が`sound/tiers/*`を包含するか要確認(既存tiersが動作中なので恐らくワイルドカード済みだが断言禁止)
- **T6** `EFFECT_SOUND_PATHS`のフォールバック3本もCC0代表音に差し替え・旧OtoLogic mp3削除→リポ全grepでOtoLogic残存ゼロ確認→CREDITS.mdのOtoLogic節+popup.htmlフッター表記を撤去
- **T7** `npm run verify:cc`→version bump→copy:ext→reality-checker→反映3手順をユーザーへ併記

### 地雷

- **T5とT6は別コミットにしない**(variantだけ足すとフォールバックが死蔵OtoLogicのまま同梱され、クレジット撤去(T6)と矛盾する)
- rank-downの音量調整はbuild時(-3dB)でなくloudnorm後の再減衰になるとTP保証が崩れるため、やるなら`playEffectSound`のvolume引数側で調整する

## 会議ハーネスからの学び

会議メンバーが提示した具体的ファイル名(`metal_clang_01`等)は実在しない幻覚だった。抽象的な方向性(音色の一貫性・テンポ統一・Freesound以外の候補)は参考程度に留め、実装は必ず実コード裏取り済みの本設計書の記述に従うこと。
