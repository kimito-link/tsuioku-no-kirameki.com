# 最高の操作音システム(パチンコ/スロット参加感でコメント促進) — 設計書(SYNTHESIS)

- 日付: 2026-07-05
- 入力: council/operation-sound-question.txt(お題+地雷マップ) / operation-sound-answers.json(会議素材・裁定は§8) / council/pachinko-ultimate-SYNTHESIS.md(視聴イベント音の正本・Phase A〜C 実装済み) / src/lib/effectSoundPlayer.js / src/lib/effectDirector.js / src/lib/selfActionCelebration.js / src/lib/selfPostedMatcher.js / src/lib/ownPostedUserIdSet.js / src/extension/popup-entry.js / src/extension/venueBar.js / src/extension/content-entry.js(いずれも読むだけ・コード変更なし)
- 位置づけ: **設計のみ。コード変更は一切していない。実装は次チャット(§6の手順書に従う)**。
- 前提の更新(裏取り済みの事実):
  - pachinko-ultimate の Phase A(マイ効果音差し替え)だけでなく **Phase B(ボイス v0.1.1073)・Phase C(BGM+相対閾値 v0.1.1074)も実装済み**(changelog.js 先頭で確認)。よって「操作音は B/C とどちらが先か」の順序問題は消滅しており、操作音は **Phase D** として即設計・即着手できる。
  - **拡張は自前のコメント投稿UIを既に持つ**: popup の `postCommentBtn` / Enter送信トグル(`commentEnterSend`) / 音声コメント自動送信(`voiceAutoSend`) → `requestPostCommentToOpenTab(text, watchUrl)` → content script の `postCommentFromContentAsync`(content-entry.js:7848)が公式コメント欄へ送信し `{ok:boolean}` を返す。**成功時は既に `buildSelfCommentCelebrationSpec`(視覚祝福)が発火している**(popup-entry.js:19398-19404)。操作音はこの実在の決定論フックに乗る。
  - 自己投稿の突合インフラも既存: `selfPostedRecents`(送信履歴キュー)⇔保存コメントの1対1照合(`selfPostedMatcher.js`)、own-posted userId 集合(`ownPostedUserIdSet.js`)。
  - **Audiostock の追加購入は凍結中**(MEMORY: sound-pachinko-handoff-2026-07-04。定額の追加DLも当面停止・Freesound CC0 が現在の調達先)。§5 の買い物リストはこの制約下で書く。

## 0. 結論(1段落)

「コメント投稿=玉の打ち出し」の核は、ニコ生ページのDOMを新たにフックせずに作れる。**本命の検知点は拡張自身の投稿経路(`postCommentBtn`/Enter/音声送信 → `result.ok`)であり、自分のコードのボタンと自分のコードの戻り値だけを真実源にするため、ページ構造変更に対する新規の脆弱面がゼロ**(§2)。音は「押下=ハンドル接触音(80ms・小)」→「送信成功=玉の打ち出し音(≤400ms)」の二段で、**成功しなかったら打ち出し音は鳴らない=音が嘘をつかない**(実機でも打ち損じは無音)。促進の決定論は「その配信での自分の投稿成功数 n で打ち出し音が4段階に育つ(置換)+60秒窓の連続投稿コンボで一時昇格(既存 `directHit` に ladder と windowMs を注入するだけ)+n の節目(5/10/25/50/100)で払い出し音1本に置換」(§3)。操作音は全キー `op_` プレフィックスの**新設キーとして視聴イベント音と完全分離**し、既存85音源の同一No.を複数キーから参照して仮当て(重複購入ゼロ)、打ち出し系の本命素材のみ Freesound CC0 で新規調達する(§5)。優先度は既存P1〜P6に「自己応答レーン(op_handle/op_shot だけは常時通す)」と「P4.5(その他op_*・P1〜P3実行中は破棄)」を挿入(§4)。effectSoundPlayer.js は今回も無改変・deps注入のみ。

---

## 1. 操作×音マッピング表

### 1.1 実在確認済みの操作(grep で実在を確認した接点のみ)

