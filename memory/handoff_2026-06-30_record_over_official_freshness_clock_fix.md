# 記録>本家コメ「要確認」誤発火 根治 — v0.1.1003 (2026-06-30)

## 結論
master HEAD = **v0.1.1003 (0cbca14c)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1003。
「記録>本家コメ=要確認」が**公式集計の遅延だけ**のときも誤発火していた根治。鮮度判定のクロック取り違え。

## 真因確定までの道(計器が決定打・エージェントは3回目の外し)
- v0.1.1002 の内訳計器で確定: 実機 lv350859008 は **commentNo 欠落=0%** なのに 106%(102→106 に増)。
  → 匿名/欠落由来の二重では【ない】(全部 commentNo 付き=liveId|no|text で一意 dedup)。
- Explore は「cleanNdgrChatRows が text 正規化漏れ→同一no別textで二重」と結論。**だが誤り**:
  buildDedupeKey(commentRecord.js:76)が**内部で normalizeCommentText する**ので、cleanNdgrChatRows の
  trim のみ text でも ndgrChatsToMergeRows の正規化済 text でも**同じキーになる**=二重しない。
  → 司令塔が実コードで否定(過去2回+今回で3回外し=エージェント結論は必ず裏取り)。
- 司令塔が真因を特定: **provenance の鮮度判定が別クロックだった**。
  - 「本家コメが新鮮か」を `lastIngestAgoMs`(=コメント取り込み時刻)で見ていた。
  - コメントは毎秒来る→lastIngest 常に~0秒前→常に「新鮮」誤認。
  - 公式 statistics.comments は遅延更新(数分古いことあり)。その遅延ぶん記録先行は構造上正常。
  - なのに「新鮮なのに超過=遅延で説明できない」と check 誤発火。

## 修正(記録・dedup には触らない=鮮度クロックだけ正す)
- status-entry.js summarizeOneLive: snapshot.officialCommentStatsUpdatedAt(stats.comments 更新時刻)から
  **officialCommentStatsAgeMs** を出して lv summary に載せる。
- commentCountProvenance.js buildCommentCountProvenance: 鮮度判定を **officialCommentStatsAgeMs 優先**に
  (無ければ従来 lastIngestAgoMs フォールバック=後方互換)。公式遅延(>60秒)なら normal、本当に新鮮で
  超過 or 130%超だけ check。

## verify
- verify:cc 緑(公式遅延→normal / 公式新鮮→check / 130%超は遅延でも check / 旧経路フォールバック)。
- 出荷バンドル probe: 5974/5633(公式3分前)=normal・公式5秒前=check・142%=check・旧経路=normal。

## 効果と残
- 「公式集計が遅れているだけ」の誤要確認が消える(実機 102〜106% は公式遅延が主因の像)。
- **本物の二重計上は引き続き検知**: 130%超 or 公式が本当に新鮮(<60秒)で超過。
- まだ「真に二重が疑われる配信(欠落割合高 or 公式新鮮で大幅超)」が出たら、欠落割合(v0.1.1002)+
  officialCommentStatsAge(v0.1.1003)で更に切り分け→ loneDedupe 強化等(会議級)。
- ★教訓: 「記録 vs 本家」系は **2つの別クロック**(コメ取り込み時刻 / 公式統計更新時刻)を混同しない。
  鮮度を語るなら必ず「どの値の鮮度か」を一致させる。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
