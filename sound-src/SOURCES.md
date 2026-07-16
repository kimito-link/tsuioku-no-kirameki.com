# sound-src/ 原素材の出典

## 2026-07-16: 旧出典表(Freesound CC0)を撤回

このファイルは以前、`gift-whoosh.mp3`/`gift-impact.mp3`/`gift-sparkle.mp3`および
`tiers/`配下26ファイルについて、具体的な投稿者名・Freesound IDを添えた「CC0出典表」を
記載していた。しかし本人(kimito)から「Audiostockを定額契約してダウンロードした素材の
記憶が強い」との指摘があり、Freesound CC0という出典記録自体の裏取りができない
(AIが記載した内容が実態と一致しない疑いが濃い)と判明したため、該当ファイルは全て
リポジトリから削除した:

- `gift-whoosh.mp3` / `gift-impact.mp3` / `gift-sparkle.mp3`(旧effect-gift.mp3の原素材)
- `tiers/gift-{small,medium,large,mega}-{1,2,3}.mp3`(9ファイル)
- `tiers/milestone-{soft,hard,jackpot}-{1,2,3}.mp3`(9ファイル)
- `tiers/reach-{1,2}.mp3`(2ファイル)

これらは元々`scripts/build-sounds.mjs`の`buildSynthPachinkoSuite`(ffmpeg `aevalsrc`による
完全な数式合成)で毎回上書きされる関係にあり、実際に配布されている音声ファイルの中身は
出典不明の外部素材ではなく合成音だった(このことは`node scripts/build-sounds.mjs`を再実行し
既存ファイルとバイト単位で完全一致することを確認済み)。ただし「原素材ファイルそのもの」を
リポジトリに置き続けること自体がライセンス上のリスクだったため、原素材と、それを読み込む
コード経路(`buildTierVariations`・`buildGiftSound`)を完全に削除した。

## 現在の状態: 全音源は自作合成 + 効果音ラボ(soundeffect-lab.info)のみ

`extension/sound/tiers/`配下のgift/reachの全14ファイルと`effect-gift.mp3`
(`tiers/gift-medium-1.mp3`の複製)は、`scripts/build-sounds.mjs`の`buildSynthPachinkoSuite`
が`ffmpeg aevalsrc`(正弦波の数式)のみで生成する完全自作合成音。外部音声ファイルの読み込みは
一切なく、`npm run sound:build`を実行すれば誰の環境でも同じバイト列が決定論的に再現される
(乱数不使用)。

## 2026-07-16: ad/rank_up/milestone_soft/hard/jackpotに効果音ラボ(soundeffect-lab.info)素材を追加

`sound-src/soundeffect-lab/`配下の原素材(10ファイル)から`extension/sound/tiers/`の
`ad-*`/`rank-up-*`/`milestone-soft-*`/`milestone-hard-*`/`milestone-jackpot-*`(合計15ファイル)
を生成する(`buildSoundEffectLabVariations`・ラウドネス正規化のみ)。milestone-*は上記の
自作合成音を完全に置き換える(ユーザー承認済み)。

出典: [効果音ラボ](https://soundeffect-lab.info/)。利用規約([soundeffect-lab.info/agreement/](https://soundeffect-lab.info/agreement/))で
商用利用無料・クレジット表記不要・「アプリの操作音として組み込む」用途が明示的に許可されている
(禁止されるのは「効果音を自由に鳴らせるアプリの作成」＝ユーザーが音源を自由選択する機能。
本プロジェクトの未公開「マイ効果音」機能はこの禁止に抵触しうるため、この用途では使わないこと)。

| ファイル | 元タイトル(効果音ラボ) | 用途 |
|---|---|---|
| `soundeffect-lab/shakin1.mp3`〜`shakin3.mp3` | シャキーン(全3種) | rank_up(順位上昇・短い上昇感) |
| `soundeffect-lab/cute-pose1.mp3`〜`cute-pose2.mp3` | 可愛く輝く(全2種・1本は複製で3本目を埋める) | ad(広告・控えめな通知) |
| `soundeffect-lab/item-get1.mp3`〜`item-get2.mp3` | アイテムを入手(全2種・1本は複製で3本目を埋める) | milestone_soft(100/200件到達) |
| `soundeffect-lab/levelup1.mp3` | レベルアップテッテレー(1種・複製で3本埋める) | milestone_hard(500件到達) |
| `soundeffect-lab/jajean1.mp3` / `trumpet1.mp3` | ジャジャーン / ラッパのファンファーレ(1本は複製で3本目を埋める) | milestone_jackpot(1000件以上・大当たり) |

rank_downは価値序列上いちばん控えめであるべきため、引き続き自作合成音(gift-small系)を使う。