popup(popup-entry.js): `postCommentBtn`(コメント送信)・`commentEnterSend`(Enter送信)・`voiceCommentBtn`/`voiceAutoSend`(音声コメント)・`recordToggle`(記録)・`exportJson`・コピー系(AI診断コピー等)・フレームチップ(タブ切替)・公開ボタン。
会場(venueBar.js): 会場モードトグル(1694)・閉じる(1709)・出演者一覧 `rosterBtn`(1778)・診断 `diagBtn`(1786)・コメビュ `comeviewBtn`(1792)・読み上げ `voiceBtn`(1806/2055)・別窓 `venueWindowBtn`(1820)・席クリック(seatsHost 1896-1922)。

### 1.2 マッピング表(キーは全て新設 `op_*`・視聴イベントキーと不共有)

| 操作 | 新キー | パチンコ比喩 | 音の性格 | 長さ | 音量 | ガード |
|---|---|---|---|---|---|---|
| コメント送信ボタン押下/Enter(送信開始) | `op_handle` | ハンドルに触れた | ごく小さな接触クリック | ≤80ms | 0.35 | 250ms |
| コメント送信成功(`result.ok`) | `op_shot_1`〜`op_shot_4` | **玉の打ち出し**(§3で育つ) | バネ/発射メカ音 | ≤400ms | 0.6 | ファミリー600ms |
| 自分の投稿数節目(n=5/10/25/50/100) | `op_self_milestone` | 払い出し(小) | コインが1〜2枚落ちる | ≤600ms | 0.6 | 節目のみ=実質無 |
| 読み上げON / 記録ON 等のトグルON | `op_toggle_on` | コイン投入 | チャリン(上向き) | ≤250ms | 0.5 | 250ms |
| 読み上げOFF / トグルOFF | `op_toggle_off` | コイン返却レバー | コトッ(下向き・地味) | ≤200ms | 0.4 | 250ms |
| パネル開(会場・出演者・診断・コメビュ・別窓) | `op_panel_open` | 台の扉を開ける | ピコン(既存hold_lamp系) | ≤200ms | 0.5 | 250ms |
| パネル閉 | `op_panel_close` | 扉を閉める | 逆向きピコ | ≤200ms | 0.4 | 250ms |
| 席クリック(会場) | `op_seat` | 玉がポケットに入る | 軽いカコン | ≤200ms | 0.5 | 250ms |
| コピー成功 | `op_copy` | コイン1枚獲得 | チン(既存獲得音系) | ≤300ms | 0.5 | 600ms |
| 公開ボタン成功 | `op_publish` | レジ精算 | ガチャン(既存レジ系) | ≤500ms | 0.5 | 600ms |
| タブ/フレーム切替 | (音なし) | — | — | — | — | — |

設計判断:
- **タブ切替は無音**。会議素材(gpt-oss)の「タブ切替=コイン投入は概念が合わず不自然」批判を採用。頻度も高く、鳴らすと最初にうるさい操作になる。
- **失敗にネガ音は付けない**。送信失敗・コピー失敗は既存のエラーバナー/文言だけ。op_handle で「触った」音は鳴っているので、打ち出し音が続かない=失敗、が音として自然に伝わる(偽の解決音を鳴らさない原則の裏面)。
- **「コメント投稿=玉の打ち出し」の核**は二段構成: 押下の op_handle は「操作を受け付けた」という事実、op_shot は「送信が成功した」という事実。どちらも嘘をつかない。押下→ok は fastSubmit 経路で概ね数百ms なので、体感は「ハンドルを握る→玉が飛ぶ」の実機の間合いに近い(会議素材の「非同期遅延で期待外れ感」批判への構造的回答=遅延を隠すのではなく二段の物語にする)。
- 操作音がリーチや大当たり等の**演出フェーズを起こすことは絶対にない**(§7)。操作音は自分への応答であり、台の期待演出は視聴イベント(みんなの盛り上がり)だけが起こす。この分離が「自分が打つ→場が沸く→台が光る」の因果を守る。

---

## 2. 自分のコメント投稿の検知設計(頑健性順・裁定つき)

