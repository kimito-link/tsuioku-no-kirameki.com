/*
 * 紅白の順位を、当サイトの /api/kouhaku-ranking だけから描く。
 * ニコニコのページは取りに行かない。アイコンは返ってきた公開URLをブラウザが見る。
 */
/* global document, location, fetch, navigator */
(function () {
  'use strict';
  var BLANK_ICON = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
  var root = document.getElementById('kouhaku-root');
  if (!root) return;
  var route = routeFromPath(location.pathname);
  var userId = route.userId;
  var endpoint = rankingEndpoint(route.eventId, userId);

  function routeFromPath(pathname) {
    var event = String(pathname || '').match(/\/live\/event\/([a-z0-9-]{1,40})(?:\/u\/(\d{1,16}))?\/?$/);
    if (event) return { eventId: event[1], userId: event[2] || '' };
    var legacy = String(pathname || '').match(/\/live\/kouhaku(?:\/u\/(\d{1,16}))?\/?$/);
    if (legacy) return { eventId: 'kouhaku-2026', userId: legacy[1] || '' };
    return { eventId: '', userId: '' };
  }

  function rankingEndpoint(eventId, personId) {
    var params = [];
    if (eventId) params.push('event=' + encodeURIComponent(eventId));
    if (personId) params.push('user=' + encodeURIComponent(personId));
    return params.length ? '/api/kouhaku-ranking?' + params.join('&') : '/api/kouhaku-ranking';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function localPath(value) {
    var path = String(value || '');
    return /^\/live\/event\/[a-z0-9-]{1,40}\/u\/\d{1,16}\/$/.test(path) ? path : '';
  }

  function teamClass(id) {
    if (id === 'shiro') return 'team team--shiro';
    if (id === 'aka') return 'team team--aka';
    return 'team';
  }

  function applyChrome(data) {
    var title = document.getElementById('kouhaku-title');
    if (title && data.eventName) {
      title.textContent = title.tagName === 'H1' ? data.eventName : data.eventName + ' / イベントpt応援ランキング';
    }
    var more = document.getElementById('kouhaku-more');
    if (more && /^\/live\/event\/[a-z0-9-]{1,40}\/$/.test(data.boardPath || '')) more.setAttribute('href', data.boardPath);
    var source = document.getElementById('kouhaku-source');
    var sourceUrl = officialPage(data.sourceUrl);
    if (source && sourceUrl) {
      source.setAttribute('href', sourceUrl);
      source.hidden = false;
    }
  }

  function officialPage(value) {
    var url = httpsOnly(value);
    var host = url.slice('https://'.length).split('/')[0].split(':')[0];
    var suffix = 'nicovideo.jp';
    if (!host || host.slice(-suffix.length) !== suffix) return '';
    if (host.length > suffix.length && host.charAt(host.length - suffix.length - 1) !== '.') return '';
    return url;
  }

  function httpsOnly(value) {
    var url = String(value || '');
    var scheme = url.split(':')[0];
    if (scheme !== 'https') return '';
    return url;
  }

  function iconSrc(value) {
    var url = httpsOnly(value);
    if (url.indexOf('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/') !== 0) return BLANK_ICON;
    return url;
  }

  function iconImage(entry, size) {
    var img = el('img', size > 40 ? 'ava ava--lg' : 'ava');
    img.src = iconSrc(entry.iconUrl);
    img.alt = entry.displayName || '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      if (img.getAttribute('data-fallback') === '1') return;
      img.setAttribute('data-fallback', '1');
      img.src = BLANK_ICON;
    });
    return img;
  }

  function fillMeta(label) {
    var meta = document.getElementById('official-meta');
    if (!meta) return;
    meta.textContent = '';
    var faceSrc = meta.getAttribute('data-face') || '';
    if (faceSrc) {
      var face = el('img', 'face');
      face.src = faceSrc;
      face.alt = '';
      meta.appendChild(face);
    }
    var text = el('span');
    text.appendChild(document.createTextNode('最終の公式更新 '));
    text.appendChild(el('b', '', label || '—'));
    text.appendChild(document.createTextNode('。公式は1日1回更新です。'));
    meta.appendChild(text);
  }

  function renderBoard(data) {
    fillMeta(data.officialUpdateLabel);
    applyChrome(data);
    root.textContent = '';
    var teams = el('div', 'teams');
    var columns = Array.isArray(data.columns) && data.columns.length
      ? data.columns
      : [
        { id: 'aka', label: '紅組', entries: data.aka || [] },
        { id: 'shiro', label: '白組', entries: data.shiro || [] }
      ];
    columns.forEach(function (column) {
      var section = el('section', teamClass(column.id));
      if (column.color) section.style.setProperty('--team-color', column.color);
      if (column.background) section.style.setProperty('--team-bg', column.background);
      section.appendChild(el('h2', '', column.label || ''));
      var rows = el('div', 'team-rows');
      (column.entries || []).forEach(function (entry) {
        var href = localPath(entry.pagePath);
        var row = el('div', 'row');
        row.appendChild(el('div', 'rank', String(entry.rank)));
        var who = href ? el('a', 'who') : el('div', 'who');
        if (href) who.href = href;
        who.appendChild(iconImage(entry, 28));
        var body = el('span', 'who-text');
        body.appendChild(el('span', 'name', entry.displayName));
        body.appendChild(el('span', 'score', entry.scoreLabel));
        who.appendChild(body);
        row.appendChild(who);
        row.appendChild(el('p', 'sub', entry.gapLabel));
        row.appendChild(el('p', 'sub', entry.deltaLabel));
        var shareUrl = httpsOnly(entry.shareUrl);
        if (shareUrl.indexOf('https://x.com/intent/post?') === 0) {
          var cheer = el('a', 'cheer', '応援');
          cheer.href = shareUrl;
          cheer.target = '_blank';
          cheer.rel = 'noopener noreferrer';
          row.appendChild(cheer);
        }
        rows.appendChild(row);
      });
      section.appendChild(rows);
      teams.appendChild(section);
    });
    root.appendChild(teams);
    appendAppCta(root);
  }

  function appendAppCta(parent) {
    var api = globalThis.KouhakuAppCta;
    if (!api) return;
    var cta = api.appCtaForUserAgent(navigator.userAgent || '');
    if (!cta || String(cta.href || '').indexOf('https://') !== 0) return;
    var box = el('aside', 'app-cta');
    box.appendChild(el('p', '', cta.text));
    var link = el('a', 'btn btn--primary', cta.label);
    link.href = cta.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    box.appendChild(link);
    parent.appendChild(box);
  }

  function renderProfile(data) {
    var entry = data.entry || {};
    fillMeta(data.officialUpdateLabel);
    applyChrome(data);
    if (entry.displayName) document.title = entry.displayName + ' ' + (entry.teamLabel || '') + ' ' + entry.rank + '位 ― ' + (data.eventName || 'イベントpt応援ランキング');
    root.textContent = '';
    var hero = el('article', entry.team === 'shiro' ? 'hero hero--shiro' : (entry.team === 'aka' ? 'hero hero--aka' : 'hero'));
    if (entry.team !== 'aka' && entry.team !== 'shiro') hero.style.setProperty('--team-color', '#14375c');
    hero.appendChild(iconImage(entry, 72));
    hero.appendChild(el('p', 'team-name', entry.teamLabel || ''));
    hero.appendChild(el('p', 'big', entry.rank ? String(entry.rank) + '位' : '—'));
    hero.appendChild(el('h2', '', entry.displayName || ''));
    hero.appendChild(el('p', '', entry.scoreLabel ? '公式 ' + entry.scoreLabel : ''));
    hero.appendChild(el('p', '', entry.gapLabel || ''));
    hero.appendChild(el('p', '', entry.deltaLabel || ''));
    var actions = el('div', 'actions');
    var share = data.share || {};
    var xUrl = httpsOnly(share.xUrl);
    var lineUrl = httpsOnly(share.lineUrl);
    if (xUrl.indexOf('https://x.com/intent/post?') === 0) {
      var x = el('a', 'btn btn--primary', 'Xで応援を伝える');
      x.href = xUrl;
      x.target = '_blank';
      x.rel = 'noopener noreferrer';
      actions.appendChild(x);
    }
    if (lineUrl.indexOf('https://social-plugins.line.me/lineit/share?') === 0) {
      var line = el('a', 'btn', 'LINEで応援を伝える');
      line.href = lineUrl;
      line.target = '_blank';
      line.rel = 'noopener noreferrer';
      actions.appendChild(line);
    }
    var official = httpsOnly(data.officialUserUrl);
    if (/^https:\/\/www\.nicovideo\.jp\/user\/\d{1,16}$/.test(official)) {
      var user = el('a', 'btn btn--block', 'ニコニコのユーザーページ');
      user.href = official;
      user.target = '_blank';
      user.rel = 'noopener noreferrer';
      actions.appendChild(user);
    }
    hero.appendChild(actions);
    appendAppCta(hero);
    root.appendChild(hero);
  }

  fetch(endpoint, { cache: 'no-store' })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data || data.ok === false) throw new Error('unavailable');
      if (userId) {
        if (!data.found || !data.entry) {
          root.textContent = '';
          root.appendChild(el('p', 'empty', 'この順位表には、いまその人は載っていません。'));
          return;
        }
        renderProfile(data);
        return;
      }
      renderBoard(data);
    })
    .catch(function () {
      root.textContent = '';
      root.appendChild(el('p', 'empty', 'いまは順位を表示できません。しばらくしてから、もう一度開いてください。'));
    });
})();
