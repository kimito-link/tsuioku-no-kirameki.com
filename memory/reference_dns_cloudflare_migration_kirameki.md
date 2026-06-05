---
name: reference-dns-cloudflare-migration-kirameki
description: tsuioku-no-kirameki.com を Xserver/Sixcore から Cloudflare NS へ丸ごと移行する手順とメール無停止のための全レコード移植リスト
metadata:
  type: project
---

# tsuioku-no-kirameki.com → Cloudflare NS 移行(2026-06-04 設計)

ユーザー方針: 🅰 NS を Cloudflare に丸ごと移行し、oshin(web-health-check.link 等6ドメイン)と同じ一元管理に揃える。最終的に `app.tsuioku-no-kirameki.com`=Vercel(status Web版)を足す。

## ✅ メール不使用が確定(2026-06-04 ユーザー明言)
「メール使ってないから大丈夫」= **MX/SPF/DKIM の移植は不要・捨ててよい**。最大リスク(メール停止)が消滅。よって **A を堂々と Vercel に向けられる**。LP も app も両方 Vercel に素直に乗る。下の「LP分岐」「安全な移行順序」のメール配慮は無視してよい。実質手順:
1. Cloudflare に Add Site(A レコードだけ拾えればOK・MX/SPF/DKIM は入れない)
2. NS を Cloudflare に切替(Xserver パネル「その他のサービスで利用する」→ Cloudflare NS 2本)
3. 裸ドメイン/www → Vercel(LP)、app → Vercel(status Web版)を CNAME/A で設定
4. = oshin と完全に同じ構成

--- 以下は「もしメールを使う場合」の参考(今回は不要)---

## 現状の全レコード(2026-06-04 dig 実測・これを Cloudflare に移植)

| ホスト名 | 種別 | 内容 | TTL |
|---|---|---|---|
| `tsuioku-no-kirameki.com` | A | `202.226.36.17` | 3600 |
| `www` | A | `202.226.36.17` | 3600 |
| `*`(ワイルドカード) | A | `202.226.36.17` | 3600 |
| `tsuioku-no-kirameki.com` | MX | `tsuioku-no-kirameki.com`(pref 0) | 3600 |
| `tsuioku-no-kirameki.com` | TXT(SPF) | `v=spf1 +a:sv16.sixcore.ne.jp +a:tsuioku-no-kirameki.com +mx include:spf.sender.xserver.jp ~all` | 3600 |
| `default._domainkey` | TXT(DKIM) | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvvtg0dw8Chz7T0LS/vtd3VBGaROZD69nOYjB+nq8AfyReBYGc+Gev3YD1U/YamwEEEn7QQJXn73YqQJy7tfNAXXIeDNINnRV4IjwkgCVPv5qiRsOcpQJQILXXeUYQQOsEZCF58LW2pXxQBcoxZAy3w05ly9GLVRn3WRl4Ifboto/AjEseu7G0aF40LfkXiwJb...`(スクショ末尾が `~eXTzs` で続く・**移行時は Xserver パネルの DKIM 設定から完全な p= 値をコピーすること**。dig 実測値は途中までしか取れていない可能性あり) | 3600 |
| `_dmarc` | TXT | **未設定**(なし) | — |
| NS | NS | ns1/ns2/ns3.sixcore.ne.jp | 3600 |

注: MX が自ドメイン宛(`tsuioku-no-kirameki.com`)= A レコード(202.226.36.17)へ配送。SPF の `+a` と `+mx` がこの A/MX に依存しているので、A レコードの IP を変えるとメール認証も連動する。LP を Vercel に移す場合、**A は Xserver(202.226.36.17)のまま残し、LP配信だけ別ホスト名にするか、メール用に別途 mail. ホストを切る**などの設計が要る(SPF/MX が裸ドメインの A に紐づいているため、裸ドメインA を Vercel に向けるとメール配送先が変わってしまう)。← ここが移行の核心的な落とし穴。

## 安全な移行順序(メール無停止)

1. **Cloudflare にドメイン追加**(Add Site → tsuioku-no-kirameki.com)。Cloudflare が現行レコードを自動スキャンするが、**DKIM 等の長い TXT は取りこぼすので上表で手動検証**。
2. スキャン結果を上表と突き合わせ、**MX / SPF(TXT) / DKIM(TXT) / A(本体・www・wildcard)を全部 Cloudflare に揃える**。MX と SPF/DKIM の cloud proxy は **OFF(DNS only / グレー雲)**にする(メール・SPF はプロキシ不可)。
3. **LP の扱いを決める**(下記「LP分岐」)。
4. すべて揃ったのを Cloudflare 上で確認 → **Xserver/Sixcore 側でネームサーバーを Cloudflare の割当 NS に変更**(Xserver パネル「その他のサービスで利用する」→ Cloudflare NS 2本)。
5. 伝播待ち(数分〜48h)。`dig MX/TXT/A @cloudflare-ns` で旧Cloudflare値が返ることを確認。
6. メール送受信テスト(自分宛に送って届くか・SPF/DKIM pass か)。
7. 安定後に `app.tsuioku-no-kirameki.com` を Vercel に CNAME(`cname.vercel-dns.com`、proxy OFF 推奨)。

## LP分岐(裸ドメイン A の扱い)

- **案X(最小・推奨初手)**: A レコードは全部 Xserver IP(202.226.36.17)のまま Cloudflare に移植。LP もメールも現状維持。Cloudflare は「DNSの管理場所が変わるだけ」。app だけ後で Vercel。→ メール紐付け(SPF/MX→A)を壊さず、最も安全。
- **案Y(LPもVercel化)**: 裸ドメイン/www を Vercel に向ける。ただし SPF が `+a`(=裸ドメインA)に依存しているため、**A を変える前に SPF から `+a:tsuioku-no-kirameki.com` を外す or mail 用Aを別途用意**しないとメール認証が崩れる。手間大。後日。

→ 結論: **まず案X で Cloudflare へ「そのまま」移行 → app サブドメインだけ Vercel** が安全。LPのVercel化(案Y)は分離して後日。

## 次の一手
1. ユーザーが Cloudflare に tsuioku-no-kirameki.com を Add Site
2. Claude が上表を使ってレコード移植チェックリストを提示(特に DKIM 全文・MX・SPF)
3. Xserver で NS 切替 → 伝播確認 → メールテスト
4. app.tsuioku-no-kirameki.com → Vercel(oshin web-health-check-app をテンプレに status Web版)

関連: [[reference-web-version-status-sharing-plan]]
