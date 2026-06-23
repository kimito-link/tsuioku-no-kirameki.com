# サイト健全性チェック（自動生成）

> `scripts/site-health.mjs` が git 追跡の公開ページ(LP/記事/docs/council)を静的解析。**手で編集しない**。
> 検証: ①**相対内部リンク(.html/.md)の参照先がディスクに実在するか** ②**canonical/og:url が自ファイル名と一致するか**。
> 外部リンクは叩かない(依存/プライバシー/速度)。再生成: `npm run site-health` ／ 検証のみ: `npm run site-health:check`(問題で exit 1)。

検証対象: 118 ファイル

## ✅ 内部リンク健全性: 問題なし

相対内部リンクの参照先はすべて実在します。

## ✅ canonical / og:url: 自ファイル名と一致
