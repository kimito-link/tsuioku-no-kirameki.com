// 追憶のきらめき サポーター(v0.1.1893・課金 第1段)。素の JS(ビルドなし)。受け口は /api/billing。
//   価格の表示は SUPPORTER_PRICES だけを直す(Stripe の価格と必ずそろえる)。
//   紹介コードはブラウザに90日だけ覚え、Checkout の Subscription metadata に載せる。
import { normalizeReferralCode, rememberReferralCode, resolveReferralCode } from './referral-attribution.js';
import { formatPriceLabel, formatTrialBillingNotice } from './supporter-pricing.js';

(function () {
  'use strict';
  /** 表示文言。金額そのものは supporter-pricing.js の SUPPORTER_PRICE_YEN（Stripe と同じ値）。 */
  const SUPPORTER_PRICES = { yearly: formatPriceLabel('yearly'), monthly: formatPriceLabel('monthly') };
  const API = '/api/billing';

  function $(id) { return document.getElementById(id); }
  function show(el, text) { if (!el) return; el.textContent = text; el.hidden = !text; }
  function storage() {
    try { return globalThis.localStorage; } catch { return null; }
  }
  function post(action, body, code) {
    const headers = { 'Content-Type': 'application/json' };
    if (code) headers['x-supporter-code'] = code;
    return fetch(API + '?action=' + action, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.httpStatus = r.status; return j; }); });
  }
  function errorText(j) {
    if (j && j.error === 'billing_not_configured') return 'ただいま準備中です。もう少しお待ちください。';
    if (j && j.error === 'unknown_code') return 'コードが見つかりませんでした。';
    if (j && j.error === 'not_supporter') return 'このお支払いは追憶のきらめき サポーターのものではないようです。';
    if (j && j.error === 'reset_too_soon') {
      const d = j.nextAtMs ? new Date(j.nextAtMs) : null;
      return 'PC を移せるのは30日に1回です。' + (d ? '次に移せるのは ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 からです。' : '');
    }
    return '通信に失敗しました。時間をおいてもう一度お試しください。';
  }

  $('priceYearly').textContent = SUPPORTER_PRICES.yearly;
  $('priceMonthly').textContent = SUPPORTER_PRICES.monthly;
  if ($('trialNote')) {
    $('trialNote').textContent = formatTrialBillingNotice({ nowMs: Date.now() });
  }

  const params = new URLSearchParams(location.search);
  const remembered = resolveReferralCode(storage(), params.get('ref'));
  if (remembered && $('refCode')) $('refCode').value = remembered;

  function referralForCheckout() {
    const raw = ($('refCode') && $('refCode').value || '').trim();
    if (!raw) return { ref: undefined };
    const code = normalizeReferralCode(raw);
    if (!code) return { error: '紹介コードは英数字とハイフンで32文字までです。空欄でも申し込めます。' };
    rememberReferralCode(storage(), code);
    return { ref: code };
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-plan]'), function (btn) {
    btn.addEventListener('click', function () {
      show($('joinErr'), '');
      const ref = referralForCheckout();
      if (ref.error) { show($('joinErr'), ref.error); return; }
      const body = { plan: btn.getAttribute('data-plan') };
      if (ref.ref) body.ref = ref.ref;
      post('checkout', body).then(function (j) {
        if (j && j.url && /^https:\/\/checkout\.stripe\.com\//.test(j.url)) location.href = j.url;
        else show($('joinErr'), errorText(j));
      }, function () { show($('joinErr'), errorText(null)); });
    });
  });

  const sessionId = params.get('session_id');
  if (sessionId) {
    $('joinView').hidden = true;
    $('doneView').hidden = false;
    $('code').textContent = '確認しています…';
    post('claim', { sessionId: sessionId }).then(function (j) {
      if (j && j.code) {
        $('code').textContent = j.code;
        $('portalCode').value = j.code;
        $('moveCode').value = j.code;
      } else if (j && j.error === 'code_already_issued') {
        $('code').textContent = 'コードをこのページで表示できるのは、お支払いから24時間です。控えたコードをお使いください。分からなくなったときはお問い合わせください。';
      } else {
        $('code').textContent = '支払いの確認ができませんでした。数分たってからこのページを読み込み直してください。';
      }
    }, function () { $('code').textContent = errorText(null); });
  }

  $('copyBtn').addEventListener('click', function () {
    const t = $('code').textContent || '';
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { $('copyBtn').textContent = 'コピーしました'; });
  });

  $('portalBtn').addEventListener('click', function () {
    show($('portalErr'), '');
    const code = ($('portalCode').value || '').trim();
    post('portal', {}, code).then(function (j) {
      if (j && j.url && /^https:\/\/billing\.stripe\.com\//.test(j.url)) location.href = j.url;
      else show($('portalErr'), errorText(j));
    }, function () { show($('portalErr'), errorText(null)); });
  });
  $('moveBtn').addEventListener('click', function () {
    show($('moveMsg'), '');
    const code = ($('moveCode').value || '').trim();
    post('devices_reset', {}, code).then(function (j) {
      show($('moveMsg'), j && j.ok ? '移す準備ができました。新しい PC の拡張でマーケ HTML を開き、コードを貼り付けてください。' : errorText(j));
    }, function () { show($('moveMsg'), errorText(null)); });
  });
})();
