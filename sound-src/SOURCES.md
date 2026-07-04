# sound-src/ 原素材の出典

`scripts/build-sounds.mjs` が読み込む生素材(CC0)。ここでミックス・正規化して
`extension/sound/effect-gift.mp3` を生成する(v0.1.1059・Fable設計に基づく3層構造)。

いずれも [Freesound](https://freesound.org/) の CC0(パブリックドメイン提供)。
CC0 のためクレジット表記は法的に不要だが、選定ミス時の追跡性のため記録する
(レジ音選定ミスの教訓・過去にeffect-gift.mp3として不評だった素材があった)。

| ファイル | 元タイトル | 投稿者 | Freesound ID | ライセンス |
|---|---|---|---|---|
| `gift-whoosh.mp3` | Swoosh.ogg | WizardOZ | [419341](https://freesound.org/s/419341/) | CC0 1.0 |
| `gift-impact.mp3` | Fruit Impact 1 | OwlStorm | [209012](https://freesound.org/s/209012/) | CC0 1.0 |
| `gift-sparkle.mp3` | achievement-sparkle | SkySpeira | [715067](https://freesound.org/s/715067/) | CC0 1.0 |

## 設計(Fable, council/sound-and-pachinko-gamification.md)

投擲のフッ(whoosh)→着弾のドン(impact)→きらめきの余韻(sparkle)の3層構造・全体1秒程度。
レジ音の失敗は「単層・文脈違い」が原因だったため、層構造で「物が飛んで当たって輝く」
物語を音にする。`scripts/build-sounds.mjs` がオフセット付きミックス+ラウドネス正規化
(`loudnorm` I=-14 LUFS / TP=-1.0dBFS)を行い `extension/sound/effect-gift.mp3` へ出力する。

## v0.1.1059(パチンコ台的バリエーション): tiers/ 配下の原素材

ユーザー要望「1つだけじゃなくパチンコみたいにたくさん欲しい」に対応。同じイベントでも
毎回違う音が鳴るよう、金額帯(ギフト small/medium/large/mega)・マイルストーン段階
(soft/hard/jackpot)・リーチ演出、それぞれに3種類前後のバリエーションを用意する。
全て [Freesound](https://freesound.org/) の CC0(パブリックドメイン提供)。

| ファイル | 元タイトル | 投稿者 | Freesound ID | ライセンス |
|---|---|---|---|---|
| `tiers/gift-small-1.mp3` | The Best Bubble Pop Sound For Game and UI | el_boss | [669918](https://freesound.org/s/669918/) | CC0 1.0 |
| `tiers/gift-small-2.mp3` | Bubble_Pop | arttim | [733264](https://freesound.org/s/733264/) | CC0 1.0 |
| `tiers/gift-small-3.mp3` | Simple Pop Sound Effect | SplendidJams | [570459](https://freesound.org/s/570459/) | CC0 1.0 |
| `tiers/gift-medium-1.mp3` | Affirmative decision chime | Raclure | [405547](https://freesound.org/s/405547/) | CC0 1.0 |
| `tiers/gift-medium-2.mp3` | Chime-Weak.flac | drooler | [660861](https://freesound.org/s/660861/) | CC0 1.0 |
| `tiers/gift-medium-3.mp3` | Chime | schreibsel | [539915](https://freesound.org/s/539915/) | CC0 1.0 |
| `tiers/gift-large-1.mp3` | Fanfare - Rpg | colorsCrimsonTears | [566203](https://freesound.org/s/566203/) | CC0 1.0 |
| `tiers/gift-large-2.mp3` | Fanfare 2 - Rpg | colorsCrimsonTears | [580310](https://freesound.org/s/580310/) | CC0 1.0 |
| `tiers/gift-large-3.mp3` | game-win.mp3 | mickleness | [269198](https://freesound.org/s/269198/) | CC0 1.0 |
| `tiers/gift-mega-1.mp3` | Tada Fanfare G | plasterbrain | [397353](https://freesound.org/s/397353/) | CC0 1.0 |
| `tiers/gift-mega-2.mp3` | Tada Fanfare F | plasterbrain | [397354](https://freesound.org/s/397354/) | CC0 1.0 |
| `tiers/gift-mega-3.mp3` | Tada Fanfare A | plasterbrain | [397355](https://freesound.org/s/397355/) | CC0 1.0 |
| `tiers/milestone-soft-1.mp3` | Chime Notification | Jofae | [380482](https://freesound.org/s/380482/) | CC0 1.0 |
| `tiers/milestone-soft-2.mp3` | Notification | DJenzyme | [454818](https://freesound.org/s/454818/) | CC0 1.0 |
| `tiers/milestone-soft-3.mp3` | Good Phone Notification Sound | qubodup | [782969](https://freesound.org/s/782969/) | CC0 1.0 |
| `tiers/milestone-hard-1.mp3` | LevelUp.wav | Kenneth_Cooney | [609335](https://freesound.org/s/609335/) | CC0 1.0 |
| `tiers/milestone-hard-2.mp3` | Level Up | qubodup | [442943](https://freesound.org/s/442943/) | CC0 1.0 |
| `tiers/milestone-hard-3.mp3` | Retro "Accomplished" SFX | suntemple | [253177](https://freesound.org/s/253177/) | CC0 1.0 |
| `tiers/milestone-jackpot-1.mp3` | Casino Hit Big Money | modusmogulus | [787908](https://freesound.org/s/787908/) | CC0 1.0 |
| `tiers/milestone-jackpot-2.mp3` | Player Wins.mp3 | henrygillard | [575427](https://freesound.org/s/575427/) | CC0 1.0 |
| `tiers/milestone-jackpot-3.mp3` | Dealer Wins.mp3 | henrygillard | [575428](https://freesound.org/s/575428/) | CC0 1.0 |
| `tiers/reach-1.mp3` | Energy Riser | magnuswaker | [522095](https://freesound.org/s/522095/) | CC0 1.0 |
| `tiers/reach-2.mp3` | Charge Up | magnuswaker | [555060](https://freesound.org/s/555060/) | CC0 1.0 |

`scripts/build-sounds.mjs` が各ファイルをラウドネス正規化して
`extension/sound/tiers/<category>-<n>.mp3` へコピーし、`effectSoundPlayer.js` が
カテゴリごとにランダムで1本選んで再生する(パチンコ台の当たり演出のように毎回違う音が鳴る)。
