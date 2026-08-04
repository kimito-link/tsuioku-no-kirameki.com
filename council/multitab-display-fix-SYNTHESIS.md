# 会議 統合（司令塔 Claude が裏取りして1案に収束）: 多タブ同時表示・同時記録

お題: 多タブ同時で「表示・記録できる」正しい設計。タブ増殖/重さ/空表示も同時に直るか。世界の実例。最小の第一歩。
会議: `COUNCIL_QUALITY=1 node scripts/meeting.mjs council/multitab-display-fix-question.txt`（design・5体・批判2/lead2/fast1・成功5/5・129秒）。
生データ: council/multitab-display-fix-answers.json / -readable.txt / -log.txt。
独立Web調査(司令塔・検証済URL): 別途リサーチ agent で実在確認。

---

## ★最重要の裏取り結果（会議の枠組み自体が半分ズレていた）

会議5体は「IndexedDB + Offscreen 単一書き手 + BroadcastChannel + マスタータブ選出 を**新規設計せよ**」に収束した。
**しかし実コードを確認すると、この設計は【すでにこのコードベースに存在する】。** 会議は「新規設計」だが、現実は「既存資産の続き」。

| 会議が「作れ」と言った物 | 実コードの現状（司令塔が確認） |
|---|---|
| IndexedDB コメントストア | **実装済**（`src/lib/commentDb.js`・opt-in `KEY_COMMENT_IDB_ENABLED`） |
| Offscreen 単一書き手 | **実装済だが【常時無効化】**（`content-entry.js:10079 FORCE_DISABLE_COMMENT_IDB_PATH=true`） |
| BroadcastChannel 通知 | **実装済**（`CDB_BROADCAST_CHANNEL`・offscreen-entry/popup-entry が使用） |
| マスタータブ選出（Web Locks） | **実装済かつ稼働中**（`src/lib/tabLeaderLock.js runIfTabLeader`・content が fetch/scrape/backfill で使用） |

⇒ **会議の「Offscreen 単一書き手を作れ」は、このプロジェクトでは【一度作って実機で失敗し、kill-switch で殺した道】**。批判役 qwen3-32b/gpt-oss-120b が予言した「Offscreen 単一プロセスがボトルネック」は的中していて、**実機ではもっと悪く「SW が idle 停止して Offscreen の append が成立しない＝記録が落ちる」ため `FORCE_DISABLE_COMMENT_IDB_PATH=true` で封印済み**（content-entry.js:10074-10079・fix/idb-offscreen-killswitch 2026-06-01）。司令塔の独立調査でも「Offscreen は chrome.runtime messaging しか使えず、SW idle で死ぬ」は裏取り済み。**→ 会議の中心案（Offscreen 単一書き手）は不採用。** 既に試して失敗している。

## ★既に解けている部分（PR0-3・PR5-a 完了済み＝会議は知らなかった）

`feat/multitab-scale-ultraC`（[[plan_multitab_scale_ultraC]]）で **多タブの「重複した重い仕事」は既に1タブ化済み**:
- 外部API fetch（koken/nicoad/profile/参加者）= `runIfTabLeader('nls-extfetch-'+lv)` で N→1（PR1-b 完了）。
- 過去ログ backfill = `runIfTabLeader('nls-backfill-'+lv)` で **467req/s→66req/s**（PR2 完了）。
- DOM scrape（5秒毎）= `runIfTabLeader('nls-domscrape-'+lv)`（PR3 完了）。
- follower は `storage.onChanged + 3秒poll` で描画（リーダーでなくても読める＝パネルは出る・fail-open）。

⇒ 「7タブ＝7倍の fetch/scrape/backfill」という**重さの主要因はかなり潰れている**。会議の「リーダー選出を導入せよ」は**既に done**。

## ★残っている本当の唯一の穴（= 今やるべきこと）

[[reference_multitab_scale_ultraC_leader_election]] の手順③と [[plan_multitab_scale_ultraC]] の **PR4 が未着手**。これが「空表示『—』固まり」の【直接の実機構】:

> **コメント本体は今も `chrome.storage.local`（単一LevelDB）に保存している**（IDB/Offscreen は kill 済みなので）。
> 多タブが `persistCommentRowsImpl`(content-entry.js) で **read-merge-write を同時実行** + popup が refresh で並列 get →
> Chrome 内部キューの head-of-line blocking → popup read timeout → **全カード「—」固定**。

これは司令塔の独立調査でも裏取りできた:
- chrome.storage.local は**トランザクション無し・get/set は IPC+シリアライズで重い**（chromium-extensions group・DevRel Simeon Vincent / wOxxOm 確認）。
- 公式の回避策は「**read は一度だけ→in-memory→書き戻しを coalesce**」（同スレッド）。
- ⚠会議の誤り訂正: 「storage.local は書き込みレート制限がある」は**誤**（レート制限は `storage.sync` のみ）。「単一LevelDBが並行アクセスを直列化して【timeout】する」は機序として妥当だが**公式文書では明言されていない**（実機観測としては確か）。

## 仮説の判定（「多タブ表示を正せば 増殖/重さ/空表示も直るか」）

**部分的に妥当・ただし1つに統合するのは危険（会議は「1つの根本原因」と言い切ったが、これは誤り）。** 切り分け:

