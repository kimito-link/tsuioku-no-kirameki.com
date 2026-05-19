# Claude Codeで正確な情報を確実に取得するための調査メモ

確認日: 2026-05-08

## 目的

Claude Codeに調査を依頼するとき、推測や記憶だけの回答ではなく、一次情報・公式情報・複数ソース確認に基づいて正確な結論を出させるための運用指針を整理する。

## 結論

Claude Codeには、単に「ディープリサーチして」と言うより、次の4点を明示するのが有効。

1. 実装前に調査だけする
2. 一次情報・公式情報を最優先する
3. 根拠URL・確認日・信頼度を必ず出す
4. 不明・未確認・矛盾を隠さない

さらにClaude Code公式機能としては、以下を組み合わせると調査品質を上げやすい。

- Plan mode: 編集前に調査・計画だけさせる
- Subagents: 調査担当を分けて文脈汚染を減らす
- CLAUDE.md: 調査ルールを永続化する
- Hooks: 「調査なしで実装する」などをブロックする

## 確実に言えること

### 1. Claude Code公式は編集前のPlan modeを案内している

Claude Code公式ドキュメントでは、変更をディスクに触れる前にレビューしたい場合はPlan modeを使う、と説明されている。

調査だけをさせたい場合の指示例:

```md
実装はしないでください。Plan modeで調査と計画だけしてください。
```

### 2. 大きな調査はSubagentsに分けるのが公式案内と合う

Claude Code公式ドキュメントでは、大きなコードベース探索などでメイン文脈を汚したくない場合、Subagentsに調査を委任できると説明されている。

正確性を狙う場合は、15役割を「答えを増やすため」ではなく「確認観点を分けるため」に使うのがよい。

例:

- 公式情報担当
- GitHub / リリースノート担当
- 規約・法務担当
- 料金・制限担当
- 競合調査担当
- 批判レビュー担当
- 統合担当

### 3. CLAUDE.mdは永続的な行動指示に使える

Claude Code公式ドキュメントでは、プロジェクトで毎回使う指示はCLAUDE.mdに書く運用が説明されている。

調査ルールを毎回使いたい場合は、長文全部ではなく短縮版をCLAUDE.mdに入れるのが現実的。

### 4. 強制したいならHooksが必要

CLAUDE.mdは行動指針であり、完全な強制ではない。Claude Code公式ドキュメントでは、特定タイミングで必ず実行したい処理やブロックしたい処理はHooksを使うと説明されている。

例:

- 実装前に調査計画がない場合は止める
- Edit / Writeの前に確認を出す
- 危険コマンドをブロックする

## 可能性が高いこと

### 15役割方式は「正確性」より「抜け漏れ防止」に効く

15個のAI風ロールは、真偽判定そのものよりも以下に効く可能性が高い。

- 調査観点の抜け漏れを減らす
- 公式情報、料金、規約、リスクなどを分担する
- 最後に批判レビューで過剰断定を減らす

したがって、Claude Codeに渡す指示では次の考え方がよい。

```md
15役割は「答えを増やす」ためではなく、「確認観点を分ける」ために使ってください。
最終結論は、根拠の強さで統合してください。
```

## Claude Codeに渡す最終版プロンプト

