# 統合(司令塔・実コード裏取り済み): 匿名を会場/レーンに人として出す(第3)

> COUNCIL anon-venue-lane(2026-06-20)。会議=code分類・FAST(重ローカル→groqに差替でハング回避)・4/4成功。
> 元ログ=council/anon-venue-lane-log.txt / 生回答=council/anon-venue-lane-answers.json / お題=council/anon-venue-lane-question.txt
> 会議は素材。司令塔が Explore + 実コードで裏取りして1案に収束。関連=[[reference_comment_capture_anon_vs_named]]。

## 結論(検証ファースト + 司令塔が見つけた真の脱落点)

**第3は「新規実装」でも「検証して終わり」でもない。正しくは:**
1. **検証ファースト**(会議4/4一致): 第1(v0.1.836)開通後、まず実機で **NDGR由来の匿名**が席/レーンに出るか見る。下流(レーン候補/席/表示名/アバター)は v0.1.775〜803 で既に hashedUserId 対応済=出るはず。
2. 🔴 **司令塔が実コードで確定した真の脱落点=DOM観測経路の userId 補完が commentNo キー依存**。
   `interceptedUsers` マップは content-entry.js:2386 `if (!sNo) continue;` で**番号無し行をマップに入れない/引けない**。
   → **visible:10,364(DOM観測)の匿名は番号無しだと userId を一切もらえず人として出ない**。
   ndgr:275(NDGR経路)の匿名だけ hashedUserId を持つ(第1で救った)。**第3の本体はこの DOM観測経路の識別子欠落**。

## 根拠

- 実コード裏取り(Explore)で下流の匿名対応を確認済(全部 hashedUserId を人として扱える):
  レーン候補 userLaneCandidatesFromStorage.js:117(userId 非空で通す・数値性チェック無し)・
  席 venueSeats.js:97-111 venueParticipantKey(uid あれば u:${uid})・
  表示名 nicoAnonymousDisplay.js:51-59(a:始まりは「匿名」)・アバター anonymousIdenticon.js(hashedUserId→ゆっくり顔SVG)。
- 🔴 司令塔の決定的裏取り: DOM観測の userId 補完 interceptedUsers は **commentNo キー**(content-entry.js:2391 `get(sNo)`・
  :2386 `if (!sNo) continue;`)。匿名コメントは番号が無いことが多い=visible 行に userId が乗らない。
  実機 lv350789879 で visible:10,364 vs ndgr:275=**DOM観測が圧倒的多数**。だから「NDGR の匿名は出るが、
  DOM観測の匿名(大多数)は依然出ない」が実態。会議の言う「型変換の静かな沈黙」は、実体としては
  「commentNo キー前提のマップに番号無し匿名が入れない」構造。
- 過去できなかった真因の総括: 下流(席)は何度も整えた(v0.1.789/790/793)が、上流で匿名が①記録で捨てられ(第1で解決)
  ②DOM観測経路で識別子をもらえない(本第3で対処)。席は空くべくして空いていた。

## 反論・リスク(会議の鋭い指摘+司令塔の選別)

- ✅ 会議4/4「検証ファースト」採用。ただし**目視だけで終わらせない**(批判役 gpt-oss/発散 qwen3.5 一致)=
  「どこで落ちるか」を実機ログで特定してから直す。司令塔は既にコードで落下点(commentNo キー)を特定済=
  実機検証は「NDGR匿名が出ること」と「DOM匿名が出ないこと」の二点確認に絞れる。
- 🔴 **会議全員が見落とした点を司令塔が補足**: 会議は脱落点を「リンク/tier(下流の表示層)」と見たが、真の本体は
  もっと上流の「DOM観測の userId 補完(commentNo キー)」。リンク/tier は表示の枝葉(下記で放置/最小)。
- リンク不可(isNumericNicoUserId で匿名 <span>化): **放置が正解**(会議 qwen3.5/gpt-oss 一致)。匿名は
  ニコのユーザーページURLを原理的に持たない=無理にリンク化は死にリンク(漫画村プロ「落ちない・恥かかない」に反する)。
  最小改善するなら title 属性に「匿名さん」程度(任意・第3の必須でない)。
- tier=たぬ姉段固定: **維持**(会議 qwen3.5/gpt-oss 一致)。「非匿名が埋もれない」UI契約は妥当。匿名に貢献度序列を
  付けるのは「匿名カテゴリの解体」=過剰実装(qwen3.5)。素の時間順で十分。
- **やってはいけない過剰実装(会議+司令塔一致)**: ①下流(席/レーン)を作り直す(既に対応済) ②偽リンク生成
  ③tier設計を壊して非匿名を埋もれさせる ④会場の満席維持/eviction に手を入れて退化 ⑤型変換を疑って
  存在しないバグを追う(実体は commentNo キー前提=構造であって変換ではない)。

## 検証で見る観測項目(実機・最小)

