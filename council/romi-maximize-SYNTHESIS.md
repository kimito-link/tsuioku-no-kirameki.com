# 会議 SYNTHESIS: 星野ロミ理論の最大化（司令塔が統合・裏取り）

会議(COUNCIL_QUALITY=1・5体: critic qwen3-32b/gpt-oss-120b・lead gemma4・fast llama-3.3-70b・統合gemma4)を
司令塔(Claude)が統合・裏取り。**会議出力は素材。事実誤認は実コードで訂正した。**

## 採用した会議の指摘
- 【批判役・最重要】content(記録の心臓部)を二段フィルタ/動的キャップで複雑化するのは信頼性リスク。
  content は単純な責務(記録+鏡 publish)に留め、変更は最小限・検証可能な単位で。
- 【lead】「最大化=処理を分けることでなく【責務分離+ステート管理の信頼性確保】」。表示は
  storage.onChanged リスナーのみに依存(ポーリング排除)。← v0.1.961 の onChanged 駆動と一致。
- 【critic】chrome.storage.local は ACID 保証なし=集合UPDATE/CASE原子更新などDB系テクは過剰。
  この拡張に効くのは: 二段フィルタ / 受け手単位集約 / 動的キャップ / 冪等述語 / 常駐タスク / 自己文書化。
- 【全員】記事は「実装手順より設計のトレードオフと落とし穴」に焦点。図は「変更前→変更後の三層比較」が核。

## 司令塔が裏取りして【訂正】した会議の事実誤認
- ✗「既存 articles の manifest.json と sidebar.js を流用」=幻覚。実際の articles/ は静的HTML
  (index.html に .article-card を手書き・manifest.json も sidebar.js も無い)。実コードで確認済み。
- ✗「記事を .md で置く」=誤り。この site は .html(BIZ UDPGothic・暖色・topbar drawer nav)。
- → 正しい実装 = 静的 HTML を1枚追加 + index.html にカード追加 + トップの drawer nav に「技術記事」リンク追加。

## 確定案

### 問い1: 星野ロミ理論の最大化(実装ロードマップ)
**原則: content は薄く保つ。最大化=責務分離の徹底。重い処理は前段で1回、表示は鏡から貼るだけ。**

- 第1段(済 v0.1.961): content がコメント鏡を publish(popup 不要で出る)=常駐タスク型。
- 第2段(次・最優先): 表示(passive)の heavy read 撤去=開いた瞬間を軽く。
  popup/純Web は鏡を storage.onChanged で受けて貼るだけ(ポーリング/全件 read を排除)。
  ★地雷回避: popup の refresh/paint 改変はしない(read を減らすだけ)。会議で固めた
  council/liveview-open-heavy-SYNTHESIS.md の方針を、content 化が済んだ今 安全に再着手。
- この拡張に効く実装テク(storage ベース): 二段フィルタ・受け手単位集約(=メタ診断で実績)・
  動的キャップ(流量で publish 件数/間引きを変える)・冪等述語(派生状態を保存せず都度計算)・
  常駐タスク(content=v0.1.961)・自己文書化。DB系(集合UPDATE/CASE)は採らない(ACID 無し)。
- やらない: content に集計ロジックを足す(信頼性リスク)・リアルタイム性を全捨て・popup paint 改変。

### 問い2: 技術記事 + サイドバー導線(実装の具体)
- 記事: tsuioku-no-kirameki/articles/romi-design-principles.html を新規作成。
  既存記事テンプレ(topbar・header.page・main・暖色CSS変数)に準拠=独自に作らない。
  構成: 誰向け(複雑なステートを持つ拡張/Web開発者)→ 落とし穴(画面に全部やらせると重い/開かないと出ない)
  → 星野ロミ理論=責務分離 → 変更前→変更後の三層図(content/鏡/表示)→ storage ベースへの翻訳
  (効くテク/効かないDB系)→ 我々の実例(v0.1.961)→ 横断ナレッジへのリンク。
- index.html: articles/index.html の記事リスト先頭に .article-card を1枚追加(日付・タイトル・sub・tags)。
- サイドバー導線: トップ index.html の topbar drawer nav(topbar__nav・5894行付近)に
  <a href="articles/">技術記事</a> を1行追加(現状フッターにしか無い=サイドバーから飛べるようにする)。

## 実装順
1. 記事 HTML 作成(既存テンプレ準拠) 2. articles/index.html にカード追加
3. トップ index.html の drawer nav に技術記事リンク追加 4. 実機で表示確認(Claude-in-Chrome)
※第2段(heavy read 撤去)は記事公開とは別タスク=順に。