| 症状 | 根本原因 | 多タブ対応で直るか |
|---|---|---|
| 重さ・空表示『—』 | **storage.local 競合**（read-merge-write の同時実行・PR4 未着手） | ✅ **直る**（共通原因はこれ） |
| タブ増殖（勝手に増える） | **別系統**＝過去 autopatrol/古い重複拡張 v0.1.727 の遺物・`active:false` 裏タブ（[[project_ghost_tab_dup_extension]]） | ❌ storage では直らない。タブ作成経路の問題。手動クローズ導線(v0.1.926)で対処済み |

⇒ 会議の「全部1つの根本原因」は**楽観的すぎ**。**重さ・空表示は storage 競合（PR4 で直る）／タブ増殖は別系統（既に別対処済み）**として切り分けるのが正しい。批判役 qwen3-32b の「タブ増殖はライフサイクル管理の不備で別」が正解に最も近かった。

## 世界の実例（司令塔が検証・会議の幻覚を除去）

✅ **検証できた実在パターン**（独立リサーチ・URL付き）:
- **Web Locks API リーダー選出**＝多タブ Web の標準（MDN / w3c web-locks EXPLAINER）。`pubkey/broadcast-channel` の LeaderElection と `dabblewriter/tab-election` は**実在**し、**RxDB が採用**。← このプロジェクトは既にこの方式（自前 `tabLeaderLock.js`・依存ゼロで実装）。
- **Offscreen Document**＝MV3 の永続DOM文脈の公式パターン（chrome.dev 公式）。但し chrome.runtime messaging しか使えず、SW idle で死ぬ（＝本プロジェクトで失敗した理由と一致）。
- **IndexedDB**＝数万件の append/範囲読みの正しいストア（トランザクション・索引・GB級）。
- uBlock/Dark Reader/RxDB が「共有の重い仕事は1タブ代表＋onChanged 配布」に収束（前回リサーチ）。

❌ **会議の幻覚（採用しない）**: gpt-oss-120b の「Twitch-Chat-Downloader が MessagePort でタブ同期」「YouTube Live Chat Overlay が storage.sync→IDB フェイルオーバー」「Streamlabs が SharedWorker」等の**製品別実装は出典未確認＝幻覚の可能性が高い**。qwen3-32b の「Discord が SharedWorker」も未確認。**製品名ベースの主張は捨てる**（パターン名だけ採用）。⚠`SharedWorker` は **MV3 SW から使えない**（whatwg/html#8362）ので「SharedWorker で解決」案は MV3 では不可。

---

## 最終1案（確実版・実装骨子）= PR4「storage 競合の解消」を最小ブラスト半径で

**Offscreen 単一書き手（kill 済み）には戻らない。** chrome.storage.local のまま「競合を減らす」。kill-switch を踏まない安全な道。

### PR4-a（最小・最初・挙動ほぼ不変）= 書き込み coalesce + 不要 re-read 削減
- `persistCommentRowsImpl` の書き込みを **debounce/batch で coalesce**（連続 set を間引く・マージ内容は不変）。
- 保存時の `KEY_AUTO_BACKUP_STATE` 等の**毎回 re-read を削る**（同一値の無駄読み）。
- 純関数 `src/lib/storageReadCoalesce.js`（新規・vitest）。記録の中身は変えない＝退行しにくい。

### PR4-b（中）= popup/inline の hot read に in-memory TTL cache
- popup の refresh が毎回 storage を並列 get している hot path に、**in-memory TTL cache + onChanged invalidate** を噛ませる。
- 3秒 poll を「変化時のみ描画」に。→ 多タブで storage read 回数が激減＝「—」固まりの直接機構を消す。

### PR4-c（高・最慎重・任意）= writer 単一化（leader だけが書く）
- `runIfTabLeader('nls-write-'+lv)` で **書くのはリーダー1タブだけ**、follower は onChanged で読むだけ。
- ⚠記録の心臓部に最接近＝follower→leader への行受け渡し設計が要る。**実機検証必須**。PR4-a/b で足りれば見送る。

### 検証（self-verifying）
- 既存 e2e `tests/e2e/multitab-storage-contention.spec.js`（PR0・4タブ+inline・storage stall 注入）が **完全 GREEN** になることが PR4 の DoD。
- 守る e2e: inline-panel-align / extension-recording / backfill-* / refresh-storage-hang-resilient / panel-vanish-debounce。
- ⛔ console 副作用禁止（v0.1.422 でパネル壊した教訓）。各 PR で「実機でパネルが出る」を確認してから次へ。

### 会議で出た不採用/補正（理由つき）
- ❌ Offscreen 単一書き手（会議の中心案）= **既に試して kill 済み**（SW idle で append 落ち）。戻らない。
- ❌ SharedWorker（gpt-oss/qwen3-32b）= MV3 SW から使えない（whatwg/html#8362）。
- ❌ バックエンドサーバー導入（gemma4 初案・批判で撤回済）= MV3/プライバシー/依存ゼロ方針に反する。
- ❌ 「storage.local はレート制限」= 誤（sync のみ）。「全部1つの根本原因」= 楽観的すぎ（タブ増殖は別系統）。
- ✅ 採用＝Web Locks リーダー選出（**既に稼働中**）+ storage 競合解消（**PR4 が唯一の残作業**）。

## 次の一手
- **会議の「新規アーキ設計」は不要**。既存 `feat/multitab-scale-ultraC` の **PR4-a（書き込み coalesce + re-read 削減）から着手**。最小ブラスト半径・記録不変・既存 e2e で守れる。
- タブ増殖は storage と無関係（別系統・既に手動クローズ導線あり）として切り離す。
- ⚠実装前に branch `feat/multitab-scale-ultraC` の現在の HEAD と master の差分を確認（PR0-3 が master 入りしているか）。
