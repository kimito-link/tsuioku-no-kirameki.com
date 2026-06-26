# 会議 統合結論 — 状態速報1枚で「純Webコピーの抜け漏れ」が全部分かる自己診断

> お題: `council/status-self-diagnoses-all.txt` / 会議: COUNCIL_QUALITY=1・4メンバー
> 生データ: `council/status-self-diagnoses-answers.json` / 司令塔(Opus)が実コード裏取りで統合

## 会議の一致点
- 載せる項目リスト（私の原案11項目）は4メンバーとも妥当と判定。漏れの追加指摘あり（下記）。
- **順序: 自己診断が先で正しい**（全員一致）。これが入れば根本問題（丸ごと一致）を事実ベースで議論できる。
- セクションは専用見出し「### 純Web公開コピーの自己診断」を立て、致命的なものは既存
  「症状→原因→次の一手」カードにも昇格させる（二段構え）。

## 批判役(qwen3-32b)の見落とし指摘 → 司令塔の裁定

| 指摘 | 採否 | 理由（実コード裏取り） |
|---|---|---|
| jsonBlob のハッシュ照合で「破損/順序逆転/null埋め」を検知 | **却下** | 鏡は同一プロセスで jsonBlob に積んだ瞬間の値＝POST と byte 同一(`publishLiveViewPublishPayload` が「drift ゼロ」明言)。順序/cap は restore テストで担保済み。ハッシュは過剰。**ただし核心(中身が空でないか)は「非nullで件数を数える」で吸収する。** |
| POST の成功/失敗を **HTTPステータス込み**で記録 | **採用** | `uploadStatusSnapshot` は `{ok,error:"HTTP 502"}` を返すが**どこにも残らない**（ボタン押下時のローカル変数）。globalThis 集計で記録すれば状態速報に出せる。 |
| 公開キーは ingestKey **と** viewToken の**両方**揃っているか | **採用** | `getUploadConfig` は両方読む。片方欠けで送信失敗。両方の有無を別々に出す。 |

## diverge(qwen3.6) の発想 → 採用（軽量版）
「データ羅列でなく **render path trace**＝各 paint が発火するか・前提条件を満たすか」。
→ 純Webの `paintAllMirrors` の各 paint の発火条件（鏡が非null＆件数>0）を診断に落とし込む。
　 ＝「この鏡は純Webで描かれる/スキップされる」を予測表示する。フル DSL 化はしない（過剰）。

---

## 載せる項目の最終リスト（抜け漏れチェック済み・優先度つき）

### P0（致命＝症状カードにも昇格）
1. **公開キー**: ingestKey 有無 / viewToken 有無（両方無いと純Webに何も届かない）
2. **直近POST**: 成否・HTTPステータス・何秒前か（送ってない/失敗＝純Webは古い snapshot を見続ける）
3. **整合チェック**: 拡張側の生データ件数（fastDiag 北極星レーン apiRows 等）vs 鏡の件数。
   不一致＝「コピー漏れ／積み忘れ」を明示。
4. **liveId 一致**: 全鏡の liveId が「いま視聴中の lv」と一致（別配信の古い鏡混入を検知）

### P1（事実列挙・「描かれるか」予測込み）
5. **各鏡の有無＋鮮度**: laneMirror/statCardsMirror/northStarMirror/topSupporters それぞれ
   有無・capturedAt/savedAt 経過秒（3分超＝古い＝popup未起動疑い）
6. **laneMirror**: バケツ別**非null**件数（りんく/こん太/たぬ姉/ギフト/広告）と合計 →「純Webで描画される/空」
7. **northStarMirror**: contributionRanking 非null件数 / adRanking 非null件数 →各レーン「描画/空」
8. **statCardsMirror**: 記録/同接/来場が値ありか（null/—でないか）
9. **topSupporters**: 件数・liveId

### P2（容量・健全性）
10. **jsonBlob サイズ**: KB と 512KB cap に対する% （肥大で送信落ちの予兆）

---

