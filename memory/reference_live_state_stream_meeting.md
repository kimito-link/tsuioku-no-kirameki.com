# reference: LiveStateStream(リアルタイム状態バス)設計正本

> 2026-06-14 全員集合会議(司令塔Fable風 + Codex gpt-5.5 + gpt-oss:20b + deepseek-r1:14b)。
> 星野ロミ氏ソース(surechigai-lite の liveMapBus/useLiveMapStream=状態を1本のストリームに集約
> して購読)を一次資料に、追憶へ「リアルタイム同期」を移植する設計。3者が核心で一致。
> 一次資料: [[reference_hosino_romi_server_cron_learnings]]。

## ⚠️ 着手前の絶対条件(会議P0・Codex/gpt-oss 一致)
**先に AGENTS.md へ「実装前ゲート(plan先行)」を入れ、その規律下で着手する。**
今セッションは「走りながら考える」で暴走しクラッシュもした。再発防止が状態バスより先。
Codex案の実装前ゲート(AGENTS.md 追記文・後述E)を最初に入れる。

## ⚠️ 着手前のもう一つの注意(衝突回避)
- 現在【別作業が進行中で未コミット大量変更】(会場へ VoicePlayer 統合・別窓映像・VOICEVOX接続修正
  =changelog 0.1.720〜725)。venueBar/comeview/content/popup/background が作業ツリーで変更中。
  → 状態バスは **これらの安定化・コミット後** に着手(でないと衝突)。
- Codex警告: 「IDB/offscreen 経路は実装済みだが実機問題で強制無効化中。ここに新機能を載せず先に
  安定化が必要」(offscreen-entry.js / content-entry.js:12825)。

## 会議の確定: LiveStateStream v1(サーバ不要・効き最大)

### 構成(Codex/gpt-oss 一致)
```
content scripts → runtime.Port → background LiveEventHub → subscriber Ports
                                                          → comeview / venue / popup / status
```
- background(SW)に LiveEventHub を1本。各 UI は runtime.connect で Port を張り購読。
- イベント形式を固定(Codex案):
  ```js
  { v:1, liveId:"lv...", seq:1234, emittedAt:..., type:"comment.added", source:"ndgr-live", payload:{} }
  ```

### 実装原則(Codex・採用)
1. **liveStateReducer.js を純粋関数**として作り、全UIが同じ状態遷移を使う(テスト必須)。
2. **storage.onChanged は設定/進捗/低頻度スナップショット専用**にする(高頻度はPort)。
3. コメント・ギフト・会場更新は Port で通知し、保存処理(IDB/chunk)とは分離する。
4. **seq 欠落を検知したら IDB/tail から再 hydrate**(イベント再送に依存しない=堅牢)。
5. 100ms または 50件単位で batch化(描画過多防止)。
6. ⭐**読み上げは chrome.storage.session に owner lease を置き、コメビュと会場の二重再生を防ぐ**
   (現状 comeview/venue が独立に _voiceReadingEnabled を持つ=二重再生リスク。lease で1owner化)。
7. owner だけが VOICEVOX 再生し、`voice.play_start` を配信して全画面の吹き出しを同期。

### 既存からの移行(Codex)
- 現在の会場は「定期poll + storage.onChanged 併用」(venueBar.js:1377 付近)。まずここを購読方式へ置換。
- Port は Chrome 公式の拡張コンポーネント間 長寿命メッセージング。

### イベント型(初版で扱う type)
- comment.added / gift.added / venue.seats_updated / voice.play_start / voice.play_end /
  health.snapshot。payload は型別に最小。

## G(最優先の着手)= LiveStateStream v1 の設計・導入
ただし順序は: ①AGENTS.md 実装前ゲート → ②別作業の安定化・コミット → ③状態バス着手。

## 会議の他の確定(優先順・後続)
- **P1 ヘルスチェック一括化**: status.html を全機能の健康診断画面へ(総合/取得/backfill/ランタイム/
  保存/profile/ストリーム/読み上げ/会場)。通常は保存済み診断値だけ読む軽量モード・「詳細診断」
  押下時だけ SW/VOICEVOX を能動 ping。既存4指標は残しその上に総合診断。
- **P2 dryRun backfill**: 「試算→実行」。試算も全取得しない=ローカルの(公式件数 − 保存unique件数)
  + 最大3区画/2秒/1MB の probe fetch で「予想1,800〜2,600件・1〜3分・10〜25MB」を範囲表示。
  view-uri有効性/疎区間/429/上限リスクも表示。実行は30秒有効 previewToken + runId で冪等化。
  自動backfill も内部試算を通し、取得率98%以上/残20件以下ならスキップ。
- **P2 ティア・クールダウン**: profile解決/backfill再試行/429対策へ「段階的に条件を緩める+クール
  ダウン」を適用(星野ロミの matcher ティア制)。
- **P3 冪等スキーマ**: IDB を「必要ストア・index を ensure」する方式へ(冪等DDLの発想)。
- **維持 決定的アバター**: 現行(seed合成)維持+seed互換テストだけ追加。
- **F サーバcron化は今は非推奨**(Codex): view-uri はwatchセッション由来でサーバ正規再取得の保証
  なし。まず現行SW backfill+staging で「タブ閉鎖後も継続」を完成→Railwayで20放送だけ技術検証
  (view-uri TTL/IP拘束/cookie要否)→規約・著作権確認→不成立ならサーバは「拡張から受け取った
  データの保存・同期」に限定。Railway/Vercel Cron は制御面向き(長時間crawl本体には使わない)。

## E. AGENTS.md 追加案(実装前ゲート・Codex案・最初に入れる)
```md
## 実装前ゲート
- 複数ファイル、状態管理、storage、messaging、backfill、権限変更は必ず Plan 先行。
- 探索中は Read/rg/git diff のみ。Plan が承認されるまで編集・build・version bump を禁止。
- Plan には目的、非目的、変更ファイル、状態遷移、失敗時 rollback、検証手順を書く。
- Plan にないファイル変更が必要になった時点で停止し、Plan を更新する。
- 実装は小さい単位で行い、各単位ごとに対象 test を実行する。
- test/typecheck/build が壊れたら追加実装を停止する。無関係な修正へ広げない。
- dist生成、version bump、commit、push、Chrome reload は明示依頼後に行う。
- クラッシュ後は git diff と承認済み Plan を読み直し、推測で作業を再開しない。
例外は「1ファイル・10行未満・挙動不変」の文言修正だけ。
```

## 他AIの知見(web-health-check-app へ星野ロミ知見移植・テスト18緑)=追憶にも転用候補
- キャラ吹き出し(りんく/こん太/たぬ姉=追憶と同じ3キャラ)でヒント/オンボーディング。
- ⭐**Xシェア修正**: x.com/intent/post に統一(旧 twitter.com/intent/tweet 廃止)+押下前に
  クリップボードへ本文+URLコピー(空白composer対策)。対象 share-bar.js 等=追憶にもある→直接適用可。
- 診断結果シェア行(🐦シェア/📋コピー・URL は /?target=ドメイン 形式)。
- エラー表示を日本語で理由明示(タイムアウト等)。
- 共有URLを URLバーに残す(?target= 維持→ブックマーク/シェア可)。