```md
実装はしないでください。まず調査だけしてください。

目的:
正確な情報を確実に取得することです。推測や記憶だけで断定せず、一次情報・公式情報・複数ソース確認に基づいて結論を出してください。

## 最重要ルール

- 未確認のことは「未確認」と書く
- 不明なことは「不明」と書く
- URL、仕様、料金、制限、規約、API仕様を想像で作らない
- 古い記事だけで最新仕様を判断しない
- 出典なしで料金・制限・規約を書かない
- 調査前に実装を始めない
- ユーザーが頼んでいないコード変更をしない

## 情報源の優先順位

1. 公式ドキュメント
2. 公式GitHub / リリースノート
3. 公式ブログ / 公式FAQ
4. 標準仕様 / 論文 / 行政資料
5. 信頼できる技術記事
6. 個人ブログ / SNS / 掲示板

## 各重要主張の出力形式

- 主張:
- 根拠URL:
- 根拠の該当箇所:
- 確認日:
- 信頼度: 高 / 中 / 低
- 未確認点:

## 調査手順

1. まず質問を分解してください。

- 何を知りたいのか:
- 何を決めたいのか:
- 必要な情報:
- 最新性が必要な情報:
- 規約・法務確認が必要な情報:

2. 日本語と英語で検索クエリを作ってください。

日本語:
- ...

英語:
- ...

3. 公式情報から確認してください。
公式情報が見つからない場合は「公式情報は見つからなかった」と明記してください。

4. 重要な情報は複数ソースで確認してください。

特に以下は必ず確認してください。

- API仕様
- 料金
- 利用制限
- 法律・規約
- Chrome拡張 / Web Store ポリシー
- セキュリティ関連
- ライブラリの最新仕様

5. 情報が矛盾した場合は、以下の形式で整理してください。

- 情報A:
- 情報B:
- どこが矛盾しているか:
- どちらが新しいか:
- どちらが公式に近いか:
- 採用する結論:
- 採用理由:

## 15役割ディープリサーチ方式

以下の15役割で、同じテーマを別角度から調査してください。
15個のAI APIを使う必要はありません。15人の専門家ロールとして思考を分担してください。

1. 検索戦略AI
   - 最適な検索語、調査順序、調査範囲を設計する

2. 一次情報AI
   - 公式ドキュメント、規約、仕様、リリースノートを探す

3. GitHub / リリースノートAI
   - GitHub、CHANGELOG、Issue、Pull Request、リリースノートを確認する

4. 競合調査AI
   - 類似サービスや既存実装の事例を調べる

5. 技術実装AI
   - API、ライブラリ、構成、実装方法を調べる

6. コスト分析AI
   - 料金、APIコスト、運用コストを調べる

7. 制限・レートリミットAI
   - 利用制限、クォータ、レート制限、上限を調べる

8. 精度重視AI
   - 誤情報、古い情報、根拠不足を検出する

9. 日本語情報AI
   - 日本語圏の情報、国内事情、法令、利用者文脈を調べる

10. 英語情報AI
   - 英語圏の公式情報、最新技術、海外事例を調べる

11. 実務活用AI
   - 実際に使える手順・運用フローに落とす

12. リスク分析AI
   - 法務、規約、プライバシー、セキュリティリスクを確認する

13. ツール選定AI
   - 使えるAPI、検索ツール、LLM、DB、ライブラリを比較する

14. 批判レビューAI
   - 他の結論の弱点、抜け漏れ、過剰な断定を指摘する

15. 統合AI
   - 全員の知見を統合し、重複・矛盾・確度を整理する

## 最終出力フォーマット

# ディープリサーチ結果

## 1. 結論
短く結論を書く。

## 2. 確実に言えること
根拠が強い情報だけを書く。

## 3. 可能性が高いこと
複数根拠はあるが、完全には断定できない情報を書く。

## 4. 追加確認が必要なこと
未確認・不明・要検証の項目を書く。

## 5. 根拠一覧
各主張に対応するURLと確認日を書く。

## 6. 矛盾・注意点
情報源ごとの違いや古い情報の可能性を書く。

## 7. 実行手順
ユーザーが次に何をすればよいか、順番に書く。

## 8. 参考にしなかった情報
信頼性が低い、古い、根拠が弱い情報があれば理由つきで除外する。
```

## CLAUDE.mdに入れる短縮版

毎回使うなら、長文より以下をCLAUDE.mdに入れる方が現実的。

```md
## Accurate research policy

When asked to investigate, do not implement first.

- Prefer official docs, official GitHub, release notes, standards, and primary sources.
- Do not invent URLs, specs, pricing, limits, policies, or API behavior.
- Mark unknowns as unknown and unverified claims as unverified.
- For important claims, include source URL, checked date, and confidence.
- Cross-check fast-changing facts such as API specs, pricing, limits, legal/policy, security, and Chrome Web Store rules.
- If sources conflict, describe the conflict and explain which source is newer or more authoritative.
- Use specialist perspectives: search strategy, primary sources, GitHub/releases, technical implementation, cost, limits, accuracy, Japanese sources, English sources, practical use, risk, tools, system design, critical review, and synthesis.
```

## Hooksで強制する場合の考え方

「調査だけ」と言っているのに編集を始めるのを防ぎたい場合は、Claude CodeのPreToolUse hookでEdit / Writeを止める設計が使える。

概念例:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-edit-during-research.sh"
          }
        ]
      }
    ]
  }
}
```

注意:

- Hooksは設定変更が必要。
- まずはCLAUDE.mdに短縮版ルールを入れるのが簡単。
- 強制力が必要になってからHooks化するのがよい。

## 根拠一覧

| 論点 | 結論 | 根拠URL | 信頼度 |
|---|---|---|---|
| Plan mode | 編集前に計画・調査だけさせる用途に使える | https://code.claude.com/docs/en/common-workflows | 高 |
| Subagents | 大きな調査を分け、メイン文脈を汚さない用途に使える | https://code.claude.com/docs/en/sub-agents | 高 |
| CLAUDE.md | 永続的な行動指示に使う | https://code.claude.com/docs/en/memory | 高 |
| Hooks | 特定タイミングの強制にはhooksが必要 | https://code.claude.com/docs/en/hooks | 高 |
| Tool use / web search | 最新情報取得には外部ツール・web_search等の接続が重要 | https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview | 高 |
| 情報源評価 | 公式・一次情報・信頼できる公開情報を優先すべき | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | 高 |
| 信頼できる情報源 | 検証可能性、信頼できる公開情報、独立ソースを重視する | https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources | 中 |

## 注意点

- 今回のWebSearchは環境側の検索アダプタ制限で使えなかったため、主にWebFetchで公式URLを直接取得して確認した。
- WikipediaのReliable sourcesは百科事典編集方針であり、Claude Code公式ではない。ただし情報源評価の一般原則として参考になる。
- 15役割方式はClaude Code公式機能そのものではなく、Subagentsや専門分担の考え方を応用した運用案。
- 正確性を上げるには、役割数よりも「根拠確認」「公式優先」「矛盾明記」「未確認を未確認と書く」運用の方が重要。
