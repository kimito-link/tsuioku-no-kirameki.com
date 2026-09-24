---
name: codex 並列開発の干渉回避ルール（マーケ分析 HTML 担当）
description: codex がマーケ分析 HTML レポートを担当、Claude は拡張本体を担当。お互いの領域に手を出さない。詳細指示書は docs/codex-marketing-analytics-brief.md
type: reference
originSessionId: claude-code-2026-05-07-codex-rules
---

> 📌 2026-07-05 復元: 旧メモリディレクトリのバックアップ（projects.pre-fix-20260629-200041.bak）から復元。
> 役割分担は AGENTS.md §11.2 と一致（正本は AGENTS.md）。ブランチ戦略のみ現行運用に更新済み。

## 役割分担

| 担当 | 領域 |
|---|---|
| **Claude** | 拡張本体（content-entry.js / popup-entry.js / page-intercept-entry.js / ndgr / gift / ranking / inline panel / story / mcp / 拡張 manifest / changelog / dist） |
| **codex** | マーケ分析 HTML レポート（`src/lib/marketing*.js` / `broadcast*.js` / `yukkuriBroadcastSummary.js` / `mangaBroadcastSummary.js` / `geminiBroadcastSummary.js` / `giftTimelineHtml.js` 等） |

詳細は [docs/codex-marketing-analytics-brief.md](../docs/codex-marketing-analytics-brief.md) を参照。

## Claude が触ってはいけない codex 領域

```
src/lib/marketing*.js / .test.js
src/lib/broadcast*.js / .test.js
src/lib/yukkuriBroadcastSummary.js / .test.js
src/lib/mangaBroadcastSummary.js / .test.js
src/lib/geminiBroadcastSummary.js
src/lib/giftTimelineHtml.js
src/lib/broadcastNarrativeBuilder.js 等
docs/marketing-*.md / docs/codex-*.md
tests/e2e/marketing*.spec.js
```

これらに必要な変更があったら、**codex に依頼する形で memory/reference に書く**。直接編集しない。

## codex が触ってはいけない Claude 領域

拡張本体ロジック（content-entry / popup-entry / page-intercept / ndgr / gift / ranking 系 lib）と、Claude 管理の release 周り（manifest, changelog, package.json の version, extension/dist）。

## 共有領域（変更は事前合意）

- `package.json` の dependencies
- `eslint.config.js` / `tsconfig.json` / `vitest.config.js`
- `scripts/build.mjs` / `scripts/verify-bump.mjs`
- `tests/e2e/` の共通 fixture

## ブランチ戦略（2026-07 現行）

- Claude Code（司令塔）がブランチを作成し、codex はそのブランチ上で commit まで（**push はしない**）
- version bump・dist・push・PR は Claude が後処理（AGENTS.md §11.5 ハンドオフ手順）

## v0.1.193 衝突の教訓

過去に codex の v0.1.193 working changes が uncommit のまま残り、Claude の v0.1.195 push と整合しない問題が発生した。今後は本ルールで干渉を物理的に防ぐ。

## codex への 4 機能リクエスト（2026-05-07 ユーザー要望、訂正版）

1. **Gemini Nano（Built-in AI）連携**でオンデバイス AI 分析
2. **配信間比較**（自配信 + **他配信者の配信** 両方、kimito さんがローカル storage に保存済の範囲内で完結、視聴者 uid はハッシュ化）
3. **ギフトアイテムタイミング表示**（gift timeline、SVG inline）
4. **配信内容の描写**（テキスト集計 + Gemini 自動サマリ、ただし**動画/音声/画面キャプチャは絶対不可**）

### よくある誤解の注意

- ❌ 誤解1: 「他配信者の配信は比較対象外」→ ✅ 正: kimito さんが視聴して記録した配信なら自配信も他配信も全部比較対象
- ❌ 誤解2: 「描写機能は録画機能だから不要」→ ✅ 正: 描写機能（テキスト集計 + AI サマリ）は **必須**、録画機能（メディア保存）が **不可**
- ❌ 誤解3: 「録画 NG なので画像も全部 NG」→ ✅ 正: avatar URL（公開画像）の表示は OK、プレイヤー画面のキャプチャは NG

詳細は [docs/codex-marketing-analytics-brief.md](../docs/codex-marketing-analytics-brief.md) 参照。

## ⚠️ codex 直叩きの実務知見（2026-05-26 Phase C で確立）

- **コマンド**: `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "$(cat brief)" > out.md 2>&1` を `run_in_background:true`。codex CLI は **0.128.0** 動作確認済み。**ブリーフに「探索だけで終わらず実際にコード+テストを書いて commit せよ」と明示**すると、過去の「探索のみで prose 合成を出さない癖」を回避でき、1回で実装+test+commit まで完走した実績あり（marketingChartsHtml に sectionEventRanking 実装）。**push はさせない**（Claude が版bump+dist込みで後処理）。
- 完了検知: `git rev-parse HEAD` がブリーフ前と変わる or codex プロセス(PID)消滅を `run_in_background` の until ループで待つ。
- ⭐⭐**CRLF 混在の罠（必ず後始末）**: codex は**新規/編集行を LF で書く**。リポジトリの一部ファイル（例 `src/lib/marketingChartsHtml.js`）は **CRLF** なので、codex 編集後に `file <path>` が「with CRLF, LF line terminators」=混在になり、git diff が全行 flip で膨張する（実例: 178 changed のうち実質114だけが本物）。**対処**: codex commit を確認したら `node -e "s=fs.readFileSync(p,'latin1').replace(/\r/g,'').replace(/\n/g,'\r\n');fs.writeFileSync(p,s,'latin1')"` で元の CRLF に正規化 →`git commit --amend --no-edit`(未push時)。latin1 は byte 保存なので UTF-8(日本語/絵文字)を壊さない。リポ全体の標準は LF だが marketingChartsHtml.js は歴史的に CRLF だった＝**触る前に `file` で元の EOL を確認**。
- レビュー: codex commit は **必ず `git show --name-only` で縄張り逸脱(popup-entry/manifest/dist 等に触ってないか)を確認**してから受け入れる。
