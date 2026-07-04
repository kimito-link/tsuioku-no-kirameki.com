# sound/ 配下の効果音クレジット

このディレクトリの mp3 は以下の出典です。差し替える場合もこのファイルを更新してください。

## v0.1.1053 で追加(ギフト/広告/イベント順位変動の効果音)

出典: [OtoLogic](https://otologic.jp/)（フリー効果音素材・[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)）

| ファイル | 元素材名 | 用途 |
|---|---|---|
| `effect-gift.mp3` | Cash_Register-Beep01-1 | ギフトが投げられたとき |
| `effect-ad.mp3` | Short_Accent01-1(Dry) | ニコニ広告が投稿されたとき |
| `effect-rank-up.mp3` | Inspiration02-1(High) | 参加中イベントの順位が上がったとき |
| `effect-rank-down.mp3` | Onoma-Negative01-1(Dry) | 参加中イベントの順位が下がったとき |

CC BY 4.0 につきクレジット表記が必須。ユーザー向け表示は `popup.html` フッター(OtoLogic へのリンク)で満たす。

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
(soft/hard/jackpot)・リーチ演出、それぞれ2〜3種類のバリエーションを追加(全23ファイル、
Freesound CC0)。出典一覧は `sound-src/SOURCES.md` を参照。`effectSoundPlayer.js` の
`resolveEffectSoundPath()` がカテゴリ内からランダムに1本選んで再生する。

## 既存(v0.1.806〜)

`voice-complete.mp3` / `voice-watch.mp3` — 出典未記録(過去実装分、要調査)。
