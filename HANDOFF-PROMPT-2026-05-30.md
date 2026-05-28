# 明日(2026-05-30)朝の Claude へのコピペプロンプト

## フル版

```
おはよう。昨夜セッションで master を v0.1.424 → v0.1.448 まで進化させた。

状況把握:
1. memory/MEMORY.md の先頭エントリ(2026-05-29 ✅✅✅✅✅)を読む
2. HANDOFF-2026-05-29-night-session-cleanup-complete.md を読む
3. git log --oneline -10 で master HEAD を確認
4. gh pr list --base master --limit 5 でopen PR 0件を確認
5. gh run list --branch master --limit 1 で master CI 緑(理想)を確認

成果サマリ:
- 8 PR を連続 squash merge (v0.1.444〜v0.1.448): #162→#163→#164→#165→#166→#167→#168→#169
- 13 PR を一括 close (codex/dependabot 古いもの)
- e2e long-standing failure 3/3 完全解消(PR #163 で2件 + PR #169 で1件)
- unit tests 4042 → 4182+ (+140)
- ローカルブランチ 170 → 99 (-71)

次に何をするべきかは、私(りんく)から指示する。
それまでは待機していて。
```

## 短縮版

```
おはよう。HANDOFF-2026-05-29-night-session-cleanup-complete.md を読んで状況把握して。
次の指示まで待機していて。
```

## もし急にトラブルが起きた場合(例: master CI が突然赤)

```
master CI が赤になった。
gh run view --branch master --log-failed で失敗テストを確認して、
master 由来 long-standing なら spec のみ修正、新規退行なら
PR の中身を分析して根本対策。
PR #163 や PR #169 の手法を参考に。
```
