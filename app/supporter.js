// 追憶のきらめき サポーター(v0.1.1893・課金 第1段)。素の JS(ビルドなし)。受け口は /api/billing。
//   価格の表示は SUPPORTER_PRICES だけを直す(Stripe の価格と必ずそろえる)。
(function () {
  'use strict';
  /** ★りんくさんが価格を決めたらここを直す(Stripe 側の価格と同じ値)。 */
  const SUPPORTER_PRICES = { yearly: '年額 5,000円', monthly: '月額 500円' };
  const API = '/api/billing';

  function $(id) { return document.getElementById(id); }
  function show(el, text) { if (!el) return; el.textContent = text; el.hidden = !text; }
  function post(action, body, code) {
    const headers = { 'Content-Type': 'application/json' };
    if (code) headers['x-supporter-code'] = code;
    return fetch(API + '?action=' + action, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.httpStatus = r.status; return j; }); });
  }
  function errorText(j) {
    if (j && j.error === 'billing_not_configured') return 'ただいま準備中です。もう少しお待ちください。';
    if (j && j.error === 'unknown_code') return 'コードが見つかりませんでした。';
    return '通信に失敗しました。時間をおいてもう一度お試しください。';
  }

  $('priceYearly').textContent = SUPPORTER_PRICES.yearly;
  $('priceMonthly').textContent = SUPPORTER_PRICES.monthly;

  Array.prototype.forEach.call(document.querySelectorAll('[data-plan]'), function (btn) {
    btn.addEventListener('click', function () {
      show($('joinErr'), '');
      post('checkout', { plan: btn.getAttribute('data-plan') }).then(function (j) {
        if (j && j.url && /^https:\/\/checkout\.stripe\.com\//.test(j.url)) location.href = j.url;
        else show($('joinErr'), errorText(j));
      }, function () { show($('joinErr'), errorText(null)); });
    });
  });

  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');
  if (sessionId) {
    $('joinView').hidden = true;
    $('doneView').hidden = false;
    $('code').textContent = '確認しています…';
    post('claim', { sessionId: sessionId }).then(function (j) {
      if (j && j.code) {
        $('code').textContent = j.code;
        $('portalCode').value = j.code;
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
})();
