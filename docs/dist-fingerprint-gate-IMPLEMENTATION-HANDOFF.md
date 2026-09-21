# 実装ハンドオフ: pre-push の buildId 無限差分ループ根治

> 設計書: [dist-fingerprint-gate-DESIGN.md](dist-fingerprint-gate-DESIGN.md)(必ず先に全文読む)
> このファイル1枚で着手できる粒度。実装は別モデル/次チャットで行う(3段構えの手順3)。
> 作成日: 2026-09-21

## スコープ

**やること**: pre-pushの`npm run verify`(build含む)による、push毎のbuildIdタイムスタンプdist差分
無限ループを、「ソース指紋(git blob shaベース)」の照合ゲートに置き換えて根治する。

**やらないこと(スコープ外)**:
- `verify-bump.mjs`のmtimeヒューリスティック検査[3]の撤去(将来の別PR判断)
- `NL_BUILD_ID`自体の生成方式変更(buildAgeCell.jsの計器を壊すため絶対に触らない)
- `.dist-fingerprint.json`にbuildIdや時刻を含める設計(ループが復活するため厳禁)

## 着手手順

1. ブランチ作成: `fix/dist-fingerprint-gate` (現在のmasterまたは作業中ブランチから分岐)
2. 設計書のC-5〜C-10を順に実装(依存順: distFingerprint.js → build.mjs → check-dist-fresh.mjs
   → pre-push/pre-commit → package.json → run-verify-cc.mjs → ci.yml)
3. 各ファイル作成・変更後、設計書「E. 地雷と回避策」の該当項目を都度確認しながら進める
4. 実装完了後、設計書「F. 検証手順」を**上から順に全部**実行し、失敗したらそこで止めて直す

## 読む順(設計書内のセクション対応)

| 順序 | 内容 | 設計書セクション |
|---|---|---|
| 1 | `src/lib/distFingerprint.js`新規作成(純関数) | C-5 |
| 2 | `src/lib/distFingerprint.test.js`新規作成(vitest。judgeDistFreshnessの5ケース+maskBuildIdの同一性テストが最重要) | (C-5のコードを元にテスト設計) |
| 3 | `scripts/build.mjs`変更(既存の.envロード・BUILD_ID生成・targets定義は絶対に変えない。末尾のPromise.all以降だけ追記) | C-6 ★実装時注意を必読 |
| 4 | `scripts/check-dist-fresh.mjs`新規作成 | C-7 |
| 5 | `.husky/pre-push`置換(全文・LF確認必須) | C-8, E-1, E-2 |
| 6 | `.husky/pre-commit`末尾追記(既存3ブロックは変更しない) | C-9 ★実装時注意を必読 |
| 7 | `package.json`に2スクリプト追加 | C-10 |
| 8 | `scripts/run-verify-cc.mjs`に1行追加 | C-10 |
| 9 | `.github/workflows/ci.yml`に1ステップ追加 | C-10 |
| 10 | `.gitattributes`に`.husky/* text eol=lf`を1行追加(無ければファイル新規作成) | E-1 |

## 機械的な完了判定(全部緑になったら完了)

```bash
# 1. 純関数のユニットテスト
npm run test:cc -- distFingerprint

# 2. selftest
npm run check:dist-fresh:selftest

# 3. ループ根治の核心実験(設計書F-2と同じ)
npm run build && cp .dist-fingerprint.json /tmp/fp1.json
npm run build && diff /tmp/fp1.json .dist-fingerprint.json && echo SAME_OK
git diff --stat -- extension/dist app/dist   # buildId行だけの差であること(目視)
node scripts/check-dist-fresh.mjs            # OK

# 4. フルゲート
npm run verify:cc

# 5. 実際にcommit→pushして作業ツリーが空になることを確認(最終受け入れ基準)
git add -A && npm run tree-map && git add -A && npm run verify:cc && git commit -m "..."
git push
git status --porcelain   # ★これが空でなければ設計が機能していない
```

「4」までは通常のCI相当。「5」は実リポジトリでのpush伴う検証なので、ユーザーの許可を得てから
実施すること(このリポの運用ルール「pushは明示依頼後」に従う)。

## 毒テスト(設計書F-4〜F-8、省略しない)

意図的にゲートを壊してみて、正しく赤くなることを確認する。5パターン全て実施:
1. ソース変更してbuild忘れでpush → pre-pushで止まる
2. `package-lock.json`だけ変更してbuild忘れ → 赤(ツールチェーン変更の見逃し防止が効いている証拠)
3. distのgit add漏れ → 赤
4. pre-commitの索引照合(SKIP無しでcommit) → 止まって指示コマンドが出る
5. `build:watch`出力のまま → 赤

いずれも`git reset --hard HEAD~1`等で元に戻してから次のテストへ進む。

## 制約(絶対に破らない)

- `src/lib/buildAgeCell.js`・`NL_BUILD_ID`の生成方式・埋め込み位置は一切変更しない
- `.dist-fingerprint.json`にbuildIdや時刻を含めない
- pre-push内でbuildを実行しない(設計書D参照。安全な形が存在しないため)
- 自動amend/squashは実装しない(会議で全員否決済み)

## 関連ファイル(実パス・実装前に必ず現行状態を再確認すること)

- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\.husky\pre-push`
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\.husky\pre-commit`
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\scripts\build.mjs`
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\scripts\run-verify-cc.mjs`
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\src\lib\buildAgeCell.js`(参照のみ・変更しない)
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\src\lib\bundleBuildId.js`(参照のみ・正規表現の形式を揃える)
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\package.json`
- `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com\.github\workflows\ci.yml`

## 完了後にやること

1. `scripts/repo-tree-map.mjs`の`FEATURES`辞書に「dist鮮度ゲート」を1行追加→`npm run tree-map`
2. `~/.claude/skills/nicolive-ship/SKILL.md`と本セッションのMEMORY「pre-pushでdistのbuildIdが
   1つずれる(追わない)」の記述を更新(前提が変わったため。他ツールに渡さず司令塔が直接編集する)
3. AGENTS.md §2の`NL_STORE_BUILD=1`の記述が古い(build.mjsではもう読んでいない)ことを別途報告
   (本タスクのスコープ外だが、設計書調査で判明した事実として記録)
