/**
 * 運用日（JST）を返す唯一の正本。
 *
 * ★なぜ切り出したか（2026-09-26・実損から）:
 *  `council-daily.mjs` が **UTC** の日付（`toISOString().slice(0,10)`）で日報ファイルを探し、
 *  `scout-models.mjs` は **JST** の日付でファイルを書いていた。結果、
 *  **JST 09:00 より前（UTC 15:00〜24:00）に回すと必ず**「日報が見つからない」と
 *  誤判定して exit 2 で止まった（日報は正常に生成されていたのに偽の赤を出した）。
 *  実測: 2026-09-26 UTC 20:37 → daily=2026-09-25 / scout=2026-09-26。
 *
 * ★この関数を直接 import して使うこと。各スクリプトで日付を自前計算しない
 *  （同じ定義が2箇所に増えた瞬間、片方だけ直してまたズレる。それが今回の事故そのもの）。
 *
 * ★`scout-models.mjs` の todayJst() を import しなかった理由:
 *  あちらはトップレベルで process.argv を読みロックを取得する実行スクリプトで、
 *  import すると副作用が走る。関数だけを安全に共有するためこのモジュールを置いた。
 */
export function todayJst(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}
