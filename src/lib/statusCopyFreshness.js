/**
 * 状態速報の「コピーした本文がどれくらい古いか」を、コピーする側に伝える純関数(v0.1.1222)。
 *
 * 【なぜ必要か】
 * 状態ページは混雑時に更新へ100秒級かかる(実測103,416ms)。共有ボタンは「最後に描けた本文」
 * (_lastRenderedBundle.textBlob)を渡す造りなので、混雑中は【数十秒前の凍った値】が
 * コピーされる。しかもボタンは「コピーしました ✓」としか言わないため、受け取った側は
 * それが古いと分からない。
 *
 * 実際に 2026-08-01、この古い本文で読み上げの状態を判定しようとして詰まった:
 *   - `読み上げ追従=会場休止中` … voiceDiag が90秒より古いことを示すラベル(会場は動いていた)
 *   - `間引き734件`            … 配信開始からの累計であって「今」の値ではない
 * 画面ヘッダーには鮮度(staleNote)が出ていたが、**コピー本文には入っていなかった**。
 *
 * ★これは「計器は症状でなく原因を出す」「嘘の緑を作らない」という本リポの原則違反。
 *   古い値を黙って渡すのは、静かに間違った結論へ誘導する。
 *
 * @module statusCopyFreshness
 */

/** これ以上ズレたら「古い」と見なす秒数(この未満は実用上そのまま信じてよい)。 */
export const STATUS_COPY_STALE_SEC = 20;

/** 読み上げ計器が na(会場休止中)に落ちる境界。古さの説明に使う。 */
const VOICE_DIAG_STALE_SEC = 90;

/**
 * コピー本文の先頭に差し込む警告行を作る。
 *
 * 新鮮なら空文字を返す(何も足さない=通常時のコピー本文はこれまでと1バイトも変わらない)。
 *
 * @param {unknown} ageSec 本文が組まれてから経過した秒数
 * @returns {string} 先頭に足す警告(末尾改行つき)。新鮮なら ''。
 */
export function buildStatusCopyStaleBanner(ageSec) {
  const sec = Math.max(0, Math.floor(Number(ageSec) || 0));
  if (sec < STATUS_COPY_STALE_SEC) return '';
  const lines = [
    '⚠️ この状態速報は【' + sec + '秒前の値】です(ストレージ混雑で更新が追いついていません)。',
    '   「今どうなっているか」の判断には使えません。特に次は誤読しやすいので注意:'
  ];
  if (sec >= VOICE_DIAG_STALE_SEC) {
    lines.push(
      '     ・読み上げ追従「会場休止中」= 会場が止まったのではなく、計器が' +
        VOICE_DIAG_STALE_SEC +
        '秒より古いという意味'
    );
  }
  lines.push('     ・「間引きN件」「検知N件」等の累計値は配信開始からの合計で、直近の勢いではない');
  lines.push('   → 判定し直すには、混雑が引いてからもう一度コピーしてください。');
  return lines.join('\n') + '\n\n';
}

/**
 * 共有ボタンに出す文言を決める。
 *
 * 「コピーしました ✓」だけだと古さが伝わらないので、古いときは秒数を必ず見せる。
 *
 * @param {'clipboard'|'execCommand'|'selected'|'failed'|string} outcome copyTextWithFallback の結果
 * @param {unknown} ageSec 本文の古さ(秒)
 * @returns {{ label: string, stale: boolean }}
 */
export function buildStatusCopyButtonLabel(outcome, ageSec) {
  const sec = Math.max(0, Math.floor(Number(ageSec) || 0));
  const stale = sec >= STATUS_COPY_STALE_SEC;
  if (outcome === 'clipboard' || outcome === 'execCommand') {
    return {
      label: stale
        ? `⚠ ${sec}秒前の値をコピーしました(古い可能性)`
        : 'コピーしました ✓ そのまま貼ってください',
      stale
    };
  }
  if (outcome === 'selected') {
    return { label: stale ? `⚠ ${sec}秒前の値を選択→Ctrl+C` : '選択しました→Ctrl+C', stale };
  }
  return { label: 'コピーできませんでした', stale };
}