| 案 | 方法 | 頑健性 | 即時性 | カバー範囲 | 裁定 |
|---|---|---|---|---|---|
| **案1(本命)** | 拡張内投稿経路: `postCommentBtn`/Enter/音声送信 → `requestPostCommentToOpenTab` → `result.ok`(popup-entry.js 19390付近) | **S**(自分のボタン+自分の戻り値。ページDOM変更の新規影響ゼロ) | ◎(押下は即時・okは数百ms) | 拡張から投稿した分のみ | **採用・Phase D1** |
| **案2(補完)** | NDGR観測との突合: `selfPostedMatcher`(送信履歴⇔保存entryの1対1照合)/ `ownPostedUserIdSet` / 生ID視聴者は自分uid一致 | **A**(DOMでなくコメントストリーム由来。構造変更に強い) | △(数百ms〜数秒遅延) | ページ直打ち分も拾える(生ID時) | **着弾音のみ採用・Phase D3(任意)**。遅延があるので「打ち出し」ではなく「ステージに乗った」音(op_self_milestone系の静かな1音)に限定 |
| 案3 | ニコ生ページの入力欄/送信ボタンへ新規DOMフック(keydown/click/MutationObserver) | **C**(SPA再構築・クラス名変更で壊れる。会議素材gpt-ossの批判どおり) | ◎ | ページ直打ち分 | **却下**。音のためだけに新しい破損面を作らない |
| 案4 | fetch/XHR/webRequestフックで送信POSTを捕捉(gpt-oss代替案) | C(MV3のworld隔離・ニコ生のコメント送信は単純POSTと限らない・メンテ過大) | ○ | ページ直打ち分 | **却下** |

裁定の核心: **「検知の頑健性」問題は、検知をページに求めるから生じる。この拡張は投稿機能そのものを自前で持っているので、検知点を自陣(popupのボタンと result.ok)に置けば問題自体が消える**。既存の `postCommentFromContentAsync` がDOM依存(入力欄/送信ボタン探索)を持つのは事実だが、それは送信機能の必要悪であり既にフォールバック文言・確認プローブ(T2〜T5)で運用実績がある。音はその成否の結果だけを消費するので、**操作音の追加によって増えるDOM依存はゼロ**。ページ直打ち派のカバー(案2)は Phase D3 に分離し、コア価値(拡張から打つ人の参加感)を先に出す。

補足: 184(匿名)投稿は NDGR 観測後 `a:HASH` になるが、案1は観測前の送信時点で検知するので匿名/生IDに関係なく効く(6678/6727行の既存コメントで確認済みの挙動と同じ土台)。

---

## 3. コメント促進の決定論設計 —「打つほど育つ」

乱数ゼロ。全て「この配信での自分の投稿成功数 n」と「時刻」の純関数。

### 3.1 打ち出し音の育成4段(基準段・置換)

n = この liveId で `result.ok` になった自分の投稿数(popupセッション内カウント+`selfPostedRecents` から liveId 一致分を復元。liveId 切替でリセット)。

| n | 基準キー | 音の性格(素材選定基準) |
|---|---|---|
| 1〜4 | `op_shot_1` | 軽い単発ポン(入門ハンドル) |
| 5〜14 | `op_shot_2` | バネの効いたレバー(手応え) |
| 15〜29 | `op_shot_3` | 重厚メカ(玄人ハンドル) |
| 30+ | `op_shot_4` | きらびやかな確変ハンドル(カキーン系) |

- 「今日は自分の台が育っている」を音だけで感じる。リロードしても `selfPostedRecents`(TTL 24h)から n を復元できるので、**育ちは配信中ずっと保持される**(決定論・巻き戻りなし)。
- 純関数 `shotKindForSelfPostCount(n)` 1つに固定(境界 4/5・14/15・29/30 をテストで固定)。

### 3.2 連続投稿コンボ(一時昇格・既存 directHit の流用)

- `directHit(prev, baseKind, nowMs, { ladder: OP_SHOT_LADDER, windowMs: 60_000 })` をそのまま使う(effectDirector.js は無改変。ladder と windowMs は引数注入可能なことをコードで確認済み)。
- OP_SHOT_LADDER = ['op_shot_1','op_shot_2','op_shot_3','op_shot_4']。60秒以内の連続投稿で基準段から+1段/発(上限4段)。**置換のみ・積み増しなし**(directHit の設計原則そのまま)。
- 窓を視聴イベントの30秒でなく60秒にする理由: ニコ生のコメント間隔は会話の往復で30秒を超えやすい。「会話を続けている」単位で繋がる窓にする。
- コンボが切れたら基準段(n由来)に静かに戻る(降格音なし=ガセリーチと同じ思想)。

### 3.3 自分の節目(払い出し)