## セクション構造（buildAiShareFullText 内）
```
### 純Web公開コピーの自己診断
公開設定: ingestKey ✅ / viewToken ✅
直近の公開送信: ✅ 12秒前 (HTTP 200)   ← or 🔴 未送信 / 🔴 HTTP 502 (45秒前)
対象配信: lv350832402 （鏡 liveId が一致 ✅）

鏡の中身（純Webに送られる当のデータ）:
- 応援レーン(laneMirror): りんく3 / こん太1 / たぬ姉2 / ギフト0 / 広告0  計6  鮮度8秒  → 純Webで描画
- 数字カード(statCardsMirror): 記録2189 / 同接— / 来場1583  鮮度8秒  → 同接が空
- 北極星(northStarMirror): 貢献度6 / 広告0  鮮度8秒  → 広告レーンは空(元データ無し)
- 応援者ランキング(topSupporters): 5件  鮮度8秒  → 純Webで描画

整合チェック（拡張の生データ vs 鏡）:
- 北極星 貢献度: 拡張 apiRows=6 / 鏡 6  ✅一致
- 北極星 広告: 拡張 apiRows=0 / 鏡 0  ✅一致（元データ無し＝純Webに出なくて正常）
jsonBlob サイズ: 131KB / 512KB (26%)
```
致命項目（キー未設定・未送信・件数不一致・liveId 不一致）は既存の
「### 検知された対処候補」にも 🔴/🟡 カードとして出す（症状→原因→次の一手）。

## lib 分割（純関数・テスト必須・status を太らせない）
新規 `src/lib/liveviewPublishSelfDiag.js`:
- `buildLiveviewPublishSelfDiag({ jsonBlob, fastDiag, currentLiveId, publishKeys, lastPost })`
  → 構造化オブジェクトを返す（有無/件数/鮮度/整合/サイズ/キー/POST）。**read は一切しない**
   （渡された jsonBlob と引数だけから組む）。非nullカウンタ・3分鮮度・apiRows突合を内包。
- `formatLiveviewPublishSelfDiagLines(diag)` → 上記テキスト行配列（buildAiShareFullText が push）。
- `liveviewPublishSelfDiagToActionCards(diag)` → 致命のみ症状カード配列（buildStatusActions が結合）。

## POST 記録（globalThis 集計＝read を増やさない・commentSubmitDiag と同方式）
新規 `src/lib/liveviewPublishOutcome.js`:
- `recordLiveviewPublishOutcome({ ok, httpStatus, at })` / `summarizeLiveviewPublishOutcome()`。
- `uploadStatusSnapshot` の成功/失敗の両分岐で record を呼ぶ（既存戻り値は不変）。

## 最小ブラスト半径
- 新規: `src/lib/liveviewPublishSelfDiag.js`(+test) / `src/lib/liveviewPublishOutcome.js`(+test)
- `status-entry.js`:
  - `buildAiShareFullText` の引数に jsonBlob 系（laneMirror/statCardsMirror/northStarMirror/topSupporters）
    と fastDiag/currentLiveId/publishKeys/lastPost を**渡す**（呼び出し側で既に手元にある）。
  - fastDiag JSON の直前に self-diag セクションを push（約8行のフック）。
  - `buildStatusActions` に致命カードを結合（約3行）。
  - `uploadStatusSnapshot` の両分岐に record 1行ずつ。
- **触らない**: content/会場/popup refresh/paint/純Web本体/api。新規 storage read ゼロ。

## リスクと潰し方
- **status 重くなる**: 渡すのは既に手元の jsonBlob＝**新規 read ゼロ**。純関数は ms 未満。
- **NL_RELEASE で生診断を隠す挙動**: self-diag は「公開コピーの健全性」＝運用情報で生ログではない。
  ただし安全側に倒し、生 JSON と同様 release では隠す（hideDevDiagnosticsIfRelease 準拠）か、
  キー値そのものは出さず有無(✅/🔴)だけ出す（批判役のセキュリティ指摘＝キー文字列は出さない）。
- **fastDiag の apiRows パスが将来変わる**: 整合チェックは「取れたら突合・取れなければスキップ(沈黙)」
  のフェイルソフト。鏡側件数は常に出す。

---
*会議: 2026-06-26 / 統合: Opus(実コード裏取り) / 次: 実装(自己診断が先・根本=丸ごと一致は後続)*
