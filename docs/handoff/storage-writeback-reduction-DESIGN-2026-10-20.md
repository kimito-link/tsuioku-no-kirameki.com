# storage 書き込み通知の安全な削減 — 設計書

設計=Fable / 会議素材=無料会議(5体+批判2+統合、素材であって結論ではない) / 裏取り=司令塔 / 2026-10-20 / 3段構えの手順2の産物。前提 master=v0.1.1698。
問い全文: 会議用の問いは「観測/解釈/制約/問い」の4ブロックで書いた(COUNCIL-HOWTO の型)。実装は [storage-writeback-reduction-IMPLEMENTATION-HANDOFF-2026-10-20.md](storage-writeback-reduction-IMPLEMENTATION-HANDOFF-2026-10-20.md)。

## 背景(実測 2026-10-20 の状態速報)
全ページ(popup-sidepanel・status・sidepanel・会場)は主スレッド1本を共有し、`chrome.storage.onChanged` は旧値+新値を全ページへ配る。各ページが受けた量: `nls_comments_<lv>` 約1.1MB×73回/4分(約80MB・最大)、`nls_ctail_*` 約20KB×353回、`nls_comment_timeline_mirror_v1` 111〜154KB×111回、`nls_user_comment_profile_v1` 約330KB×29回/2分 ほか。コメント書込モードは「チャンク追記」=本体キーへの全件書きは記録経路ではない。

## 会議の素材の扱い(司令塔の判定)
- 使った: 直読み移行が書き戻し停止の先/停止条件を安全側に倒す/profile は同値停止まで/ctail は触らない/測定先行。
- 捨てた(幻覚・的外れ): `saveCommentsToStorage`(実在しない関数名)、「ctail を最大200行に制限」、「CVR/LTV」。cloudflare/gpt-oss-20b は0字で失敗。会議の「停止条件は `commentsChunked && liveChunkMigrated && !indexCorrupted`」は Fable が否定した(下記)。

## A. 結論と優先順位
1. **司令塔の解釈は条件付きで採用**。ただし「温存バックアップを更新しているだけ」は半分誤り: v0.1.509 以降に始まった配信(=ほぼ全部)では `nls_comments_<lv>` は記録経路が一度も書かない。main キーの中身は popup/content の書き戻しが作った【複製】で、バックアップですらない。旧配信(v0.1.509 以前に移行したもの)だけが本当の温存バックアップで、今の無ガード書き戻しは**チャンク由来の短い配列でそれを潰しうる**(コード上の帰結・実機で起きたかは未確認)。**書き戻しを止めることはバックアップの保護でもある。**
2. **停止条件は「書き戻し先=自分が読んだ元」**。popup は `commentsChunked`(popup-entry.js:15481 `isChunkIndex(lightChunkIndexRaw, lv)`)、content:15933 は `readChunkedComments` の戻り `fromChunks === true`(commentChunkStore.js:286/302)。index が無効/未移行/破損のときは従来どおり書く=止める方向にしか変えないので fail-safe。**`liveChunkMigrated` は使わない**: content のメモリ変数で、seed の4分岐すべて(content-entry.js:11163/11192/11209/11229=正常/破損/未移行→移行/timeout)で true になり、storage の index の有効性とは一致せず、popup から見えない。
3. **順序: V1(直読み移行)→ V2(popup 4か所ガード)→ V3(content ガード)→ V4(profile hydrate・測定先行)**。V2 が最大の通知源を消す本命。V1 は V2 の前提。
4. **祝祭スキャン(popup-entry.js:10634)は壊れない**: チャンク運用の実入力は refresh 内の `runPopupCelebrationCommentScan(arr, lv)`(:15965)。onChanged 経由は popup 自身の書き戻しの反響(同じ長さ)で `celebrationCommentIncrementalScan.js:39` の `entries.length <= from` により no-op。listener は触らない。
5. **ctail は「やらない」で正しい**: onChanged はキーごとに旧値+新値を配る。同乗物(csummary 等)を別 set に分けても、バイトは同じでイベント数が増えるだけ。読み手 venueBar.js:6890 / comeview-entry.js:1961 は newValue 直採用で追加 read ゼロ。ingest_log は tail 経路に10秒クールダウン済み(commentIngestLog.js:32/42/96-97)。
6. **profile は popup の hydrate 専用経路(popup-entry.js:4936-4950)だけが同値書き戻し疑い**。content 5経路と popup の他3経路は `mergeIntoMap` の変化検出(userCommentProfileCache.js:94-142)か prune のサイズ変化でしか書かない。shard 化は本設計に含めない。

