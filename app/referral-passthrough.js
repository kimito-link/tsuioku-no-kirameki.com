/**
 * LP（tsuioku-no-kirameki.com）で ?ref= を90日覚え、サポーターページへのリンクに足す。
 * アプリ側（app.）とは別オリジンなので、コードは URL で渡す。保存するのはコードと時刻だけ。
 */
import { resolveReferralCode, supporterHrefWithRef } from './referral-attribution.js';

function storage() {
  try { return globalThis.localStorage; } catch { return null; }
}

const ref = resolveReferralCode(storage(), new URLSearchParams(location.search).get('ref'));
if (ref) {
  document.querySelectorAll('a[href]').forEach((anchor) => {
    const next = supporterHrefWithRef(anchor.getAttribute('href'), ref);
    if (next) anchor.setAttribute('href', next);
  });
}
