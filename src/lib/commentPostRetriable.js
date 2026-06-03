/**
 * popup のコメント送信で、別 frameId を試す価値があるか（8s 走査を避ける判定）。
 * 確認失敗・送信ボタン不明は正しいフレームでも起きうるため、全フレーム走査はしない。
 *
 * @param {string} detail content / messaging のエラー文言
 * @returns {boolean}
 */
export function commentPostErrorWarrantsFrameDiscovery(detail) {
  const d = String(detail || '').trim();
  if (!d) return true;

  if (/このフレームにはコメント欄がありません/.test(d)) return true;
  if (/コメント欄のあるwatchフレームが見つかりません/.test(d)) return true;
  if (/コメント入力欄が見つかりません/.test(d)) return true;
  if (/Receiving end does not exist|Could not establish connection/i.test(d)) {
    return true;
  }

  if (/コメント送信を確認できませんでした/.test(d)) return false;
  if (/公式の送信ボタンを見つけられませんでした/.test(d)) return false;
  if (/コメントが空です/.test(d)) return false;

  return true;
}