## B-1 `nls_comments_<lv>` を読み書きする全箇所の分類(Fable が実コードで確認)
| 箇所 | 用途 | 読み元 | 書き先 | 停止後 |
|---|---|---|---|---|
| content-entry.js:11189-11216 `seedTailFromMain` | 記録 seed | main(未移行/破損時のみ) | cchunk/index/migrated | 不変(記録経路) |
| content-entry.js:12397/12466/12719 persist whole 分岐 | 記録(非チャンク時のみ) | main | main | 不変(`wholeWrites` で監視) |
| content-entry.js:15824 `maybeResolveNamedUserProfilesOnce` | profile 解決 | chunk→main | **main(15933・無ガード)** | **V3 で止める** |
| content-entry.js:15969 フォロー情報取得 | — | chunk→main | 書かない | 不変 |
| **content-entry.js:16069-16075 フォロー先一覧** | 30秒に1人 | **main 直読み** | 書かない | **壊れる→V1 で移行** |
| popup-entry.js:15562 `readHeavyFromStore` | 表示の本体読み | chunk→main | — | 不変 |
| popup-entry.js:15755-15760 / 15830 | 正規化・汚染除去 | — | main(`!commentsChunked` ガード済み v0.1.509) | 前例 |
| **popup-entry.js:4944** hydrate | profile 反映後 | — | main(無ガード) | V2 |
| **popup-entry.js:16347** snapshot 後汚染除去 | — | — | main(無ガード) | V2 |
| **popup-entry.js:16488** intercept merge | — | — | main(無ガード) | V2 |
| **popup-entry.js:16541** 自己投稿照合 | selfPosted 焼き込み | — | main+`nls_self_posted_recents`(無ガード) | V2(main だけ止める) |
| popup-entry.js:16632-16655 データのある配信の判定 | 絞り込み | main と index 併読 | — | 不変(新配信は main が消え軽くなる) |
| popup-entry.js:10634 祝祭 listener | onChanged newValue | — | — | 不変(A-4) |
| popup:8299 / marketing-export-entry.js:160 / comeview-entry.js:1302 / venueBar.js:3986・6441 | 表示・書き出し | chunk→main | — | 不変 |
| popup:19036-19234 backfillRemove* / background.js:935-992 | 起動時1回の汚染除去 migration | main | main | 不変(main を正本として読むのでなく残っている main を掃除) |
| background.js:57-85 `readAllCommentsForLiveLocal`(auto backup) | 5分周期バックアップ | **chunk 優先**、`seqs` 空のときだけ main | IDB | 不変 |
| `nls_auto_backup_state`(content:12664-12681, background:417-432・719-761) | メタ | main を読まない | — | 不変 |
| lib 系(prunableStorageKeys 他) | キー名の分類のみ | 読み書きしない | — | 不変 |

復元系で main を正本に読む箇所は grep の範囲では無い。

## B-2 V1: content:16075 の直読みを `readChunkedComments` へ
- 対象: content-entry.js `maybeFetchCommenterFollowingListBatchOnce`(16053-)。16069-16075 の `get([commentsKey, ...3キー])` から `commentsKey` を外し、`comments` を同ファイル 15969 と同じ `await readChunkedComments(lid, commentsKey, chunkGetMany)` の `rows` で作る。
- 不変: `collectNumericCommentersFromComments` 以降・30秒間隔・配信あたり上限・`nls_commenter_follow_live_<lv>` の書き方。get 回数 1→2。
- テスト: 新規 `src/lib/followingListReadsChunks.wiring.test.js`(関数本体を切り出して `readChunkedComments(` を含み `bag[commentsKey]` を含まない。content-entry.js 全体で `bag[commentsKey]` 出現0)。**変異確認**: 一時的に元へ戻して赤。

