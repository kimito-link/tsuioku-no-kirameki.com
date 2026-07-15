# sound/ 配下の効果音クレジット

このディレクトリの mp3 は以下の出典です。差し替える場合もこのファイルを更新してください。

## v0.1.1053 で追加(ギフト/広告/イベント順位変動の効果音) — 2026-07-15 ad/rank-up/rank-down は差し替え済み

出典: [OtoLogic](https://otologic.jp/)（フリー効果音素材・[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)）

| ファイル | 元素材名 | 用途 |
|---|---|---|
| `effect-gift.mp3` | Cash_Register-Beep01-1 | ギフトが投げられたとき(v0.1.1059でCC0へ差し替え済み・下記参照) |
| ~~`effect-ad.mp3`~~ | ~~Short_Accent01-1(Dry)~~ | 2026-07-15差し替え(下記参照) |
| ~~`effect-rank-up.mp3`~~ | ~~Inspiration02-1(High)~~ | 2026-07-15差し替え(下記参照) |
| ~~`effect-rank-down.mp3`~~ | ~~Onoma-Negative01-1(Dry)~~ | 2026-07-15差し替え(下記参照) |

上記のうち有効なOtoLogic依存は無し(全て差し替え済み)。この節は履歴として残す。

## v0.1.1054 で追加(コメント数マイルストーン=パチンコ演出の効果音) — 2026-07-15 差し替え済み

出典: [OtoLogic](https://otologic.jp/)（フリー効果音素材・[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)）

| ファイル | 元素材名 | 用途 |
|---|---|---|
| ~~`effect-milestone-soft.mp3`~~ | ~~Phrase01-1~~ | 2026-07-15差し替え(下記参照) |
| ~~`effect-milestone-hard.mp3`~~ | ~~Winning_Bell01-05(Gentle)~~ | 2026-07-15差し替え(下記参照) |
| ~~`effect-milestone-jackpot.mp3`~~ | ~~Winning_Bell01-01(Strong)~~ | 2026-07-15差し替え(下記参照) |

上記のうち有効なOtoLogic依存は無し(全て差し替え済み)。この節は履歴として残す。

## v0.1.1059 で更新(ギフト音を差し替え+パチンコ台的バリエーションを新設) — 2026-07-16 出典記録を撤回・全面差し替え

当初は「Freesound(CC0)素材3層(投擲のフッ→着弾のドン→きらめきの余韻)の自作ミックス」
「`sound-src/tiers/`配下26ファイルもFreesound CC0」と記録していたが、本人(kimito)から
「Audiostockを定額契約してダウンロードした素材の記憶が強い」との指摘があり、この
Freesound出典記録自体が信頼できない(AIが記載した内容で裏取りができない)と判明した。
該当する原素材ファイル(`gift-whoosh.mp3`/`gift-impact.mp3`/`gift-sparkle.mp3`、
`sound-src/tiers/`配下26ファイル)と、それらを読み込むビルドコード
(`buildGiftSound`・`buildTierVariations`)は2026-07-16に全てリポジトリから削除した。
詳細は`sound-src/SOURCES.md`参照。

「1つだけでなくパチンコみたいにたくさん欲しい」というユーザー要望に対応した
`sound/tiers/` 配下(ギフト金額帯small/medium/large/mega・マイルストーン段階
soft/hard/jackpot・リーチ演出、全23ファイル)は、v0.1.1069時点で既に
`scripts/build-sounds.mjs`の`buildSynthPachinkoSuite`(ffmpeg `aevalsrc`による完全な
数式合成・サードパーティ音源不使用)へ上書きされていたため、**上記の出典撤回による
実配布物への影響は無い**(実際に鳴っているのは元から自作合成音)。`effect-gift.mp3`
(GIFT種別のフォールバック単一ファイル)も`tiers/gift-medium-1.mp3`の複製に差し替え、
自作合成音へ完全統一した。`effectSoundPlayer.js`の`resolveEffectSoundPath()`が
カテゴリ内からランダムに1本選んで再生する。

## v0.1.1150(効果音最適化)で追加(ad/rank-up/rank-downをCC0化)

`effect-ad.mp3`・`effect-rank-up.mp3`・`effect-rank-down.mp3`(旧OtoLogic CC BY 4.0)は
`EFFECT_SOUND_VARIANT_PATHS`にエントリが無くv0.1.1059のバリエーション化から取り残されていた。
既存の自作合成音(上記参照)を音色転用してバリエーション化:

| kind | 転用元 | 選定理由 |
|---|---|---|
| `ad` | `tiers/gift-medium-1/2/3.mp3` | チャイム系・ギフト未満の控えめな通知 |
| `rank_up` | `tiers/milestone-soft-1/2/3.mp3` | 短い上昇モチーフ・通知音 |
| `rank_down` | `tiers/gift-small-1/2/3.mp3` | 短いポップ音・最も控えめな通知 |

フォールバック単一ファイル(`effect-ad.mp3`等)も各カテゴリの1番目のコピーに差し替え済み。
新規ファイル追加は無し(`web_accessible_resources`の`sound/tiers/*.mp3`ワイルドカードで既にカバー
済み)。

## 2026-07-15 マイルストーン(soft/hard/jackpot)のフォールバック単一ファイルもCC0化

`effect-milestone-soft.mp3`・`effect-milestone-hard.mp3`・`effect-milestone-jackpot.mp3`は
v0.1.1059時点で`EFFECT_SOUND_VARIANT_PATHS`のバリエーション化対象になっており通常時は
`tiers/milestone-*.mp3`(自作合成音)が優先再生されるため実害は薄かったが、フォールバック経路
(バリエーション解決に失敗した場合)に落ちると旧OtoLogic音源が鳴る余地が残っていた。ad/rank系
(v0.1.1150)と同じパターンで、各カテゴリの1番目のコピーに差し替え:

| ファイル | 差し替え元 |
|---|---|
| `effect-milestone-soft.mp3` | `tiers/milestone-soft-1.mp3` |
| `effect-milestone-hard.mp3` | `tiers/milestone-hard-1.mp3` |
| `effect-milestone-jackpot.mp3` | `tiers/milestone-jackpot-1.mp3` |

これにより`extension/sound/`配下のOtoLogic(CC BY 4.0)依存は完全にゼロになった
(popup.htmlフッターのOtoLogicクレジット表記は撤去可能)。

## 既存(v0.1.806〜) — 2026-07-15 出典確認完了

`voice-complete.mp3` / `voice-watch.mp3` — kimito(本プロジェクト開発者)本人が作成した音声。
別プロジェクト(dns-osint-pro)のコミットログに「kimitoさん提供の音声ファイル(D:/download/)を
rubberbandで変換」と記録されており、元音声(「完成しました.mp3」「ゆっくりみていってね.mp3」)も
本人が用意したもの(記憶では何らかの音声合成サービスを使用)であることを本人が確認済み。
第三者素材ではないため権利上の懸念なし。同梱継続で問題ない。
