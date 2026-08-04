# 統合(司令塔・実コード裏取り済み): 匿名救済の残り作業の優先度と射程

> COUNCIL anon-priority(2026-06-20)。会議=design分類・FAST・3/3成功。
> 元ログ=council/anon-priority-log.txt / 生回答=council/anon-priority-answers.json / お題=council/anon-priority-question.txt
> 会議は素材。司令塔が実コード(buildDedupeKey 等)で裏取りして1案に収束。関連=[[reference_comment_capture_anon_vs_named]]。

## 結論(1案・順序確定)

1. **【最優先・即・低リスク】文字化け `__anon_<生バイト>` 修正**。診断表示のみ・記録本体無関係・
   anonymousNicknameFallback 流用で安全。会議は「検証→文字化け」順だが、司令塔判断で**文字化け先**
   (確実な改善を先に着地・検証コードより小さくリスクゼロ・即ユーザーに見える)。
2. **【次・検証】DOM 匿名の「NDGR 取りこぼし率」を測る**(実装影響ゼロの計測)。ただし会議の
   「計測コード新規追加」より軽い手がある(下記・既存診断で近似可能)。
3. **第3-b(DOM↔NDGR join)= 取りこぼし率を見て判断**。本質は「DOM に ID を載せる」でなく
   「NDGR が既に ID 付きで持つ匿名の、DOM 側の無益な二重記録を捨てる」(司令塔の決定打)。
   取りこぼしが実質ゼロなら**実装不要**(NDGR で足りている)。
4. **第2(番号緩和)= 凍結維持**(会議3/3一致)。DOM に userId が無いので番号を緩めても userId 無し行が
   増えるだけ=レーンに人は出ない=v0.1.820 凍結理由と不変。

## 根拠

- 🔴 **司令塔の決定打(実コード buildDedupeKey commentRecord.js:75-83)**: 番号無しコメントの重複キーは
  `${liveId}||${text}|${sec}|${uid}`。DOM匿名(uid='')と NDGR匿名(uid='a:xxx')は**uid 差で別キー=別行で
  二重記録**。∴ 第3-b の本質は「ID を載せる」でなく「NDGR が ID 付きで既に持つ同一コメントの DOM 重複を
  捨てる」。NDGR が全匿名をカバーしていれば DOM 匿名は**ただのノイズ**=捨てるべき(載せ替え不要)。
  → 会議の「別人混入リスクのある join」は**そもそも不要**かもしれない(NDGR 側が正・DOM 側を捨てるだけ)。
- 会議3/3一致: 検証ファースト・第3-b は閾値判断・第2 凍結・文字化けは安全に直せる。
- 批判役(gpt-oss)の穴: 時刻+本文マッチは同時刻同内容で別人衝突=ID 付与は最後の手段。→ 司令塔の発見で
  「ID 付与(join)自体を避け、DOM 重複を捨てる方向」なら衝突リスクごと消える。
- 第1(v0.1.836)+下流(v0.1.775〜803)で **NDGR 由来の匿名は既に人として出る**(第3-a 検証済)。

## 反論・リスク

- 会議の「計測コード新規追加(window.__ANON_DOM_LOG__・anonMetrics.js・ndgrCommentStore.hasHashedId)」は
  **過剰**。新規ファイル+hot path ロギングは星野ロミ式に反する。**既存診断で近似**: status速報の
  commentIngestBySource(visible vs ndgr)と savedCommentsUidStats(withoutUid)で「DOM だけで来て NDGR に
  無い匿名 = withoutUid 行」を概算できる。実機 lv350790171 では withoutUid:0(=DOM 匿名は別行で
  二重記録されているが withoutUid に出ていない? 要確認)。**まず既存値で測り、足りなければ最小計測**。
- やってはいけない過剰実装(会議+司令塔一致): ①DOM↔NDGR join を精度検証なしで入れ別人を会場に出す
  ②番号緩和で userId 無し行を量産しレーン/記録を汚す ③文字化け修正を会場の席ロジックに波及させる
  ④計測のために hot path に重いロギングを常設する。
- ⚠️ 司令塔の仮説(DOM 匿名=NDGR の二重)が外れる可能性: DOM でしか来ない匿名が有意に存在するなら
  「捨てる」では落としてしまう。だから②検証(取りこぼし率)を文字化け修正の次に必ず置く。

## 具体案(次のコミット順)

### コミット1(即・v0.1.837 候補): 文字化け __anon_ 修正
- src/lib/giftSenderObservation.js:20 と src/lib/giftRecord.js:144 の `__anon_${nickname}`。
- nickname が「制御文字を含む/ID 形式でない生バイト」なら __anon_ 化せず、nicoAnonymousDisplay.js の
  仕組み(anonymousNicknameFallback / 制御文字検出)で「匿名」に正規化 or bucket から除外。
- 純ロジック化: `sanitizeGiftSenderNickname(raw)`(制御文字・非表示バイトを含むなら null)を新設+test。
  giftSenderObservation が委譲。診断カウンタのみ=記録本体・会場不変。characterization test 先行。

### コミット2(検証・実装ほぼゼロ): DOM 匿名の取りこぼしを既存値で測る
- まず status速報で commentIngestBySource(visible/ndgr)と savedCommentsUidStats(withUid/withoutUid)を
  匿名主体配信で観測(ユーザーに速報依頼)。DOM 匿名が二重記録なら withoutUid が増えるはず=その量で
  「NDGR がどれだけカバーしているか」を概算。不足なら最小の per-source 匿名カウンタを1つ足す(hot path に
  重いマッチングは入れない)。

### コミット3(条件付き・本丸): 第3-b
- 取りこぼし率が無視できる(NDGR がほぼ全カバー)なら → **DOM 匿名の二重記録を捨てる**最小修正
  (buildDedupeKey 周辺で「同 text+同 sec で uid 付き行が既にあれば uid 無し DOM 行を採用しない」)。
  ※ これは「別人 ID を載せる join」より遥かに安全(載せ替えでなく抑制)。
- 取りこぼしが有意なら → そこで初めて join を会議で再設計(時刻窓・衝突回避を厳密に)。

### 第2(番号緩和): 凍結維持。再開条件=取りこぼし率が高く かつ DOM 匿名にしか無い情報があると判明したときのみ。

## 制約(星野ロミ式)
記録本体不可侵・新storage書込み増やさない・hot path 重くしない・落とさない(ただし「落とさない」=
他人属性を載せないが最優先・qwen3.5)・既存データ活かす・過剰実装回避・検証ファースト・v0.1.820 凍結を繰り返さない。