## B-3 V2: popup 4か所に `!commentsChunked` ガード
- :16347 → `commentsChunked ? Promise.resolve() : storageSetSafe({[key]: arr})`(15830 と同型)。
- :16487-16489 → `if (!commentsChunked && (merged.patched > 0 || profAfterIntercept.commentsPatched)) saveIc[key] = arr;`(15755-15760 と同型)。
- :16540-16548 → `storageSetSafe({ ...(commentsChunked ? {} : {[key]: arr}), [KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache } })`。
- :4944 → `runDeferredUserCommentProfileHydrate` は別関数で `commentsChunked` が見えない。ctx(16400-16412)に `mainWriteAllowed: !commentsChunked` を1項目足し、`if (prof.commentsPatched && mainWriteAllowed) save[commentsKey] = prof.arr;`。
- 司令塔の裏取り: 16347・16488・16541 は `refresh()`(14815-16610)の内側で、`commentsChunked`(15481)と同じ関数スコープ。
- 不変: 祝祭 listener・profile cache の書き(4946/15762/15832/16494)・`KEY_SELF_POSTED_RECENTS` の消費・既存ガード・`readHeavyFromStore`。
- 既知(現状と同じ・劣化ではない): チャンク配信では popup が焼いた `selfPosted` は chunk に永続化されない。
- テスト: 新規 `src/lib/popupMainKeyWritebackGuard.wiring.test.js`: popup-entry.js の `\[key\]: arr|save\[commentsKey\]|saveIc\[key\]|save\[key\]` の全出現を機械で拾い、各書き込み行の直前5行以内に `commentsChunked` か `mainWriteAllowed` の判定が無ければ赤(手で4件を列挙しない)。

## B-4 V3: content:15933 に `fromChunks` ガード
- `if (applied.patched > 0 && chunkRead.fromChunks !== true) save[commentsKey] = comments;`(`chunkRead` は15824で取得済み)。
- 「profile patch は表示時再適用で担保」は成立: popup は毎 refresh で `applyStoredCommentEntries`(15736-15776)が `allowWrite` に関係なく profile を当てる。comeview-entry.js:1652/1736・popup:12750・venueBar.js:6914- も同方針。content 自身も 12535-12544 で added 行にだけ適用し過去行は永続化しない方針(12682-12685)。15933 は v0.1.807 で読みをチャンク化したとき書きを揃え忘れた取り残し。
- 15930-15931 の `comments = applied.next` は save 以外に使われないが、消すのは別版。この関数は recordPathUntouched の指紋対象外(同 test:43-47)。
- テスト: 関数本体を切り出して `save[commentsKey]` の行が `fromChunks` を含む。

## B-6 V4: popup hydrate 専用経路の同値書き戻し停止(測定先行)
- 4945 の条件 `prof.cacheTouched || hydrated` の `hydrated` を、「この popup が upsert で true を得てから未書込」のフラグ `popupProfileMapHasLocalOnly` に置き換える。署名比較(330KB の JSON.stringify)は毎 refresh の CPU が増えるので使わない。
- 先に測る: 測定用ブラウザで popup 文書の `chrome.storage.local.set` をラップして profile キー set 回数と `hydrated` 由来割合を数える(出荷しない計器)。**3割未満なら V4 は出さない**。
- shard 化に進む基準: V4 後も profile 族のバイトが sidepanel 文書の oc 上位3に残り、かつ n の大半が content の実変化(新規 uid 到着)で説明できるとき。

## C. 機械的な完了判定と撤回基準
測り方: (a) 実機: 更新→視聴ページ F5→サイドパネル+状態画面→3分→まるごとコピー。使う値: 忙しさ台帳の文書別 `oc`、popup の「描き直しの内訳」の `storage_changed:*`、`nls_comment_write_mode_diag_v1`、記録件数と公式件数。(b) 測定用ブラウザ A/B: 旧/新を同じ配信で290秒、各文書の onChanged を族別に回数・バイトで数える。**n≥5**。`oc` は上位3族しか出ないので回数の判定は (b) を正とする。
全版共通の撤回: `nls_comment_write_mode_diag_v1.mode` が 'whole' になる/`wholeWrites` 増加/記録件数−公式件数が基準線より悪化/`recordPathUntouched.test.js` が赤。

