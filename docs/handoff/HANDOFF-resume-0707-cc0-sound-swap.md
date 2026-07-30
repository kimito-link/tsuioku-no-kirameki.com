# 引き継ぎ: CC0/Pixabay音源への差し替え(2026-07-07)

> 前チャットがコンテキスト上限で終了。このmdだけ読めば続きを再開できる。
> 正本メモリ: memory/pachinko-phase-a-custom-sounds-2026-07-05.md / sound-selection-short-punchy.md / sound-mapping-money-hierarchy.md / effect-intensity-respects-value-hierarchy.md / release-process-guards-2026-07-06.md

## いまブランチ状態(触る前に必ず確認)
- ブランチ `feat/pachinko-phase-a-custom-sounds`・HEAD=ae929959・**v0.1.1100**・ローカル=リモート一致・作業ツリーはほぼクリーン(scripts/council-roles.mjs, scripts/meeting.mjs と council/系の未追跡だけ残置)。
- PR #239 に v0.1.1071〜1100 が積み上がっている(未マージ)。
- 未追跡WIP: src/lib/avCue*(AV同期V1・ユーザー停止中)/ broadcastScore*(採点で一部使用済み)。SC4 Web採点シートのエージェント出力は**未pushで破棄扱い**(ユーザーの本意は「Chrome拡張の中で効果音として使う」でWeb版は不要と判明)。

## ★今回の核心(確定事実)
1. 既存の実物音源(Audiostock定額DL・100本・D:\download)は**個人の配信/録画では合法**だが、**拡張に同梱してChrome Web Storeで不特定多数に配布するのは規約NG**。Audiostock標準の定額プランは「アプリへの音源組み込み」対象外=別途カスタマイズプラン(別料金・要問合せ)が必要と公式2ページで確認済み。
2. ユーザーの本当の要望=「**拡張をインストールした全員が、最初から効果音が鳴る状態**」。今の設計(音源は各自ローカル・非同梱)ではインストール者は無音。
3. **解決策=Pixabay音源への差し替え**。Pixabay Content License は「作品(=拡張)の部品として組み込む」のはOK・帰属不要・商用可・**拡張同梱してストア配布OK**(禁止は「音源単体のstandalone再配布」のみ)。裏取り済み。→ 規約クリア+全員に鳴る+追加費用ゼロ。

## ユーザー確定の音選定ルール(メモリ化済み)
- **短く・アタック強め(ベロシティ強)**で選ぶ。長い音はタイミングがずれる。単発SEは〜1〜2秒・頭からガツン。
- **お金の重み順に音を並べる**:
  - ギフト(お金入った)= レジのチャリン♪(cash register kaching系)
  - 無料アイテム(メガホン等)= 軽く小さく短い(0.2-0.3秒 ポンッ/ピコッ)=連投されるので邪魔しない
  - 広告 = 短いファンファーレ/登場音(**レジ音は従来広告→ギフトへ移す**のが新方針)
- 無料は演出も控えめ=価値序列を守る。

## いま止まっている地点=次にやること
ユーザーの最後の指示:「**もう全部埋め込んだやつでつくって、診断ページにあるようなやつ**」。
= 候補を眺めるだけの選定シート(scratchpad/sound-select-sheet.html・Artifact公開済み)ではなく、**Pixabay音源を実際に全部DL→拡張に埋め込んで、診断ページ(status.htmlの効果音試聴パネルのような形)でその場で鳴らして確認できる状態**を作ってほしい。

### 具体的な次アクション
1. **Pixabay音源を各キー分DL**(claude-in-chrome・Pixabayは無料DL・ログイン不要)。手順: `https://pixabay.com/sound-effects/search/<語>/` 検索→作品ページ緑「Free download」。作品ページで Pixabay Content License を確認。短くアタック強い候補優先。まず「お金3種+迫力の核」から:
   - ギフト(レジ): `cash register kaching`(例 Cash Register (Kaching) 作品URL film-special-effects-cash-register-kaching-sound-effect-125042)
   - 無料アイテム: `bubble pop` / `pop` の軽い短いもの
   - 広告: `fanfare` / `win jingle` の短いもの
   - 大当たり: `casino win` / `jackpot` の短いhit
   - きゅいん: `riser`(Riser Resonant Mod Sweep 361005 等)
   - リーチ: `taiko` / `suspense`
   - 確定インパクト: `impact` / `metal hit`
