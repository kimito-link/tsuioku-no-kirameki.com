# 統合(司令塔・実コード裏取り済み): 記録件数の表示ロジック簡素化(根治)

> COUNCIL count-simplify(2026-06-20)。design分類・FAST・3/3成功(qwen3.5発散/groq速い/gpt-oss批判)。
> 元ログ=council/count-simplify-log.txt / 生回答=council/count-simplify-answers.json / お題=council/count-simplify-question.txt
> 会議は素材。司令塔が実コード(chunk index.total/effectiveTotalCount)で裏取りして1案に収束。
> 棚卸し正本=council/recorded-count-zero-bug.md(6カウンタの地図)。関連=[[reference_recorded_count_zero_bug]]。

## 結論(1案・段階導入)

ユーザー根底批判「記録の数字がバラバラ・正確さが崩れた」の根治は——
**新正本(IDB集計/新テーブル)は作らない。既に健全な observed を『表示の唯一正本』に固定し、その上に積んだ
6段のゲートを段階的に剥がす + 診断用カウンタを表示から物理分離する。**

🔴 **司令塔が会議の主案を制約違反として却下**: 会議2体(qwen/gpt-oss)は「IDB実数 or 新テーブル
commentCountSummary をインクリメンタル更新して正本に」と提案。だが——
- **新storageキー/テーブルは制約違反**(お題明記「新storage書込み増やさない」)。整合の別問題を生む。
- **正本は既に存在する**(実コード裏取り): chunk mode で observedRecordedCommentCount = effectiveTotalCount
  = chunk index.total + tail(content-entry.js:11266-11270)。源は健全。**病は源でなく、上に積んだ表示ゲート**。
- ∴ 新正本を作るのは過剰。**会議の (C)案(表示/診断の分離)+ゲート剥がし**が制約内で最大効果。

## 根拠

- 実コード: chunk mode の observed は index.total+tail を反映=確定値に近い。main 配列 mode も
  tailMainCount+buffer で観測。源の揺れは「ネット遅延/backfill順序」由来だが、**表示が跳ねる主因は
  源でなく6段ゲート(単調化×2・配信者除外の引き算・床・countToShow の max)**。
- 会議3/3一致: 表示と診断を分離・表示は1本・段階導入・回帰テスト先行。
- 批判役(gpt-oss)の妥当な留保: 単調化を全撤去すると UI 再描画の二度更新でフリッカー。
  → **単調化は「フリッカー防止の最小安全網」として残す**(増減防止のみ・推定安定化の役は源に返す)。
- v0.1.838 の配信者除外修正で「引き算」自体の脆さが露呈。会議一致=**引き算をやめ『記録N(うち配信者M)』
  並記**が正確(公式との比較はユーザー判断に委ねる)。

## 反論・リスク(司令塔の選別)

- ❌ 新テーブル commentCountSummary(qwen/gpt-oss)= 却下(制約違反・整合の別問題・過剰)。
- ❌ IDB全件を非同期集計(qwen)= 既に observed=chunk index.total があるので不要。Web Worker 新設は過剰。
- ✅ 表示/診断の物理分離(全員)= 採用。savedCommentsUidStats/commentIngestBySource は診断専用と明記し
  表示経路から参照しない(既に表示は recordedCountForDisplay 由来=実は分離済。ドキュメント/命名で固定)。
- ✅ ゲート剥がし(段階)= 採用。ただし**一斉撤去しない**(批判役・お題の制約)。1ゲートずつ剥がし
  characterization test で「増えて減る/0潰れ」回帰を固定してから次へ。
- 🔴 ゲート撤去で病が再発する穴(批判役): 4経路の上書き合戦(v0.1.645)・enumerate揺れ(v0.1.804)・
  OFF/ON max飛び(v0.1.792)。**撤去の前提条件=「表示が単一正本(recordedCountForDisplay)1本だけを見る」
  ことを先に確立**(複数ソースの上書き合戦が消えれば単調化の主目的も消える)。→ だから第1は「正本一本化」、
  ゲート剥がしは第2以降。
- やってはいけない過剰実装(会議+司令塔): 新storageテーブル/Web Worker新設/全ゲート一斉撤去/
  chunk・main両対応の巨大分岐新設/IDB全件を毎フラッシュ集計。

## 各ゲートの存廃判定(司令塔)

| ゲート | 由来 | 判定 |
|---|---|---|
| countToShow=max(summary, displayEntries) | popup | 🔧 **見直し**。displayEntries(UI生成数)を max に混ぜるのが0潰し/揺れの一因。表示は summary(=recordedCountForDisplay)を正本にし、displayEntries は混ぜない。 |
| 配信者除外の引き算(v0.1.774/838) | popup | 🔧 **並記化**。引き算をやめ「記録N(うち配信者M)」表示。引き算の脆さ(v0.1.838の0潰し)を根絶。 |
| popup per-state 単調化(v0.1.645) | popup | ⚠️ **最小化して残す**(フリッカー防止のみ)。正本一本化後はフラグで撤去可否を回帰テストで判定。 |
| content per-live 単調化(v0.1.792) | content | ⚠️ **残す**(OFF/ON max飛びの安全網)。正本が安定すれば将来撤去候補。 |
| status 床 recordedSumFloor(v0.1.804) | status | ⚠️ **残す**(複数live enumerate揺れの安全網)。単一正本化で揺れが減れば撤去候補。 |

## 具体案(段階導入の順序)

### 第1(最小・正本一本化の宣言+診断分離): 実装小・リスク小
- 表示の正本は recordedCountForDisplay(lid)1本、と明文化(AGENTS.md/コメント)。
- savedCommentsUidStats / commentIngestBySource は**診断専用**とコメント・命名で固定(表示経路から参照しないことを
  test で保証=「表示値は recordedCountForDisplay のみに依存」を回帰テスト化)。挙動変更なし。

### 第2(countToShow の見直し): 0潰し/揺れの一因を断つ
- popup の countToShow=max(summaryRecordedCount, displayEntriesBase.length) から displayEntries を外し、
  表示は summaryRecordedCount を正本に(displayEntries は「並べる中身」専用)。
- characterization test=「summary>entries でも表示が entries に引っ張られない」「0潰れない」。

### 第3(配信者除外の並記化): 引き算の脆さを根絶
- 「記録N(うち配信者M)」表示に。setCountDisplay の引き算(resolveBroadcasterExcludedCount)を撤去し
  並記に。v0.1.838 の broadcasterCommentCount.js(除外で減った数)は「うち配信者M」の M に転用。
- characterization test=「小規模/匿名でも記録Nが0に潰れない」「Mは実除外数」。

### 第4(ゲート存廃の回帰判定): 単調化/床をフラグ化し、回帰テストが緑なら撤去
- 正本一本化(第1-3)後、単調化/床を ENABLE フラグ default true のまま、まず「無くても増えて減る/揺れが
  出ない」ことを test で確認 → 確認できたゲートから撤去。一斉撤去はしない。

## 制約(星野ロミ式)
記録本体(IDB/chunk/tail)不可侵・新storageキー作らない・hot path 重くしない・落とさない・既存データ活かす
(observed/chunk index.total は既存)・過剰実装回避(新テーブル/Worker不要)・段階導入・回帰テスト先行。