| 版 | 完了判定 | 撤回基準 |
|---|---|---|
| V0 基準線 | v1698 で (a)(b) を取得。`nls_comments_*` n、profile n、記録/公式、selfShown(STORY_AVATAR_DIAG) | — |
| V1 | 配線テスト緑+変異で赤。(b) `nls_comments_*` n は基準線±20%(まだ止めないので減らないのが正)。`nls_commenter_follow_live_<lv>` の rows が3分で増える | `nls_commenter_follow_live_<lv>` が3分間更新されない(基準線では更新されていた配信で) |
| V2 | 配線テスト(ガード無し出現0)緑。(b) チャンク配信で popup 文書が受ける `nls_comments_*` n が3分で ≤2(基準線≈55/3分)。(a) oc 上位3から消える。描き直しの内訳に `storage_changed:nls_comments_*` 0。`chunkWrites` は増え続ける | selfShown が同一セッション内で基準線より減る/祝祭が出ない/HTMLレポート件数が記録件数と合わない/会場・コメビュの名前・サムネが欠ける(withAvatar・resolvedAvatar 低下) |
| V3 | (b) チャンク配信で `nls_comments_*` n = 0(全文書・3分)。配線テスト緑 | 名前/サムネの解決率低下 |
| V4 | 測定先行(上記)。出すなら (b) profile n が中央値で ≥3割減 | n=5 の中央値が基準線の範囲内→撤回。withAvatar・resolvedAvatar 低下→撤回 |

## D. 捨てた案と理由
祝祭 listener を ctail/cchunk の onChanged に付け替える(実入力は refresh 内で足りる・長さ基準の増分スキャンに別長さが混ざり誤爆)/停止条件に `liveChunkMigrated`(content のメモリ変数・4分岐とも true)/停止条件の厳格化(止める方向にしか変えないので不要)/4か所を4版に分ける(同じキーの通知で census が分離できない)/旧配信の main バックアップの削除・圧縮(データ消失の判断は人)/popup:16651 の main get 廃止(既に index 併読済み・新配信は自然に軽くなる)/profile の署名比較/profile shard 化の同時設計/ctail 同乗物の別 set 化(バイト不変・イベント増)/content:16075 を別関数と読み共有(3関数にまたがる)。

## E. 地雷と回避策
1. 新配信の最初の数秒は index が無く `commentsChunked=false`。従来どおり書く側に倒すので新しい重複は作らない(dedupe は `collectCommentNoKeys`+`mergeNewComments`)。V2 後も数回は通知が残る(判定 ≤2 の由来)。
2. index 破損/timeout 分岐(content-entry.js:11164-11193・11217-11232)は最初の追記まで index 無効→従来どおり main に書く。短い配列で main を潰すのは今の無ガード版の方が危険。
3. popup-entry/content-entry の置換は CRLF で空振り(既知)。配線テストは `\r\n`→`\n` 正規化(commentChunkModeFailOpen.wiring.test.js:35-38 と同じ)。
4. popup-entry.js は max-lines に張り付き: 既存行の条件追加と ctx 1項目だけで済ませ、新関数を足さない。
5. `oc` は上位3族だけ=消えた証明は (b) の族別回数を正にする。
6. 測定タブが症状を作る=(b) の前に余分なタブを閉じる。
7. 配線テストの登録表は手で書かず、書き込み行のパターンを機械で拾う。
8. 16541 の `KEY_SELF_POSTED_RECENTS` の消費は残す(止めると pending が TTL まで残り毎 refresh 照合し直す無駄)。
9. V3 は 15930-15931 を残す(整理は別版)。

## F. 未確認
1. 復元/インポート UI が `nls_comments_<lv>` へ直接書く・読む経路の有無(文字列を組み立てて作るキーは grep で拾えない)。
2. 速報の `nls_commenter_follow_v1+nls_comments_*+nls_profile_resolve_state_v1` が content:15933 由来か(15933 は `cacheTouched` のとき profile キーも同じ set に入るのにタグに無い=`TRIGGER_KEY_MAX` の切り詰めか別経路か)。
3. チャンク配信で popup 再オープン後に selfShown が落ちる現象が実機で起きているか(V2 で変わらない)。
4. `nls_commenter_follow_live_<lv>` の更新を状態速報から読めるか。
5. `npm run status:live` の出力に忙しさ台帳の `oc` が含まれるか(まるごとコピーには含まれる=statusExtrasBatch.js:134)。
6. V4 の効き(popup hydrate 由来が profile 通知の何割か)。
7. 旧配信(v0.1.509 以前に移行)の main バックアップが実機にどれだけ残り、既に潰れているか。
8. V2 後に広告/ギフトコメント演出が refresh 周期(最大450ms+refresh 時間)で遅れる可能性(理論上は不変・実機目視は未)。
