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

## 現在の状態: 全音源は自作合成(サードパーティ素材ゼロ)

`extension/sound/tiers/`配下(gift/milestone/reachの全23ファイル)と`effect-gift.mp3`
(`tiers/gift-medium-1.mp3`の複製)は、`scripts/build-sounds.mjs`の`buildSynthPachinkoSuite`
が`ffmpeg aevalsrc`(正弦波の数式)のみで生成する。外部音声ファイルの読み込みは一切なく、
`npm run sound:build`を実行すれば誰の環境でも同じバイト列が決定論的に再現される
(乱数不使用)。詳細は`extension/sound/CREDITS.md`を参照。
