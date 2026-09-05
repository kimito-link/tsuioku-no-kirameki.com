/**
 * 【層】L0 判定層（純関数・chrome/DOM/fetch に触らない）
 * 【この箱に入るもの】ホバーカードの「一言」が出ているか／出ないなら理由の判定
 * 【この箱に入らないもの】DOM 走査（採取は呼び出し側・ここは受け取った値を判定するだけ）
 * 【書けるstorageキー】なし
 * 【正本宣言】「一言が出ない理由」の言葉はこのファイルが正本
 *
 * venueHoverCardProbe.js — ホバーカードの一言が「出ているか」を拡張自身に答えさせる。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか（2026-08-29）
 *
 *   「一行が出ていない」と言われたとき、私はコードを読んで
 *   ★「コードは正しいのでリロードしてください」と推測で答えた。
 *   だが実際に何が起きているかは【一度も測っていなかった】。
 *
 *   このリポには同じ失敗の記録がある（v0.1.1488・3キャラが出ない件）:
 *     「原因は腕ではなく★【事実を持っていなかった】ことでした。
 *       コードを読んで推測するだけで、実際に画面のどこに何が出ているかを
 *       一度も測っていませんでした」
 *   そのとき作った `__nls_chara_live_probe__()` と同じ形で、ここでも自分に測らせる。
 *
 * ■ ★何を切り分けるのか
 *   「出ない」には原因が複数あり、外から見分けられない:
 *     ① 古いコードが動いている（リロードされていない）
 *     ② 要素が無い（DOM 生成の配線漏れ）
 *     ③ 要素はあるが空（モデルが空文字を返した）
 *     ④ 要素も文字もあるが CSS で見えない（競合・hidden）
 *   ★この4つを言葉で名指しできれば、往復が1回で済む。
 *
 * ■ この判定がしないこと
 *   ★見た目の good/bad は判定しない（読みやすいか等は人が決める）。
 *   ★DOM を書き換えない（観測が対象を変えない）。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * ホバーカードの一言について、採取した事実から「出ているか/出ない理由」を決める。
 *
 * 入力の意味:
 *   cardExists     … カード要素そのものが在るか
 *   elementExists  … 一言の要素(.nlsb-hover-card__presence)が在るか
 *   text           … その要素の文字列
 *   hidden         … hidden 属性が立っているか
 *   displayNone    … CSS で display:none になっているか
 *   buildId        … 動いているバンドルのビルドID（新旧の判定に使う）
 *
 * @param {{
 *   cardExists?: boolean,
 *   elementExists?: boolean,
 *   text?: string,
 *   hidden?: boolean,
 *   displayNone?: boolean,
 *   buildId?: string
 * }} census
 * @returns {{ visible: boolean, reason: string, line: string }}
 */
export function venueHoverCardPresenceVerdict(census) {
  const c = census && typeof census === 'object' ? census : {};
  const text = String(c.text || '').trim();
  const buildId = String(c.buildId || '').trim();
  const buildPart = buildId ? `（ビルド ${buildId}）` : '（ビルドID不明）';

  // ★カードが無い＝そもそもホバーしていない。これは異常ではない。
  if (c.cardExists !== true) {
    return {
      visible: false,
      reason: 'no-card',
      line: `⚪ カードがまだ出ていません。会場のアイコンにカーソルを合わせてから実行してください${buildPart}`
    };
  }

  /*
   * ★要素が無い＝【古いコードが動いている】か【DOM 生成の配線漏れ】。
   *   この2つは外から見分けられないので、両方を名指しする。
   */
  if (c.elementExists !== true) {
    return {
      visible: false,
      reason: 'element-missing',
      line: `🔴 一言の置き場所そのものがありません${buildPart}。`
        + '★古いコードが動いている（拡張をリロードしていない）か、DOM を組む配線が抜けています。'
        + 'まず chrome://extensions でリロード→放送タブを F5 して、それでも同じならコードの問題です'
    };
  }

  // ★要素はあるが空＝モデルが空文字を返した（＝発言もギフトも無い人）。
  if (text === '') {
    return {
      visible: false,
      reason: 'empty-text',
      line: '⚪ 置き場所はありますが文字が空です。'
        + '★発言もギフトも無い人（＝まだ何もしていない人）だとここは空になります。'
        + '発言のある人のアイコンで試してください'
    };
  }

  // ★文字はあるのに hidden／display:none＝CSS か表示条件の問題。
  if (c.hidden === true || c.displayNone === true) {
    const why = c.hidden === true ? 'hidden 属性が立っています' : 'CSS で display:none になっています';
    return {
      visible: false,
      reason: 'hidden',
      line: `🔴 文字は入っているのに見えません（${why}）。文字: 「${text}」${buildPart}`
    };
  }

  return {
    visible: true,
    reason: 'ok',
    line: `✅ 出ています: 「${text}」${buildPart}`
  };
}
