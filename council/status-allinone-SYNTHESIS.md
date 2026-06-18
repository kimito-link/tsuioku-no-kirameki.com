# status.html を「見れば直せる」集約画面に — 統合設計（SYNTHESIS・1案）

正本。会議(COUNCIL status-allinone・design・3/3 成功)＋**司令塔の実コード裏取り**。日付 2026-06-18。
会議: [status-allinone-answers.json](status-allinone-answers.json) / [log](status-allinone-log.txt) / お題 [brief](status-allinone-brief.md)

## 会議の結論（critic と diverge が独立に一致＝強い）
- **「あらゆる不具合が直せる」は幻想**。status.html の真の目的は
  **「直せる範囲(既知パターン)を即解決し、直せない範囲は『何が足りないか』として正直に提示」**。
  "直せる" の定義を **「ユーザー/AI が次に何をすればいいか迷わない状態」** に再構築する(deepseek + qwen3.5 一致)。
- 具体(qwen 案A) = **症状→原因→次の一手の「解決カード(Action Card)」を画面最上部に 1〜3 枚**。
  fastDiag/popupDiag を **既知パターン辞書**と照合し、一致したら「原因(推定)＋今すぐ取る行動」を出す。
  巨大 JSON・マインドマップは折りたたみのまま温存(捨てない・下に置く)。
- 具体(qwen 案B) = **取れない情報(SW/OS/DNS/メモリ)は「原因特定不可エリア=ブラックボックス」と明示**し、
  status からは実行できないが効く手動操作(拡張リロード・ブラウザ再起動 等)へ誘導。「不明」を隠さない。
- アンチパターン(全員) = ルールベースは万能でない/新バグは拾えない → 「未知は『既存ルール不一致』と分類し
  AI共有テキストへ優先付与」で割り切る。診断ロジックは純関数・軽量(if/パターンマッチ)に限定し 2 秒更新を壊さない。

## 司令塔の裏取り＝会議の前提を訂正（HOWTO §大事な前提）
⚠️ **会議は status の既存実装を知らない**(「診断エンジンを新規に `diagnostic-engine.ts`」と言うが):
- `src/lib/statusMindmapModel.js` が**既に症状判定(badge)を全部持っている**。取得率(pct)・withUidPercent・
  北極星 state・avatar・northStarRenderProbe・backfill stopReason・longTasks・多タブ汚染 を実データから
  🟢/🟡/🔴 に分類済み。**会議の言う「症状パターン辞書」は、この既存 model の出力を入力にした薄いルール層で足りる**
  (新規データ取得ゼロ・新規診断エンジン不要)。
- ∴ 正しい範囲 = **既存 model の上に「症状→原因→次の一手」辞書を1枚足し、最上部に解決カードを描く**だけ。
  TypeScript(.ts)でなく既存に合わせ JS(.js・src/lib)で。

## 結論（1案）= 「解決カード」層を既存マインドマップの上に薄く足す
**症状(既存 badge=warn/bad の枝)→ 原因(推定)→ 次の一手(具体行動)** を結ぶ純関数 `statusActionAdvisor.js` を新設。
status 最上部に「🩹 いま気になる点と対処」カードを重大度順に 1〜N 枚。既存資産は全部温存(下に折りたたみ)。

### 既知パターン辞書(実データに対応・裏取り済みの症状だけ載せる)
| 症状(検知条件・実 fastDiag/model 値) | 原因(推定) | 次の一手 | status で直せる? |
|---|---|---|---|
| 取得率 < 40%(officialRatePct) かつ 放送中 | backfill 追いつき中 or stalled | 「前面にして待つ・F5」/ 数分待つ | △(待ちで改善) |
| withUidPercent < 50% | DOM観測コメントに userId 乗らず(匿名主体) | NDGR 経由は仕様・匿名は識別子なし=正常 | ✕(原理的・不明と明示) |
| 北極星レーン state=ok だが count=0(空) | 描画 or 取得の詰まり | popup を開き直す/F5 | △ |
| northStarRenderProbe: started>0 & completed=0 | レーン描画が途中で throw | 拡張リロード→F5 | △ |
| avatarMapSize ≪ interceptMapSize | アバター取得が追いつかない | 時間経過待ち/F5 | △ |
| networkErrorProbe.ndgrConnectStatus≠connected | NDGR 接続断 | ブラウザ/拡張リロード(status からは不可=ブラックボックス) | ✕→手動誘導 |
| staleDomBundleSuspected | 多タブ/SPA 遷移の名残 | 不要タブを閉じる・watch を開き直す | △ |
| 視聴中の配信なし | watch 未オープン | ニコ生 watch を開く | ○ |

辞書は**実コードで裏取りした症状だけ**載せる(推測の症状を増やさない)。新症状は実データで確認してから1行足す。

### 5論点への回答
1. 幻想か → **幻想。境界を明示**: status で直せる=「次の操作が分かれば解決(待つ/F5/リロード/タブ整理/設定変更)」。
   直せない=コード修正・原理的制約(匿名 userId)・OS/ネットワーク=**「ブラックボックス」として正直に出す**。
2. 最小の仕組み = **既知パターン辞書(JSON相当の配列)＋ 重大度ソート**。AI診断エンジンは作らない(過剰)。
3. 既存を捨てず繋ぐ = 解決カードは既存 `statusMindmapModel` の枝(badge)を入力にする。詳細は下に温存(折りたたみ)。
4. 人とAIの両立 = **上=人向け(解決カード:症状→原因→一手・3枚まで)** / **下=AI向け(既存 AI共有まとめ:全データ)**。
   解決カードに該当しない症状は AI共有まとめに「未解決パターン」として付与(qwen の割り切り)。
5. 取れない情報 = SW/offscreen のメモリ実体・OS/DNS/プロキシ・他拡張干渉。これらは**「原因特定不可(status の外)」**と
   明示し、手動操作へ誘導。storage に出ていない値を推測で埋めない。
6. アンチパターン = ①万能AI診断エンジン ②全症状を盛る(人が読めない) ③storage write して直そうとする(read only 破る)
   ④推測を断定で出す(「不明」を隠す) ⑤新規重依存 ⑥既存マインドマップ/AI共有まとめの作り直し。

## 段階導入（退化最小・既存資産温存）
- **第1コミット**: 純関数 `src/lib/statusActionAdvisor.js` 新設＝`buildStatusActions(model/fastDiag/popupDiag)` が
  既知パターン辞書と照合し `{severity, symptom, cause, action, fixableHere}[]` を重大度順で返す。characterization test。
  まだ status に描画配線しない(挙動不変の土台)。
- **第2コミット**: status.html 最上部に「🩹 いま気になる点と対処」カードを描画(既存マインドマップの上)。
  該当0件なら「🟢 大きな問題は見当たりません」。詳細は従来どおり下に温存。
- **第3コミット**: 解決カード非該当の症状を AI共有まとめに「未解決パターン」セクションで付与＋ブラックボックス明示。

## 退化ガード（厳守）
- リードオンリー維持(storage write しない)・外部送信ゼロ・追加依存ゼロ・2秒更新を壊さない(純関数・軽量)。
- 既存 fastDiag/popupDiag/マインドマップ/AI共有まとめを捨てない・作り直さない(上に薄く足すだけ)。
- 辞書は実コードで裏取りした症状のみ(推測で症状を増やさない)。「不明」は不明と出す。
- 各コミットで verify:cc 全緑。
