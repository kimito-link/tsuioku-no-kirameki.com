---
name: reference_broadcaster_reputation_check_from_dns_osint
description: dns-osint-pro の資産を「追憶のきらめき」に流用する設計正本。配信者の評判チェック機能(サジェスト汚染検出)+ツール資産(スクショ自動撮影/MCPテンプレ/3キャラ演出)の移植計画とPR分割
metadata:
  node_type: memory
  type: project
---

# dns-osint-pro → 追憶のきらめき 流用設計(2026-06-07 会議)

## 0. 出発点

ユーザー指示:
> `dns-osint-pro-ver2.0` を全部解析して、追憶のきらめきに**活かせる部分を全部**取り入れたい。
> **配信者の評判チェックも**(やりたい)。

- 両拡張は **同じ作者・素 Vanilla JS・MV3・同じ3キャラ(りんく/こん太/たぬ姉)** → 移植障壁ほぼゼロ
- 既存 [[reference_osint_strategy_socialxup_chikuran]] の OSINT 戦略に「配信者の外側=公開情報の評判チェック」が欠けていた → 今回がその欠けピース
- dns-osint パス: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\dns-osint-pro-ver2.0`

## 1. 解析で確定した「実在する」流用資産(推測でなく find で検証済み)

### A. 機能資産(配信者の評判チェックの核)
| ファイル | 中身 | 流用価値 |
|---|---|---|
| `src/features/suggest/negative-keywords.js` | **chrome依存ゼロの純関数**。NEGATIVE_KEYWORDS(high/medium/low)+ NEUTRAL_CONTEXT_PATTERNS(誤検知対策・「迷惑メール対策」等を除外)+ detectNegativeKeyword / analyzeNegativeSuggests / getOverallRiskLevel / checkNegativeDomain。v8.4.29まで誤検知チューニング済 | ◎◎◎ ほぼ無改変で追憶 lib へ |
| `background.js` のサジェスト取得群 | fetchGoogleSuggest(suggestqueries.google.com・CORS無)/ fetchYahooSuggest(HTML パース版)/ fetchBingSuggest 等 | ○ host_permissions追加要 |
| `src/features/suggest/keyword-expansion.js` | サジェスト語の展開ロジック | ○ |
| `src/components/domain/ReputationAlert.js` | 風評アラートの3キャラUI(HTML文字列返却) | ○ 営業CTAは追憶用に差替/削除 |

### B. ツール資産(開発・出品が楽になる)
| ファイル | 中身 | 流用価値 |
|---|---|---|
| `capture-store-screenshots.mjs` | Playwright で 1280×800・**DSF=1固定**(Web Store要件)・details全開・5等分スクロール撮影 | ◎ URL差替だけ |
| `capture-promo.mjs` | プロモ画像撮影 | ◎ |
| `mcp-devtools-template.js` | CONFIG差替だけで動く汎用DevToolsMCPテンプレ(console/network/error監視) | ◎ |
| `dev-helper.js` | Puppeteer CLI(launch/openPage/監視/popupテスト) | ○ |
| `src/` モジュール分割構造 | components/features/constants/utils。config.js は **SW二重読込ガード**(globalThis.OsintConstants) | ○ 巨大entry.js分割の手本 |
| `src/features/report/html-report-generator.js` | 画像base64埋込・単一HTML自己完結・imageToDataUri | ○ |

### C. キャラ資産
- `src/constants/chars.js`(キャラ色/bgColor) `src/constants/verdict.js`(safe/mild/caution/danger 4段グラデ)
- `src/yukkuri-charactore-english/{link,konta,tanunee}/*.png`(まばたき/口開閉パーツ画像・英語名)
- 注: 追憶は既に3キャラ実装済。**色/セリフ設計とlevel→キャラ自動割当ロジック**が流用本命

## 2. 「配信者の評判チェック」機能設計(会議結論)

### コンセプト
追憶が既に握っている配信者情報(`nls_last_watch_url`・コミュ名・配信者ニックネーム)を使い、
Google/Yahoo/Bingサジェストを引いて「配信者名で検索したとき変なワードが出ないか」を検出。
3キャラが結果を案内。OSINT戦略の「配信者の外側=公開情報」を埋める。

### 3視点会議の結論

**視点1: 機能設計**
- 入力 = 配信者の表示名/コミュ名(追憶が既に持つ)。手動入力欄も用意
- 処理 = サジェスト取得 → detectNegativeKeyword で level判定 → getOverallRiskLevel
- 出力 = safe/low/medium/high の4段。high/mediumで3キャラアラート(りんく警告/こん太助言/たぬ姉深刻)
- **追憶ならではの付加価値** = コメントから拾った配信者本人発言と外部評判の突合(将来)

**視点2: プライバシー・規約(最重要・追憶の根幹)**
- ✅ OK: 検索サジェストは**公開情報**。OSINT正規行為([[reference_osint_strategy_socialxup_chikuran]] §4準拠)
- ⚠️ 注意: ネガKW検出は**配信者本人の自己診断ツール**として位置づける(第三者を晒す道具にしない)
- ⚠️ 営業CTA(リバースハック/LINE誘導)は dns-osint 固有 → **追憶は非営利方針** → **CTAは全削除**して持ち込む
- ⚠️ NEGATIVE_DOMAINS(5ch/爆サイ等への誘導リンク)は追憶に**入れない**(誹謗中傷サイトへの導線になるため・OSINT戦略の「侵襲的特定NG」に抵触)
- → **持ち込むのは detectNegativeKeyword の判定ロジックのみ。晒し系UIは持ち込まない**

**視点3: 実装アーキ(baseline尊重)**
- AGENTS.md: v0.1.592 baseline尊重・content-entry不触・MEMORY更新はClaude本体専用
- 純関数は `src/lib/<name>.js` + `<name>.test.js` 必須(既存 lib の確立パターン)
- manifest host_permissions に suggest系ドメイン追加 → **Chrome Web Store審査に影響** → 申請文言で用途明記要
- サジェスト取得は background.js(SW)に集約・popup/sidepanelはmessage passing

## 3. PR分割(小さく安全に・1PR=即commit+push)

### Phase R(評判チェック)
- **PR R1**: `src/lib/broadcasterReputationKeywords.js` ← negative-keywords.js の判定純関数を移植
  + `.test.js`(誤検知ケース「迷惑メール対策」「失敗しない選び方」等を含む・dns側の実績ケース流用)
  + **NEGATIVE_DOMAINS と営業CTAは移植しない**。detectNegativeKeyword/analyzeNegativeSuggests/getOverallRiskLevel のみ
  + content-entry不触・UIなし=baseline影響ゼロ。ここから着手
- **PR R2**: background.js にサジェスト取得追加(Google/Yahoo/Bing)+ message handler。host_permissions追加。lib `suggestFetch.js`+test
- **PR R3**: popup/sidepanel に評判チェックUI(3キャラアラート・CTA無し版)。verdict色は追憶トークンに合わせる
- **PR R4**: 配信者名の自動取り込み(nls_last_watch_url等から)+ TTLキャッシュ

### Phase T(ツール資産・評判と独立して進められる)
- **PR T1**: `scripts/capture-store-screenshots.mjs` 移植(popup.html→追憶のpopup.html・セレクタ調整)。Web Store出品直結
- **PR T2**: `scripts/mcp-devtools-template.js` 移植(CONFIG=追憶の拡張パス)
- **PR T3**: capture-promo.mjs 移植

## 4. 触らないもの / 持ち込まないもの(明示)
- ❌ NEGATIVE_DOMAINS(誹謗中傷サイト誘導)
- ❌ 営業CTA(リバースハック/LINE/@reph・dns固有の収益導線)
- ❌ RDAP/DNS/WHOIS/WordPress版数チェック(追憶に無関係)
- ❌ content-entry.js(AGENTS.mdルール)
- ❌ 取得堅牢化テク(追憶は既にv0.1.662まで7真因根治済・708件/秒・100%完走=今さら不要)

## 5. 着手順(推奨)
1. **PR R1**(判定エンジン+test)= 最小・最安全・即着手可
2. **PR T1**(スクショ自動撮影)= Web Store出品に直結・評判と独立
3. R2→R3→R4 で評判チェックを段階完成
4. 各PRで npm run verify 全緑確認 → commit/push

## 6. 別ブランチ運用
- 現ブランチ `fix/koken-contrib-hidden-tab-stuck` は並列backfillの残課題用
- 評判チェックは**別ブランチ** `feature/broadcaster-reputation-check` を切る(混ぜない)
