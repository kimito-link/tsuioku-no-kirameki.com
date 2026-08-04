# お題: コメントは大量に取れるのに会場/レーンに人が出ない(NDGRチャット欠落でuserIdが付かない)

## ユーザーの言葉
「コメントが多いのにレーンが出ない。**匿名でも元々レーン出てたのに**(=以前は出ていた・退化)。
せっかく作ったマインドマップ(機能マップ)は使っているのか?」

## 司令塔が機能マップ→実コード→実機診断で裏取りした真因(確定)

### ① 機能マップで storage 断線でないことを確認(ユーザー指摘どおり機能マップを使った)
- `npm run feature-map` 再生成。storage-bus.md で lane 関連キー
  (KEY_USER_COMMENT_PROFILE_CACHE / KEY_LIVE_BROADCASTER_CTX)は producer/consumer 両方そろう
  =【storage 経路の断線ではない】。データが届く配管は正常 → 上流(データthat 生成されるか)を疑う。

### ② レーンは userId が無いと作れない(実コード)
- userLaneCandidatesFromStorage.js:117-118 `const uid=...; if(!uid) continue;`
  = **userId が無いコメントはレーン候補に【一切ならない】**。レーンは userId 単位で集約する設計。
- つまりレーンに人が出る条件 = コメントに userId が付いていること。

### ③ 実機診断: NDGR チャット経路がほぼ死んで DOM 観測に落ちている(全配信で再現)
- 複数配信すべてで:
  - `commentIngestBySource`: visible(DOM観測)=780〜1968 / **ndgr(生データ)=1** / mutation=15〜27
  - `ndgrWireCounters`: **chats:1 / decoded:197 / stats:10** = NDGR を 197 メッセージ復号しているのに
    【チャットは1件だけ】。残りは stats/segment 等の非チャット。
  - `ndgrLastReceivedAgo: 35955`(チャット最終受信 36秒前) なのに DOM では秒単位で大量に流れている。
  - `savedCommentsUidStats: withUid 1 / withoutUid 12`(7.7%) = 保存コメントのほぼ全部が userId 無し。
  - `interceptFetchLog` には `/api/view/v4/...`・`/data/segment/v4/...`・`/data/backward/...` が並ぶ
    = プレイヤーは NDGR を fetch していて intercept も復号している(decoded:197)。だが【chat だけ来ない】。
- = **プレイヤーの NDGR ストリームは intercept できているが、その中に chat(=userId 付きコメント)が
  ほぼ含まれず、コメントは DOM(userId 無し)でしか拾えない → レーンに乗せる userId が無い → レーン空。**
- 記録自体は visible(DOM)で取れるので件数は健全(取得率97-101%)。問題はレーン/会場/アバターだけ。

### なぜ「以前は出ていた」のに今出ないか(退化の方向)
- 以前は NDGR chat 経路が生きていて userId 付きコメントが流れ、匿名でも NDGR の userId でレーンに乗った。
- 今は NDGR chat がほぼ来ない(decoded 197 中 chat 1)。原因候補:
  (a) ニコ生側の NDGR プロトコル/メッセージ形式が変わり、chat の判定/デコードが取りこぼしている
      (ndgrUnknownSamples に msg:2/msg:3 の未知メッセージが多数=新形式の chat を chat と認識できていない?)
  (b) intercept のフックがプレイヤーの新しい fetch 経路(view v4 token 切替等)を一部取り逃している
  (c) 長時間/多タブで NDGR long-poll が間引き/再接続待ちになり chat だけ薄くなる

## このプロジェクトの制約(必ず守る)
- Windows + PowerShell。`npm run verify:cc`。1変更=patch1つ・changelog35字。
- 純ロジックは src/lib(ndgrDecode.js 等)に切り出して単体テスト。
- 記録(コメント本体)は visible/DOM でも取れているので【記録は壊さない】。レーン/会場/アバターの
  userId 経路だけを直す。
- ndgrUnknownSamples(msg:2=byte12 の {1,2} / msg:3=byte8 の {1} / msg:24=gift)は実機の生バイト。
  これが新しい chat 形式なら、デコーダがそれを chat として拾えるようにするのが本筋。

## 会議への質問(役割分担 + 結論→根拠→反論→具体案 の4ブロックで)
役割: 総合役=設計整合と退行防止 / 発散役=別の切り口 / 批判役=各案の穴を最低1つ /
実装役=具体的なファイル(ndgrDecode.js / page-intercept-entry.js / content-entry.js)・関数・
ndgr メッセージ tag 番号・テスト名・実バイト hex まで。

### Q1: chats:1 / decoded:197 の乖離の真因はどこか(デコード取りこぼし vs 受信欠落)
- decoded:197 なのに chats:1 = NDGR メッセージは届いて復号できているが「chat 判定」で落ちている可能性が高い。
  ndgrUnknownSamples の msg:2(byte12)/msg:3(byte8) は何か? 新しい chat 形式 or 別種(統計/座席)か。
  実バイト hex(089cbfc7... 等)から protobuf フィールド構造を推定し、chat なら拾えるようにできるか。
- それとも本当に chat が wire に来ていない(受信欠落=intercept がプレイヤーの chat fetch を取り逃し)か。
  両者を診断のどの値で切り分けるか(decoded の内訳・msg tag histogram)。

### Q2: レーンを「userId が無い DOM コメントでも出せる」ようにすべきか(別の根治)
- NDGR chat 復活が本筋だが、もし NDGR 形式変更が真因だと修正に時間がかかる。
  暫定で「DOM コメントの匿名行も、安定キー(184 のニックネーム/コメントハッシュ等)でレーンに出す」案は?
  ただし匿名は同一人物判定ができない=人数が水増しする罠。userLaneCandidatesFromStorage の
  `if(!uid) continue` を緩めるのは危険か。
- 「以前は出ていた」の再現には NDGR chat 復活が正道。DOM フォールバックは保険にとどめるべきか。

### Q3: 機能マップ(storage-bus)で今回の断線は出たか・出なかった理由
- 今回 lane キーは producer/consumer 両方そろい「断線なし」と出た=正しい(storage 経路は健全)。
- だが実害(レーン空)は在る。これは「storage の手前=データが生成される上流(NDGR chat)」の問題で、
  storage バス図の守備範囲外。機能マップに「ingest source 別カウント(ndgr vs visible)」や
  「userId 付与率」を組み込んで、この種の上流断線も図で気づけるようにすべきか(会議 Q4 の機械化)。

### Q4(批判役): 真因の切り分けが甘くないか
- chats:1/decoded:197 は「chat 形式変更で取りこぼし」と「単に今 chat が流れていない時間帯」を
  区別できているか。司令塔は実機で時間をおいて複数回 ndgrWireCounters を見て確定すべきでは。
- ndgrUnknownSamples が chat の新形式である確証は? 違ったら無駄足。どう確かめるか。

## 期待する最終成果(司令塔が統合・裏取り)
「コメントは取れるのにレーン/会場に人が出ない(userId が付かない)」を、NDGR chat 経路の真因
(デコード取りこぼし or 受信欠落)を1つに確定してから直す1案。MVP(レーンに人が戻る最短)と、
再発検知(機能マップに ingest source/userId 付与率を出す)を分けて。記録は壊さない。具体ファイル・
ndgr tag・実バイト・テスト名まで。会議はハルシネしうる=司令塔が ndgrDecode.js と実バイトで裏取りして収束。