- n が 5/10/25/50/100 に**到達したその1発だけ**、op_shot_n の代わりに `op_self_milestone`(コイン払い出し小)を**置換**で鳴らす(2本鳴らさない)。
- 視覚は既存の `buildSelfCommentCelebrationSpec`(dropCount 6 の祝福)が既に鳴っているので新設しない。節目発だけ dropCount を増やす等の視覚強化は本設計のスコープ外(音の設計書)としつつ、フックは同じ場所なので将来1行で足せる。

### 3.4 心理設計の要点(なぜこれで促進されるか)

- **即時**: 押下80ms以内に op_handle(自分の操作は必ず即応答される)。
- **成長**: n による段階は不可逆(配信中)。「もう5件打てば音が変わる」という短い到達目標が常に1つ見えている状態を作る(節目 5/10/25/50/100 も同じ)。
- **社会性との両立**(会議素材 qwen3-32b の「ゲーム誤認で発信意欲を阻害する」批判への回答): 打ち出し音は送信成功の**確認音を兼ねる**(機能音)。派手にせず≤400ms・音量0.6で「道具の手応え」に留め、祭り(リーチ/大当たり)は必ず場全体の盛り上がり(視聴イベント)が起こす。自分の操作音が台を光らせない=「コメントは場への発信であり、場が沸けば台が沸く」という正しい因果だけを残す。

---

## 4. 音響原則と歯止め

### 4.1 具体値

| 項目 | 値 | 根拠 |
|---|---|---|
| 操作音の長さ | ≤250ms(op_shot のみ ≤400ms、op_self_milestone ≤600ms) | 配信音声・読み上げへの時間占有を最小化(帯域分離でなく時間分離。EQ等の加工は禁止事項) |
| 既定音量 | op_handle 0.35 / op_toggle_off・op_panel_close 0.4 / 他 op_* 0.5 / op_shot 0.6 | 視聴イベント音(gift系1.0・他0.7)より必ず小さく。`defaultVolumeForEffectSoundKind` は無改変、呼び出し側 deps.volume で渡す |
| 音量上限 | assignments.gain 込みで 0.8 にクランプ | 操作音が配信音声を超えない絶対線 |
| 同種ガード | op_shot ファミリー共通 600ms / op_copy・op_publish 600ms / その他 op_* 250ms | 連打の心地よさ(250)と重要音の重なり防止(600)の使い分け。op_shot は昇格でキーが変わってもガードが効くよう**ファミリー共通の直近再生時刻**を opSoundDirector 側で持つ(playerのキー別ガードだけに頼らない) |
| 操作音ファミリー全体 | 最短間隔 200ms(全 op_* 横断) | 複数ボタン連打でも1秒3発が上限=絶対にうるさくならない天井 |
| 素材の帯域選定 | 中高域(2〜6kHz)中心の短いクリック/メカ音を選ぶ | VOICEVOX・配信音声の主帯域(〜4kHz)とのマスキングを素材選定で回避(加工はしない) |

### 4.2 優先度統合表(pachinko-ultimate §4.3 の P1〜P6 に操作音層を挿入)

| レーン | 内容 | 操作音との関係 |
|---|---|---|
| (別レーン) VOICEVOX読み上げ | 情報チャネル・常時通す | 操作音は≤400msなので**発話中も通す**(ボイスvoice_*と違い文脈性がなく、スキップすると「操作を無視された」感になる) |
| **(別レーン・新設) 自己応答レーン: op_handle / op_shot** | 自分のジェスチャへの応答 | **P1実行中でも鳴らす**(voice_jackpot と同格の唯一例外思想: 自分の操作への応答は必ず返す。≤400ms・0.6以下なので祭りを壊さない) |
| P1 大当たりチェーン | jackpot/mega SE→voice_jackpot→payout | 実行中、下記P4.5以下の操作音は**破棄**(遅延再生はしない) |
| P2 ボイス(voice_*) | 置換/破棄は既存どおり | 操作音はボイスを止めない・止められない(レーン分離) |
| P3 突破/リーチSE | 既存どおり | 同上 |
| P4 通常SE(gift/milestone/rank/ad) | 既存どおり600msガード | 操作音とはキーが完全別なのでガード非干渉 |
| **P4.5(新設) その他の操作音**(op_toggle/panel/seat/copy/publish/self_milestone) | ユーザー操作起点 | P1〜P3実行中は破棄。P4とは同時になりうるが操作音は≤250ms・0.5以下なので許容(積み増しでなく別事象の同時) |
| P5 hold_lamp | 既存どおり | — |
| P6 BGM | 最下位・ダック既存どおり | 操作音でのダックはしない(短すぎて不要) |

