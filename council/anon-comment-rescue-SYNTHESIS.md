# 統合(司令塔・実コード裏取り済み): 匿名(184)コメントの本文を救済する

> 2026-06-20。会議(COUNCIL anon-comment-rescue・code分類4召集)は重ローカル(deepseek-r1)ハングで打ち切り
> =司令塔が実コード+実データで直接統合(会議は素材・本件は実データの証拠が決定的で会議なしで結論可能)。
> 実データ正本=lv350789879 速報(msg[1]:979 chat来てるのに totalSaved:7)。関連 memory=[[reference_comment_capture_anon_vs_named]]。

## 結論(段階導入・第1で本文救済)

ニコ生は匿名(184)主体。その本文が **commentNo 必須フィルタ**で捨てられている本物のバグ。
**第1コミット=本文の記録を救う**(挙動が変わる=慎重・characterization test 先行)。
受理原則(OneComme と同一)=**「番号があれば従来通り / 無くても 本文非空+識別子(userId/hashedUserId) があれば受理 / どちらも無ければ捨てる」**。gift/system 排除は維持。

## 根拠(実機+実コードで確定)

- 実機 lv350789879: visible 10,364・ndgr 275・**msg["1"]:979(chatタグ来ている)** なのに **totalSaved:7**(userId付きのみ)。
  → chat は来ているのに匿名本文を捨てている=利得が実在(v0.1.820 凍結の再開条件を満たす)。
- 匿名 chat も材料は揃っている: ndgrDecode.js:252 が {no, rawUserId, hashedUserId, content, vpos, accountStatus, is184} を抽出済。
  ndgrChatRows.js:16-20 が userId=rawUserId||hashedUserId を解決(匿名は hashedUserId・^[a-zA-Z0-9_:-]{8,}$)。番号が無いだけ。

## 落ちている2(+1)経路(すべて commentNo 必須)

1. **NDGR正規化** cleanNdgrChatRows.js:17 `if (!commentNo) continue;`
2. **NDGRフラッシュ** content-entry.js:1789-1816 flushNdgrChatRowsBatch:
   - :1794 `if (!no || !text) continue;`
   - **:1795 dedup キー `${no}\t${text}`** ← 最難所。番号無し行は全部 `\ttext` に寄り、別人の同一本文(「ww」等)が衝突して1件に潰れる。
3. **DOM観測** nicoliveDom.js:874/881(parseNicoLiveTableRow)+ isHarvestableNicoCommentRow:831。
   **第2の開放点が設計済みで凍結中**(:840-843 `requireNumber:false` + data-comment-type 構造ガード)。今回の実データが再開条件。

## 反論・リスク(司令塔が批判役を兼務・最難所2つ)

🔴 **難所A=dedup キー**。`${no}\ttext` のまま番号を緩めると、匿名の「w」「888」が全部衝突して大量ロスト。
- **対処**: キーを行種で分岐。番号あり→従来 `no\ttext`(不変=既存テスト緑)。番号無し→ `a:${userId}\t${text}\t${vpos??''}`(同一人物=同一hashedUserId が 同一本文 を 同一位置 で=真の重複のみ潰す。vpos が違えば別コメントとして残す)。userId も無い番号無し行は受理しない(識別子ゼロは捨てる原則)。
- vpos が null の番号無し行: 識別子(userId)があれば `a:${userId}\t${text}\t` で受理(同一人物の全く同じ本文が vpos 無しで複数=稀・潰れても実害小)。

🔴 **難所B=誤検知(記録を汚す)**。番号必須を外すと混入しうるもの:
- gift システムメッセージ → parseGiftCommentText 排除を**維持**(cleanNdgrChatRows.js:23 はそのまま)。
- generalSystemMessage(運営アナウンス) → 実データ scanProbe に `generalSystemMessage:1` 観測。**accountStatus / is184 / data-comment-type で構造判定できるが、第1では「NDGR経路のみ・本文+識別子必須」に絞る**ことで運営メッセージ(識別子の付き方が違う)混入を最小化。DOM経路(第2)で data-comment-type 構造ガードを使う。
- 空本文 → text 非空チェック維持。
- 他配信残骸 → 既存 capturedLid ガード(content-entry.js:1784)維持。

🔴 **やってはいけない過剰実装**: ①会場/応援レーンに匿名を出す描画変更を第1に混ぜる(userLaneCandidatesFromStorage は userId 必須=別フェーズ) ②新規 storage キー追加 ③DOM経路と NDGR経路を同時に緩めて影響範囲を二重にする(段階導入を崩す)。

## 件数・単調化への影響(memory per-live monotonic v0.1.804)

匿名本文が大量に増える=observedRecordedCommentCount が正当に跳ねる=**正常な増加**(退化ではない)。per-live 単調ゲートは「増える側」を妨げないので問題なし。取得率(分母=公式件数)に対して記録が増える=取得率が上がる方向=ユーザー体験は改善。

## 段階導入(フェーズ・フロー図を作る substantial タスク)

- **第1(挙動が変わる・慎重)**: NDGR経路の本文救済。cleanNdgrChatRows.js:17 の受理緩和 + flushNdgrChatRowsBatch の dedup キー行種分岐。characterization test = 既存14本のうち「commentNo空を除外」(test:11-18)を**意図的に書き換え**(番号無し+識別子+本文→通る / 番号無し+識別子無し→落ちる / 別人同一本文が潰れない)。
- **第2(DOM経路)**: parseNicoLiveTableRow / isHarvestableNicoCommentRow を requireNumber:false + data-comment-type 構造ガードで開放(凍結解除)。誤検知ガード(おすすめ生放送 guardRecommendedSections)必須。
- **第3(別フェーズ)**: 匿名(hashedUserId)を会場/応援レーンに「人」として出す(userLaneCandidatesFromStorage 拡張)。

第1だけで「匿名コメントが記録される」価値が出る(記録=このソフトの存在意義)。フェーズ・フロー図=docs/anon-comment-rescue-flow.html(✅第1/❄️第2凍結解除/🙋第3)。

## 制約(星野ロミ式)
記録本体不可侵・新規storage書込み増やさない・hot path 重くしない・落とさない(匿名拾う)・既存データ活かす(hashedUserId は decode 済)・characterization test 先行。
