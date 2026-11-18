// yt-loading-boot.js — 横の欄の最初の描画。拡張の CSP は inline script を止めるので、このファイルを <head> で読む。
// 対応表の正本は src/lib/platform/platformMetrics.js の PLATFORM_CAPABILITIES。
// 見た目の CSS は platformMetricChrome.js の buildForeignCapabilityCss と同じ文字列（テストが突き合わせる）。
(function () {
  try {
    var q = new URLSearchParams(location.search);
    var stream = q.get('stream') || '';
    var site = q.get('site') || '';
    var LABELS = {
    youtube: '同時視聴者数',
    twitch: '視聴者数',
    kick: '視聴者数',
    showroom: '視聴者数',
    mixch: '視聴者数',
    whowatch: '視聴者数',
    tiktok: '視聴者数',
    twitcasting: '視聴者数',
    abema: '視聴数'
    };
    var SUB = { twitch: 1, kick: 1, showroom: 1 };
    // 数が来る前の見出し。公式の順位表が載るまでは合計順（platformSectionPlan の official 無しと同じ）。
    var LANES = {
      youtube: { rank: 'スパチャの合計順', gift: 'スーパーチャット・ギフト' },
      twitch: { rank: 'Bits・ギフトサブの合計順', gift: 'サブスク・ギフトサブ' },
      kick: { rank: 'Kicks・ギフトサブの合計順', gift: 'ギフトサブ' },
      showroom: { rank: 'ギフトの合計順', gift: 'ギフト' },
      mixch: { rank: 'ギフトの合計順', gift: 'ギフト' },
      tiktok: { rank: 'ギフトの合計順', gift: 'ギフト' },
      twitcasting: { rank: 'ギフトの合計順', gift: 'ギフト' },
      whowatch: { rank: 'アイテムの合計順', gift: 'アイテム' }
    };
    // foreignPanelCopy（platformMetrics.js）と同じ見出し。テストが突き合わせる。
    var COPY = {
      youtube: { timeline: '応援タイムライン（コメント＋スーパーチャット）', users: 'スーパーチャット・ギフトのユーザー（簡易）', paid: 'スーパーチャット', effect: 'スーパーチャットの効果音を鳴らす', hint: 'スーパーチャットが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      twitch: { timeline: '応援タイムライン（コメント＋Bits・ギフトサブ）', users: 'Bits・ギフトサブのユーザー（簡易）', paid: 'Bits', effect: 'Bitsの効果音を鳴らす', hint: 'Bitsが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      kick: { timeline: '応援タイムライン（コメント＋Kicks・ギフトサブ）', users: 'Kicks・ギフトサブのユーザー（簡易）', paid: 'Kicks', effect: 'Kicksの効果音を鳴らす', hint: 'Kicksが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      showroom: { timeline: '応援タイムライン（コメント＋ギフト）', users: 'ギフトユーザー（簡易）', paid: 'ギフト', effect: 'ギフトの効果音を鳴らす', hint: 'ギフトが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      mixch: { timeline: '応援タイムライン（コメント＋ギフト）', users: 'ギフトユーザー（簡易）', paid: 'ギフト', effect: 'ギフトの効果音を鳴らす', hint: 'ギフトが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      whowatch: { timeline: '応援タイムライン（コメント＋アイテム）', users: 'アイテムユーザー（簡易）', paid: 'アイテム', effect: 'アイテムの効果音を鳴らす', hint: 'アイテムが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      tiktok: { timeline: '応援タイムライン（コメント＋ギフト）', users: 'ギフトユーザー（簡易）', paid: 'ギフト', effect: 'ギフトの効果音を鳴らす', hint: 'ギフトが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      twitcasting: { timeline: '応援タイムライン（コメント＋ギフト）', users: 'ギフトユーザー（簡易）', paid: 'ギフト', effect: 'ギフトの効果音を鳴らす', hint: 'ギフトが来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' },
      abema: { timeline: '応援タイムライン（コメント）', users: '', paid: '', effect: 'コメントが増えたときの効果音を鳴らす', hint: 'コメントが増えたときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。' }
    };
    function idOf(raw) {
      var s = String(raw || '');
      var head = s.split(':')[0];
      if (head === 'yt') return 'youtube';
      if (LABELS[head]) return head;
      if (s.indexOf('tw.') === 0) return 'twitch';
      if (s.indexOf('kk.') === 0) return 'kick';
      if (s.indexOf('sr.') === 0) return 'showroom';
      if (s.indexOf('mx.') === 0) return 'mixch';
      if (s.indexOf('ww.') === 0) return 'whowatch';
      if (s.indexOf('tt.') === 0) return 'tiktok';
      if (s.indexOf('tc.') === 0) return 'twitcasting';
      if (s.indexOf('ab.') === 0) return 'abema';
      return '';
    }
    var cap = idOf(stream) || idOf(site);
    if (!cap || !LABELS[cap]) return;
    var root = document.documentElement;
    root.classList.add('nl-cap-foreign');
    root.classList.add('nl-cap-' + cap);
    root.classList.add('nl-count-loading');
    if (SUB[cap]) root.classList.add('nl-cap-subboard');
    if (COPY[cap] && !COPY[cap].users) root.classList.add('nl-cap-no-paid');
    var style = document.createElement('style');
    style.id = 'nl-platform-capability-style';
    style.textContent = 'html.nl-cap-foreign .nl-live-stat-card--visitors{display:none!important;}html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoViewers),html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoComments),html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoAdPts),html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoGiftPts),html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoCommentsRate){display:none!important;}html.nl-cap-foreign [data-lane="adRanking"] .nl-north-star-ad-stats__row:first-child{display:none!important;}html.nl-cap-foreign:not(.nl-cap-subboard) [data-lane="adRanking"],html.nl-cap-foreign [data-lane="programPoints"],html.nl-cap-foreign [data-lane="eventRank"],html.nl-cap-foreign [data-lane="eventScore"],html.nl-cap-foreign [data-lane="eventVotingSupporters"],html.nl-cap-foreign #giftRankingFetchPrompt,html.nl-cap-foreign #watchOfficialEventBannerCard,html.nl-cap-foreign #watchOfficialNdgrCard,html.nl-cap-foreign #giftHistoryProgramPt{display:none!important;}html.nl-cap-foreign .nl-north-star-gift-stack:not(:has(> [data-lane="giftHistory"]:not([hidden]))){display:none!important;}html.nl-cap-foreign:not([data-nl-gift-has="1"]) .nl-north-star-gift-stack{display:none!important;}html.nl-cap-foreign:not([data-nl-platform-ready]) #noWatchRankingHint{visibility:hidden;}html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label,html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label,html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label,html.nl-cap-showroom #watchConcurrentCard .nl-live-stat-label,html.nl-cap-mixch #watchConcurrentCard .nl-live-stat-label,html.nl-cap-whowatch #watchConcurrentCard .nl-live-stat-label,html.nl-cap-tiktok #watchConcurrentCard .nl-live-stat-label,html.nl-cap-twitcasting #watchConcurrentCard .nl-live-stat-label,html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label{font-size:0!important;line-height:1.2!important;overflow:visible!important;color:transparent!important;}html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label::after{content:"同時視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-showroom #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-mixch #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-whowatch #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-tiktok #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-twitcasting #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label::after{content:"視聴数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}html.nl-cap-foreign.nl-count-loading #watchConcurrentSub{font-size:0!important;color:transparent!important;}html.nl-cap-foreign .nl-nameplate-inline{display:none!important;}html.nl-cap-foreign .nl-record-sub:has(#nameplateOnBtn){display:none!important;}html.nl-cap-foreign #northStarLanes:not(:has([data-lane]:not([hidden]))){display:none!important;}html.nl-cap-foreign [data-lane="contributionRanking"]:not(:has([role="listitem"])){display:none!important;}html.nl-cap-foreign #northStarLanes:not(:has([role="listitem"])){display:none!important;}html.nl-cap-no-post .nl-comment-compose{display:none!important;}html.nl-cap-foreign details:has(#giftSubAppHistorySummary){display:none!important;}html.nl-cap-foreign .nl-anonymous-identicon-opt,html.nl-cap-foreign #anonymousIdenticonHint,html.nl-cap-foreign #foldAnonymousInRankStripHint{display:none!important;}html.nl-cap-foreign #sceneStoryUserLaneAdWrap{display:none!important;}html.nl-cap-foreign #devMonitorForceRefetchCommenterFollowBtn{display:none!important;}html.nl-cap-no-paid details:has(#giftQuickStatsMount){display:none!important;}html.nl-cap-no-paid #sceneStoryUserLaneGiftWrap{display:none!important;}';
    root.appendChild(style);

    function foreignWords(t) {
      var page = '配信ページ';
      var s = String(t || '');
      if (!s || !/watch|nicolivelog|生放送/i.test(s)) return s;
      s = s.replace(/\s*watch\s*ページ/g, page);
      s = s.replace(/\s*watch\s*タブ/g, '配信タブ');
      s = s.replace(/（watch）/g, '（' + page + '）');
      s = s.replace(/\s*watch\s*を/g, page + 'を');
      s = s.replace(/\s*watch\s*の/g, page + 'の');
      if (s.replace(/^\s+|\s+$/g, '') === 'watch') s = page;
      var pairs = [
        ['Downloads/nicolivelog-mcp/', 'ダウンロードフォルダ'],
        ['nicolivelog', '開発用の名前'],
        ['別々の生放送', '別々の配信']
      ];
      for (var i = 0; i < pairs.length; i++) {
        if (s.indexOf(pairs[i][0]) >= 0) s = s.split(pairs[i][0]).join(pairs[i][1]);
      }
      return s;
    }
    function applyForeignWords(scope) {
      if (!scope) return;
      var skip = '#supportTimelineBody,#commentTickerViewport,#commentInput,#userRoomList,#changelogList';
      var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) {
        var parent = n.parentElement;
        var tag = parent && parent.tagName;
        if (!n.nodeValue || tag === 'SCRIPT' || tag === 'STYLE') continue;
        if (parent && parent.closest && parent.closest(skip)) continue;
        var next = foreignWords(n.nodeValue);
        if (next !== n.nodeValue) n.nodeValue = next;
      }
      var els = scope.querySelectorAll('[title],[aria-label],[placeholder]');
      for (var e = 0; e < els.length; e++) {
        var el = els[e];
        if (el.closest && el.closest(skip)) continue;
        var names = ['title', 'aria-label', 'placeholder'];
        for (var a = 0; a < names.length; a++) {
          var cur = el.getAttribute(names[a]);
          if (!cur) continue;
          var nw = foreignWords(cur);
          if (nw !== cur) el.setAttribute(names[a], nw);
        }
      }
      document.documentElement.setAttribute('data-nl-foreign-wording', '1');
    }
    function arm() {
      var est = document.getElementById('watchConcurrentEst');
      var sub = document.getElementById('watchConcurrentSub');
      var card = document.getElementById('watchConcurrentCard');
      var label = card && card.querySelector('.nl-live-stat-label');
      var icon = card && card.querySelector('.nl-live-stat-icon');
      var want = LABELS[cap];
      if (label && label.textContent !== want) label.textContent = want;
      if (icon) {
        if (icon.getAttribute('title') !== want) icon.setAttribute('title', want);
        if (icon.getAttribute('aria-label') !== want) icon.setAttribute('aria-label', want);
      }
      var rankLane = document.querySelector('[data-lane="contributionRanking"]');
      var giftLane = document.querySelector('[data-lane="giftHistory"]');
      if (cap === 'abema') {
        if (rankLane) rankLane.hidden = true;
        if (giftLane) giftLane.hidden = true;
      } else if (LANES[cap]) {
        var rankLabel = rankLane && rankLane.querySelector('.nl-north-star-lane__label');
        var rankSub = rankLane && rankLane.querySelector('.nl-north-star-lane__sublabel');
        var giftLabel = giftLane && giftLane.querySelector('.nl-north-star-lane__label');
        var giftSub = giftLane && giftLane.querySelector('.nl-north-star-lane__sublabel');
        if (rankLabel) rankLabel.textContent = LANES[cap].rank;
        if (rankSub) rankSub.textContent = 'このPCの記録です。';
        if (giftLabel && giftLabel.firstChild && giftLabel.firstChild.nodeType === 3) giftLabel.firstChild.nodeValue = LANES[cap].gift;
        else if (giftLabel) giftLabel.textContent = LANES[cap].gift;
        if (giftSub) giftSub.textContent = 'このPCの記録です。';
      }
      var summary = document.querySelector('#nlPopupSettings > summary');
      var exportHint = document.getElementById('exportToolbarHint');
      function dropNafuda(t) { return String(t || '').replace(/・なふだ/g, '').replace(/なふだ・/g, ''); }
      if (summary && summary.textContent !== dropNafuda(summary.textContent)) summary.textContent = dropNafuda(summary.textContent);
      if (exportHint && exportHint.textContent !== dropNafuda(exportHint.textContent)) exportHint.textContent = dropNafuda(exportHint.textContent);
      var venueToggle = document.getElementById('venueButtonVisibleToggle');
      var venueHint = venueToggle && venueToggle.parentElement && venueToggle.parentElement.querySelector('.nl-record-sub__hint');
      if (venueHint && String(venueHint.textContent || '').indexOf('ニコ生') >= 0) {
        venueHint.textContent = '視聴ページの右下に出る「会場モード」ボタンです。使わない場合はオフにすると出なくなります（反映には視聴ページの再読み込みが必要です）。';
      }
      var copy = COPY[cap];
      if (copy) {
        var tl = document.querySelector('.nl-support-timeline__summary-label');
        if (tl) tl.textContent = copy.timeline;
        var tb = document.getElementById('supportTimelineBody');
        if (tb) tb.setAttribute('aria-label', copy.paid ? ('コメントと' + copy.paid + 'の時系列') : 'コメントの時系列');
        var users = document.getElementById('giftQuickStatsMount');
        var usersDetails = users && users.closest('details');
        if (usersDetails) {
          if (!copy.users) usersDetails.hidden = true;
          else {
            var us = usersDetails.querySelector('summary');
            if (us) us.textContent = copy.users;
          }
        }
        var side = document.getElementById('giftSubAppHistorySummary');
        var sideDetails = side && side.closest('details');
        if (sideDetails) sideDetails.hidden = true;
        var hideSel = ['.nl-anonymous-identicon-opt', '#anonymousIdenticonHint', '#foldAnonymousInRankStripHint', '#sceneStoryUserLaneAdWrap', '#devMonitorForceRefetchCommenterFollowBtn'];
        for (var hi = 0; hi < hideSel.length; hi++) {
          var nodes = document.querySelectorAll(hideSel[hi]);
          for (var hj = 0; hj < nodes.length; hj++) nodes[hj].hidden = true;
        }
        if (!copy.users) {
          var gw = document.getElementById('sceneStoryUserLaneGiftWrap');
          if (gw) gw.hidden = true;
        }
        var effect = document.querySelector('label[for="effectSoundToggle"] > span');
        if (effect && effect.firstChild && effect.firstChild.nodeType === 3) effect.firstChild.nodeValue = copy.effect;
        var effectHint = effect && effect.querySelector('.nl-record-sub__hint');
        if (effectHint) effectHint.textContent = copy.hint;
        var calm = document.querySelector('label[for="calmPanelMotion"] > span');
        if (calm) calm.textContent = 'パネル内の動きを抑える（ループアニメ・帯など。節目の演出は出ます）';
        var headerSub = document.querySelector('.nl-header .nl-sub');
        if (headerSub && String(headerSub.textContent || '').indexOf('ニコ生') >= 0) headerSub.textContent = '応援コメントを、このPCで見える化（記録は自分でON）';
        function swapText(el, from, to) {
          if (!el) return;
          var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          var node;
          while ((node = w.nextNode())) {
            if (node.nodeValue && node.nodeValue.indexOf(from) >= 0) node.nodeValue = node.nodeValue.split(from).join(to);
          }
        }
        swapText(document.querySelector('.nl-project-concept-body'), 'ニコ生の', '');
        swapText(document.getElementById('commentHarvestBanner'), 'ニコ生の画面改修', '配信ページの画面の変化');
        var gate = document.getElementById('usageTermsGate');
        swapText(gate, 'ニコニコの利用条件ページの写しではありません', 'その配信サービスの利用条件ページの写しではありません');
        swapText(gate, 'ニコニコのサーバーから読み込まれる', 'その配信サービスのサーバーから読み込まれる');
        var nicoLink = gate && gate.querySelector('a[href*="nicovideo.jp"]');
        var nicoRow = nicoLink && nicoLink.closest('tr');
        if (nicoRow) nicoRow.hidden = true;
        var shadeMsg = document.querySelector('.nl-init-shade__submsg');
        if (shadeMsg && String(shadeMsg.textContent || '').indexOf('ギフト履歴') >= 0) shadeMsg.textContent = 'コメントの記録は、配信ページを開くと取り込めます。';
      }
      applyForeignWords(document.body);
      if (!est) return;
      var last = '';
      var lastSub = '';
      function trim(t) { return String(t || '').replace(/^\s+|\s+$/g, ''); }
      function paint() {
        var t = trim(est.textContent);
        if (/^[0-9,]+$/.test(t)) {
          last = t;
          lastSub = sub ? sub.textContent : '';
          root.classList.remove('nl-count-loading');
          return;
        }
        if (last) {
          if (t !== last) est.textContent = last;
          if (sub && sub.textContent !== lastSub) sub.textContent = lastSub;
          root.classList.remove('nl-count-loading');
          return;
        }
        if (t !== '読み込み中') est.textContent = '読み込み中';
        if (sub && sub.textContent !== '') sub.textContent = '';
      }
      paint();
      var ob = new MutationObserver(paint);
      ob.observe(est, { childList: true, characterData: true, subtree: true });
      if (sub) ob.observe(sub, { childList: true, characterData: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
  } catch { /* 表示の先回りが失敗しても、数字自体はあとから出る */ }
})();