- 二重再生ガード(会場プレゼンス)は操作音には**適用しない**: 操作音は「操作が起きたコンテキスト」でだけ鳴る(popupのボタンはpopupで、会場の席クリックは会場で)。同一イベントを両コンテキストが検知する視聴イベントと違い、二重発火が構造的に起きない。
- マスタートグル: 「操作音」ON/OFF を popup 設定+診断ページに新設(既定ON。操作音はユーザー自身のジェスチャ起点で autoplay 制約もなく、確認音を兼ねるため既定ONが妥当。うるさければ1タップでOFF)。

---

## 5. 追加DL買い物リスト(凍結制約つき)

**大前提: Audiostock の追加DLは凍結中**(MEMORY 2026-07-04: 定額含め購入・追加DL凍結、当面の調達先は Freesound CC0)。したがって本章は3層構成: (a) 既存85本からの流用(No.明記・追加調達ゼロ)、(b) 当面の新規調達=Freesound CC0 検索キーワード、(c) 凍結解禁時の Audiostock 検索キーワード(将来のための記録)。

### 5.1 既存85本からの流用(同一No.を複数キーから参照=IndexedDB assignments は同じ blob id を別キーに割り当て可能。重複購入ゼロ)

| 操作キー | 流用No. | 元の割当キー | 備考 |
|---|---|---|---|
| op_panel_open | 141839(タッチ,クリック音 ピコン) | hold_lamp 変奏1 | そのまま |
| op_panel_close | 224302(ピコン タップ・通知音) | hold_lamp 変奏2 | 音量0.4で「閉じ」感 |
| op_seat | 476302(ピコーン 診断・ボタン音) | hold_lamp 変奏3 | そのまま |
| op_toggle_on | 141689(コインやアイテムなどの獲得音.02) | gift_small 変奏1 | コイン投入の代用 |
| op_toggle_off | 224302(ピコン)を低音量0.4で | hold_lamp 変奏2 | 専用素材が来たら差し替え |
| op_copy | 134475(コイン、アイテム獲得 かわいいシンセ) | gift_small 変奏3 | コイン1枚 |
| op_publish | 104491(レジスターの清算音 昭和レジスター) | ad 変奏1 | レジ=世に出す |
| op_self_milestone | 371385(特殊シンボル払い出し音) | payout 変奏7 | 払い出し小 |
| op_shot_4 | 970774(カキーン スロット確定音) | breakthrough 変奏6 | 確変ハンドルの仮当て |

※ キーが別なので600msガード・変奏ローテーションは視聴イベント側と完全独立。同じ音が別文脈で鳴っても「同じ台の同じ部品の音」として自然。

### 5.2 当面の新規調達(Freesound CC0・検索キーワードと必要本数)

打ち出し系(核)は既存85本に該当素材が無いため、ここだけ新規調達が必須:

| 用途 | Freesound 検索キーワード(license: Creative Commons 0 でフィルタ) | 必要本数 |
|---|---|---|
| op_shot_1(軽い単発) | `pinball plunger` / `ball launch spring` | 1〜2 |
| op_shot_2(バネレバー) | `pinball launcher` / `spring release mechanical` | 1〜2 |
| op_shot_3(重厚メカ) | `slot machine lever pull` / `one armed bandit` | 1〜2 |
| op_handle(接触) | `mechanical button click short` / `arcade button` | 1〜2 |
| op_toggle_on 専用(コイン投入) | `coin insert slot machine` / `coin slot` | 1 |
| op_toggle_off 専用(返却) | `coin return` / `switch off click` | 1 |
| (将来)リール始動 | `slot machine reel spin start` | 1 |

計 7〜11本・全て≤600msの短尺を選ぶ(長い素材のトリムはしない=加工禁止の系譜。最初から短いものだけ拾う)。取り込みは既存のマイ効果音UI(Phase A実装済み)にファイルを追加選択するだけ。ファイル名は `freesound_<id>.mp3` 形式にし、customSoundPreset の op_* プリセットには**含めない**(プリセットは既存85本のNo.のみ。CC0分は手動割り当て=出所の混在をプリセットに持ち込まない)。

### 5.3 凍結解禁時の Audiostock 検索キーワード(記録のみ・今は買わない)

