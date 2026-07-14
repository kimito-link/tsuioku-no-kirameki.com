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

## v0.1.1054 で追加(コメント数マイルストーン=パチンコ演出の効果音)

出典: [OtoLogic](https://otologic.jp/)（フリー効果音素材・[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)）

| ファイル | 元素材名 | 用途 |
|---|---|---|
| `effect-milestone-soft.mp3` | Phrase01-1 | コメント数が100/200件に到達したとき |
| `effect-milestone-hard.mp3` | Winning_Bell01-05(Gentle) | コメント数が500件に到達したとき |
| `effect-milestone-jackpot.mp3` | Winning_Bell01-01(Strong) | コメント数が1000件以上に到達したとき(大当たり) |

## v0.1.1059 で更新(ギフト音を差し替え+パチンコ台的バリエーションを新設)

`effect-gift.mp3`(旧: OtoLogic Cash_Register-Beep01-1)が「ギフトらしくない・迫力がない」と
不評だったため、Freesound(CC0)素材3層(投擲のフッ→着弾のドン→きらめきの余韻)の自作ミックスに
差し替え。CC0のためクレジット表記は法的に不要だが、選定ミス時の追跡性のため
`sound-src/SOURCES.md` に出典を記録している(素材原本は `sound-src/`、ビルド成果物は
`scripts/build-sounds.mjs` が `extension/sound/` へ出力する)。

あわせて「1つだけでなくパチンコみたいにたくさん欲しい」というユーザー要望に対応し、
`sound/tiers/` 配下にギフト金額帯(small/medium/large/mega)・マイルストーン段階
(soft/hard/jackpot)・リーチ演出、それぞれ2〜3種類のバリエーションを追加(全23ファイル)。
**注: v0.1.1069(`scripts/build-sounds.mjs`の`buildSynthPachinkoSuite`)で、gift-*/milestone-*/
reach-*の全23ファイルはFreesound CC0素材から「ffmpeg aevalsrcによる完全自作合成音(決定論・
サードパーティ音源不使用)」へ上書きされている。`sound-src/SOURCES.md`のFreesound出典表は
現在使われていない過去の記録(履歴として残置)。実際に鳴っているのは自作合成音のためライセンス
上さらにクリア(帰属表記の必要すら無い)。**`effectSoundPlayer.js`の`resolveEffectSoundPath()`が
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
済み)。これによりOtoLogic依存はゼロになった(popup.htmlフッターのOtoLogicクレジット表記は撤去可能)。

## 既存(v0.1.806〜) — 2026-07-15 出典確認完了

`voice-complete.mp3` / `voice-watch.mp3` — kimito(本プロジェクト開発者)本人が作成した音声。
別プロジェクト(dns-osint-pro)のコミットログに「kimitoさん提供の音声ファイル(D:/download/)を
rubberbandで変換」と記録されており、元音声(「完成しました.mp3」「ゆっくりみていってね.mp3」)も
本人が用意したもの(記憶では何らかの音声合成サービスを使用)であることを本人が確認済み。
第三者素材ではないため権利上の懸念なし。同梱継続で問題ない。