第1反映(拡張リロード→F5)後、匿名主体の配信で status速報の:
- savedCommentsUidStats.withUid / withoutUid: 第1後、匿名(hashedUserId)が withUid に乗っているか。
- commentIngestBySource: ndgr 由来が増えているか(NDGR匿名は識別子あり)。
- (会場/レーンの実画面)NDGR由来の匿名が「匿名」名+ゆっくり顔で席/列に出るか=第3の検証成功。
- DOM観測(visible)由来の匿名が出ないことの確認=本体の課題が残る証拠。

## 具体案(段階)

### 第3-a(検証・実装ゼロ): 上記観測で「NDGR匿名は出る/DOM匿名は出ない」を確定。
出れば「NDGR経路の匿名は人として出る」を達成として記録(過去の積み重ねが第1で開花)。

### 第3-b(本体・DOM観測の匿名に識別子を載せる): commentNo キー前提を緩める。
- 課題: DOM観測行(visible)は commentNo が無いと interceptedUsers に入らず userId 補完されない。
- 方針候補(会議は触れず・司令塔の設計): DOM観測の匿名行に、NDGR で得た hashedUserId を **text+vpos(近接)
  で join** して載せる別経路。または DOM の data-comment-type 構造から匿名行を識別し、NDGR の同時刻 chat と
  突き合わせる。**これは hot path + 突き合わせ精度の難所**=第3-a の実機結果を見てから慎重に設計(別コミット)。
- ⚠️ 第3-b は「番号無し DOM 行に識別子を後付け」=精度を誤ると別人の userId を載せる事故。第1(記録)とは
  桁違いに慎重。第3-a で「DOM匿名がどれだけ出ないか」の実데이터を取ってから着手。

### 第3-c(任意・表示の枝葉): リンクは放置(title に「匿名さん」は任意)・tier 維持。

## 制約(星野ロミ式)
記録本体不可侵・新storage書込み増やさない・hot path 重くしない・落とさない(匿名も人として)・既存データ活かす
(hashedUserId/identicon/席ロジックは既存)・過剰実装回避・検証ファースト(実機で落下点を見てから直す)。

---

## 第3-a 検証の実機結果(2026-06-20・lv350790171・実データで裏取り)

第1反映後の実機速報で確定したこと:
- ✅ **NDGR は匿名の本文+hashedUserId を確かに運んでいる**。ndgrUnknownSamples msg:2 に実物=
  「韓国の昨日のユニはなんやねん…」+ `a:mKKbwxnYZB_nVS3O:` が写っていた。これは NDGR_HASHED_USER_ID_RE
  (^[a-zA-Z0-9_:-]{8,}$)に合致=shouldAcceptNdgrChatAsComment(ndgrDecode.js:255-287)で**採用される**=
  コメント経路では hashedUserId が userId として行に載りレーンに到達できる(第1の成果が効く前提が実証)。
- ⚠️ ただし savedCommentsUidStats=withUid:20/withoutUid:0/totalSaved:20(まだ少数・取得中56%)。
  commentIngestBySource=ndgr:82 / visible:451=**DOM観測が依然多数**。DOM観測の匿名は番号無しだと
  interceptedUsers(commentNo キー)で userId 補完されない=第3-b の本体課題は残る(SYNTHESIS本文の通り)。

## 🔴 検証で新たに見つかった別系統のバグ(文字化け匿名ID `__anon_<生バイト>`)

giftSenderDiag.topSenders[0].userId = **`"__anon_\b...".`(文字化けした生 protobuf バイト)**。
- 発生源(実コードで裏取り): giftSenderObservation.js:20 `if (nickname) return \`__anon_${nickname}\`;`。
  呼び出しは content-entry.js:2294 recordGiftSenderObservation(u.userId, u.nickname)=
  NLS_INTERCEPT_GIFT_USERS の gift user の nickname が【生バイト列】のまま渡り、__anon_ プレフィクスを
  付けて bucket key にしている。giftRecord.js:144 も同型(`__anon_${nick}`)。
- **これはコメントレーン(第3本体)とは別系統=「ギフト送信者の観測診断」の表示**。だが「匿名を人として
  きれいに出す」の一環で直す価値あり=nickname が ID 形式でない/制御文字を含む生バイトなら __anon_ 化せず
  弾くか、anonymousNicknameFallback 相当で「匿名」に正規化すべき。
- ⚠️ ただし giftSenderObservation は診断カウンタ(ギフト送信者観測数)であって会場/レーンの席ではない。
  優先度は第3-b(DOM匿名の識別子)より低い。別タスク候補。

## 結論の更新(検証後)
- 第3-a 達成=「NDGR 由来の匿名はコメント経路で人として出せる」を実データで確認(第1の成果)。
- 第3-b(本体・未着手)=DOM観測(visible・多数)の匿名に識別子を載せる=interceptedUsers の commentNo
  キー前提を緩める難所。実機で「visible 由来の匿名がどれだけ出ないか」の量が見えた今、設計可能。
- 別系統バグ=giftSenderObservation の文字化け __anon_(診断表示)。低優先・別タスク。