「パチンコ 玉 発射」「パチンコ ハンドル」「スロット レバー」「メダル 投入」「コイン 投入音」「リール 回転 開始」「スロット ストップボタン」— 各2本目安・計10〜14本。解禁の判断はユーザー(勝手に購入着手しない)。

---

## 6. 実装フェーズと手順書(1変更=1patch・AGENTS.md §12.5厳守)

順序の裁定: pachinko-ultimate の Phase B/C は**実装済み**(v0.1.1073/1074)なので順序衝突なし。ただし sound-pachinko-handoff の**未push分の実機試聴が先**(既存音の当否確認が操作音の音量バランスの前提)。その後に Phase D を開始する。

### Phase D1: 操作音コア(popup投稿経路+育成ladder)

- 触るファイル:
  - 新 `src/lib/opSoundDirector.js`: 純関数のみ — `shotKindForSelfPostCount(n)` / `OP_SHOT_LADDER` / `opSoundGate(state, key, nowMs)`(ファミリー600ms・全体200ms・P1中破棄判定) / `opSelfMilestoneFor(n)`(5/10/25/50/100判定)。DOM・storage・再生に触れない(effectDirector.js と同じ流儀)。
  - `src/lib/customSoundPreset.js`: op_* キーに §5.1 の既存No.を追記(プリセット全数テストの期待値も更新)。
  - `src/extension/popup-entry.js`: (a) 投稿ボタン押下点に op_handle、(b) `result.ok` 分岐(19395付近・既存celebration発火の隣)に n カウント+directHit+playEffectSound(op_shot_*)、(c) トグル/コピー/公開の各ハンドラに1行ずつ、(d) 操作音マスタートグル(設定)。
  - `effectSoundPlayer.js` は**無改変**(deps.volume / variantPaths / getUrl / rng 注入のみ。rng は既存の順繰りローテーション注入をそのまま使う)。
- テスト: shotKindForSelfPostCount の境界(4/5・14/15・29/30)/ directHit(OP_SHOT_LADDER, 60秒窓)の昇格・窓切れ / opSoundGate の決定論(同履歴→同判定・ファミリーガード・200ms天井)/ プリセット op_* の No. が85本表に実在すること。
- bump: patch 1つ。summary例 `feat(sound): コメント投稿の打ち出し操作音を追加`(35字以内を `npm run verify:bump` で確認)。manifest/package/CHANGELOG 同期。
- 検証: `npm run verify:cc` → `npm run copy:ext` → **pull→拡張リロード→watchタブF5**(3手順) → 拡張からコメント送信→押下音+成功音が二段で鳴る/失敗時(watchタブ無し等)は押下音のみ/5件目で音が変わる、を確認。状態速報の opSound 計器(fired/guarded/family別件数・現在の n と段)は **extras(12秒間引き)側に**追加(コアreadに足さない=既知の地雷)。切り分けは状態速報コピペで行う(実機目視の往復はしない)。

### Phase D2: 会場側の操作音

- 触るファイル: `src/extension/venueBar.js` — 会場モードトグル/閉じる(op_panel_open/close)・rosterBtn・diagBtn・comeviewBtn(op_panel_open)・voiceBtn(op_toggle_on/off)・席クリック(op_seat)。各1行の playEffectSound 呼び出し+deps(会場は既にPhase Aの注入器 `buildEffectSoundDeps` を持つのでそれを使う)。
- テスト: 配線はスモーク(既存の venueBar テスト方針に従う)。ゲート純関数は D1 のテストで担保済み。
- bump: patch 1つ。summary例 `feat(sound): 会場の開閉・席・読み上げに操作音`。
- 検証: 3手順 → 会場を開閉・席クリック・読み上げトグルで各音。状態速報 extras の opSound 計器で件数確認。

### Phase D3(任意・後回し可): ページ直打ちコメントの着弾音

- 触るファイル: popup-entry.js の selfPostedMatcher 突合結果を消費している箇所に「新規に self 確定した entry があれば op_self_milestone 系の静かな1音」(遅延があるため打ち出し音は鳴らさない)。n カウントへの合算もここで行う(拡張発+直打ちの合計が「自分の台の育ち」になる)。
- 判断基準: D1/D2 の実機フィードバックで「直打ち派にも欲しい」となってから着手。ならなければ永久にやらない(YAGNI)。
- bump: patch 1つ。