2. **同梱の設計判断**: 今回は「全員に配布」が目的なので、D:\download経由の個人ローカル(install-local-sounds.mjs・非同梱)ではなく、**Pixabay音だけ拡張リポジトリに実ファイル同梱**(extension/sound/ 等へコミットしWeb Store配布に載せる)へ方針転換が要る。customSoundPreset/customSoundStore の「非同梱・ローカルのみ」前提を見直す。**着手前にユーザーへ「Pixabay音をリポジトリ同梱=全員配布」でよいか一言確認推奨**。Audiostock音は絶対に同梱しない。
3. **診断ページで全部鳴らせるUI**: status.html に既存の「🔊効果音試聴」パネル+「🎛️マイ効果音」タブ(status-entry.js)。ここを拡張して「同梱Pixabay音を全キー一覧で▶試聴」できる面を作る。
4. customSoundPreset の割当を Pixabay No. へ差し替え(Audiostock No.と別枠・v0.1.1079のd1DownloadedNos方式踏襲)。実装は sonnetサブエージェント委任がコスパ良(**再委任禁止・自分で実装せよと明記**。過去に委任先が再委任して止まる事故複数回)。

## ライセンス運用の鉄則(絶対)
- **Audiostock音は拡張に同梱しない**。同梱は Pixabay/CC0 のみ。
- Pixabay音は帰属不要だが採用URL/No.一覧をリポジトリに記録。CC-BY音源(Freesound一部・帰属必須)を混ぜるなら CREDITS.md 同梱が必須=Pixabay/CC0で揃えれば不要。

## リリース工程の鉄則(この2日の事故から)
- git add は新規ファイル明示列挙(status|grep -v '^??' フィルタ禁止=コミット漏れ→Vercel全滅の実績)。tracked-imports検査があるが add時点で防ぐ。
- 配信視聴中の copy:ext 禁止(版混在→送信不可)。パッチは溜めて copy:ext 1回+ユーザーの拡張リロードとセット。混在バナー(v0.1.1082)が出たら即リロード。
- サブエージェントには毎回「新規ファイルは git add まで/commit・push・copy:ext は司令塔/バージョンは着手時のpackage.json現在値+1/再委任禁止・自分で実装/typedef内コメント継続行禁止(typecheck地雷)」を明記。
- bump 3点(manifest/package/changelog)同期・verify:cc 全9ステップ緑・反映3手順併記。

## 積み残し(優先度低)
- 採点機能(SC1-SC3・v0.1.1098-1100)は拡張内に組み込み済み・popup「配信採点(カラオケ採点風)」折りたたみパネル内「▶発表を再生」ボタン。動くが**ユーザーが望んだ体験とズレて一旦保留**。採点音10本(Audiostock)はD:\downloadにあるが同梱不可=全員配布するならPixabay差し替えが要る。
- 他保留: 読み上げplaybackRateキャッチアップ(合成2.7秒が主犯・voice-tempo-realtime-SYNTHESIS)/ AV同期V1(avCue WIP・pachinko-av-max-SYNTHESIS)/ MV文字演出設計(pachinko-mv-typo-SYNTHESIS)。

## ユーザーの状態(配慮)
- 「Audiostockに投資したのに配布できないと分かって破産かと落胆」→ Pixabayで追加費用ゼロ・全員配布可の道を示し納得しかけ。**しょぼい音になるのを恐れている**ので、Pixabayの迫力ある候補を実際に聴かせて安心させながら進める。個人配信では今の実物音源が使えること(投資は無駄でない)を繰り返し伝える。実装セッションは同時1つ(並行で固まる・版衝突の実績)。
