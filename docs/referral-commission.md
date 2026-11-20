# サポーターの紹介料（partnership 台帳）

2026-11-20 にりんくさんが承認したルールの、追憶のきらめき側の実装メモ。価格・14日のお試し・有料の範囲・関所（`SUPPORTER_GATE_ENFORCED`）は変えない。正本の課金方針は [docs/policies/MONETIZATION.md](policies/MONETIZATION.md)。

紹介料の率（紹介した人 20%、その人を紹介した人 5%）は **partnership が計算する**。このリポジトリは「誰のコードで、いくら払ったか／返したか」だけを送る。

## 何を覚えるか

- ランディングページ（`https://tsuioku-no-kirameki.com/`）と特定商取引法のページで `?ref=` を読む。`localStorage` のキー `tnk_referral_v1` に `{ ref, at }` を **90日** 残し、`https://app.tsuioku-no-kirameki.com/supporter` へのリンクへ `ref` を足す。
- サポーターページでも `?ref=` を読み、同じキーで 90日残す。欄は空でも申し込みできる。空でないのに形が違うときは、申し込みを止めて案内する。
- LP とアプリは別オリジンなので、保存は共有されない。LP はリンクの URL で渡す。拡張の画面には紹介の文言を出さない。拡張から開いたサポーターページでは、欄に手入力できる。
- 90日は linebot の帰属窓に合わせた。partnership の PR #398 が 30日にしているのは、向こうのサイト自身の `localStorage`（`rh_ref_last_click`）だけで、全サービスの共通定数ではない。追憶は自分のオリジンで 90日のままにする。

## Stripe

Checkout の `subscription_data.metadata` にだけ載せる。

- 紹介コードがあるとき: `source=tsuioku` と `ref=<コード>`
- 無いとき（直販）: `source=tsuioku` だけ

`client_reference_id` は使わない。Session の metadata は Subscription にコピーされないので使わない。`metadata.kind` は付けない（partnership 側の監視契約と混ぜないため）。

このコードは、Checkout を作るとき以外に Subscription の metadata を書き換えない。公開より前から続いている契約には `ref` が無いので、紹介の対象にならない。

## 台帳へ送るもの

環境変数（本番に置く。コードには書かない）。

| 名前 | 意味 |
|---|---|
| `PARTNERSHIP_COMMISSION_URL` | 台帳のオリジン。末尾スラッシュなし。例はリリース時に決める。未設定のままでは送らない |
| `PARTNERSHIP_COMMISSION_SECRET` | source `tsuioku` 専用の共有秘密。向こうの環境変数は `COMMISSION_SECRET_TSUIOKU` |

送り先（URL のうしろに付ける）:

- `POST /api/referrals/commission-events`
- `POST /api/referrals/commission-events/refund`

どちらも `Authorization: Bearer <PARTNERSHIP_COMMISSION_SECRET>` と JSON。

支払い（`kind` は `recurring`。年額も同じ）:

```json
{
  "eventId": "in_xxx",
  "source": "tsuioku",
  "referralCode": "RH-XXXX",
  "kind": "recurring",
  "amountYen": 980,
  "occurredAt": "2026-11-20T00:00:00.000Z"
}
```

返金（`eventId` は元の請求 ID。`refundedAmountYen` はその請求の累計返金額）:

```json
{
  "eventId": "in_xxx",
  "source": "tsuioku",
  "refundedAmountYen": 980,
  "reason": "refund"
}
```

メールアドレス、名前、LINE の ID、Stripe の customer id は送らない。

## いつ送るか

Stripe の webhook（`/api/billing?action=webhook`）で、台帳の更新が成功したあと。

| イベント | 動き |
|---|---|
| `invoice.paid` | `amount_paid > 0` かつ metadata が `source=tsuioku` で `ref` があるとき送る |
| `invoice.payment_succeeded` | 同じ請求で届くことがある。`eventId` が請求 ID なので台帳が2回目を捨てる |
| `charge.refunded` | 先に支払いイベントを送り（重複は台帳が捨てる）、続けて累計の返金額を送る |
| 0円の請求（お試し・クーポン） | 送らない |
| `checkout.session.completed` | 台帳（ライセンス）だけ更新する。紹介料は請求が来てから |

同じ Stripe アカウントの他商品は、`source` が `tsuioku` でないので送らない。

ダッシュボードで購読するイベントは、いまの契約更新に加えて **`invoice.paid`（または `invoice.payment_succeeded`）と `charge.refunded`**。`charge.refunded` は今回から必要。

## 失敗したとき

- 台帳が `200` かつ `duplicate: true` → 成功。再送しない。
- 支払いイベントが `404`（`referral_not_found`）または `400` → そのコードでは送れないものとして打ち切る。Stripe には成功を返す（延々と再送させない）。返金は続けて送らない。
- `401` / `5xx` / 通信失敗 / 通貨が jpy でない / 金額が整数でない → webhook を失敗させ、Stripe に再送させる。受け取った印（`billing:evt:`）は消す。
- 紹介のある支払いに対して URL か秘密が未設定 → `commission_not_configured` で失敗させ、設定されるまで Stripe が再送する。紹介の無い請求は、未設定でも成功のまま。

返金が支払いより先に届いても、先に支払いイベントを作ってから返金を送る。

## 自己紹介

支払者のメールと、紹介コードの持ち主のメールが両方あり、同じなら送らない。持ち主を返す関数はテスト用の差し込みだけで、本番の webhook は渡さない。台帳の `POST /api/referrals/commission-events` は支払者と持ち主を比べず、このリポジトリはメールを送らない。**リリースまでには、partnership 側が source `tsuioku` の自己紹介を 0 円にする必要がある。** それまでは、自分のコードで申し込んだ紹介者に報酬が付く余地がある。

## ソースを足すとき（partnership 側）

追憶は `source` を `tsuioku` に固定している。別のサービスを足す作業は partnership 側の設定1行と、その source 専用の秘密（`COMMISSION_SECRET_<SOURCE>`）で足りる。このリポジトリの送信項目は、いまの commission-events が読む項目だけにする。

リリース前に partnership の `COMMISSION_SOURCES` に `tsuioku` が入り、`COMMISSION_SECRET_TSUIOKU` が `PARTNERSHIP_COMMISSION_SECRET` と同じ値になっていること。入るまでは、正しい紹介コードでも台帳が `400` を返し、追憶はその請求の紹介料を打ち切る。