### 全Phase共通

- verify:cc が tree-map/site-health/feature-map ドリフトで落ちたら再生成後に再実行(既知)。
- push後の報告には必ず反映3手順(pull→拡張リロード→watchタブF5)を併記。
- 音量・ガード値の調整は実試聴フィードバック後に都度別patch。

---

## 7. 却下事項(絶対制約の再確認)

| 却下事項 | 状態 | 本設計での担保 |
|---|---|---|
| 乱数・確率演出 | **禁止** | 育成段=n の純関数・コンボ=directHit(決定論)・変奏=順繰りローテーション注入。操作音系に乱数は1箇所もない |
| 音の積み増し | **禁止** | 育成・コンボ・節目すべて**置換**(op_shot の代わりに op_self_milestone、等)。押下→成功の二段は「別事象への各1本」であり同一事象の重ねがけではない。ファミリーガード600ms+全体200ms天井 |
| 音源のリポジトリ/ストア同梱 | **禁止** | op_* も IndexedDB(Phase A実装済み)のみ。リポジトリに入るのは customSoundPreset への No.→キー追記(メタデータ)だけ。未割り当てキーは `no-path` で無音=安全側 |
| Audiostock 追加購入・追加DL | **凍結中** | §5 は既存85本の流用(同一No.複数キー参照)+Freesound CC0 のみで成立。Audiostock キーワードは解禁時の記録に留め、購入判断はユーザー |
| ニコ生ページDOMへの新規フック | **禁止(本設計の裁定)** | 検知は拡張自身の投稿経路(案1)と NDGR 突合(案2)のみ。入力欄 keydown・送信ボタン click・MutationObserver・fetch フックは全て却下(§2) |
| 操作音による演出フェーズ起動 | **禁止** | op_* は phaseDirector/voiceDirector に一切入力しない。リーチ/大当たりは場の盛り上がりだけが起こす(嘘の期待の禁止) |
| 失敗時のネガティブ音 | **禁止** | 送信失敗・コピー失敗は無音+既存バナー。打ち損じは無音(実機と同じ) |
| キー入力(タイピング)毎の音 | **却下** | llama案の「入力完了にレバー音」はタイピング妨害+コメント内容への監視感。音は送信ボタン押下から |
| ブラウザ内での素材加工(トリム/EQ) | **禁止(既決)** | 帯域衝突は素材選定(中高域・短尺)で解く。gain のみ |

---

## 8. 会議素材(operation-sound-answers.json)の裁定

- **gpt-oss-120b「操作と音の因果が曖昧・非同期遅延で期待外れ感」→ 骨格採用**。「入力完了=レバー、送信成功=玉発射」の二段案を「押下=op_handle、成功=op_shot」に修正して採用(入力完了=keydownは却下。§7)。
- **gpt-oss-120b「DOMフックはSPA再構築で即死・MutationObserver+fetchフックを」→ 批判は採用、対策は不採用**。本設計の回答は「新規フックそのものを不要にする」(§2 案1)。MutationObserver 常駐や fetch フックは音のためには過剰でメンテ地雷。
- **gpt-oss-120b「LUFS基準で0.12は聞こえない」→ 数値の前提が誤り(0.12はBGM専用値)だが趣旨は採用**。操作音は 0.35〜0.6 の別レンジで設計し、上限0.8クランプ(§4.1)。
- **qwen3-32b「コメント=ゲーム誤認で発信意欲を阻害」→ 部分採用**。操作音を確認音兼用の「道具の手応え」に留め、祭りは場のイベントだけが起こす分離で回答(§3.4・§7)。
- **qwen3-32b「連打で音量累積・帯域競合はEQで」→ 前半採用(ファミリーガード+200ms天井)、後半は手段変更**(加工禁止のため素材選定と時間分離で解く。pachinko-ultimate §8 と同じ裁定)。
- **qwen3.6-27b「決定論の段階進行(状態で音が育つ)」→ 採用**。§3 の核。「Cabinet metaphor(扉/席/ノブの物理マッピング)」も §1.2 の比喩列に反映。
- **llama-3.3-70b「入力完了にレバー音・ガード200/400/100ms」→ 大半棄却**。keydown音は却下(§7)。ガードは 250/600 の2値に整理(3値は複雑さに見合わない)。
- **groq/compound: HTTP 413 で回答なし** — 素材ゼロのため裁定対象外。
