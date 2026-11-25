/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPlatformMetricChrome, buildForeignCapabilityCss, watchPlatformMetricChrome } from './platformMetricChrome.js';
import { PLATFORM_CAPABILITIES, bootSubBoardIds, rewriteForeignWording, tallySupportItems } from './platformMetrics.js';

function mount() {
  document.body.innerHTML = `
    <div id="liveStatCards">
      <div class="nl-live-stat-card" id="watchConcurrentCard">
        <img class="nl-live-stat-icon" title="広告ランキングのレーンへ移動" alt="" />
        <div class="nl-live-stat-label">推定同時接続</div>
        <div id="watchConcurrentEst">108</div>
        <div id="watchConcurrentLoading" aria-label="推定同時接続を読み込み中"></div>
      </div>
      <div class="nl-live-stat-card nl-live-stat-card--visitors">
        <div class="nl-live-stat-label">来場者数</div>
        <div id="watchViewerDom">（数字非公開）</div>
      </div>
      <div class="nl-official-nico-stats__row" aria-label="公式視聴統計の一覧">
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">来場</span><span id="officialStatNicoViewers">108</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">本家コメ</span><span id="officialStatNicoComments">—</span><span id="officialStatNicoCommentsRate"></span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">経過</span><span id="officialStatNicoStreamAge">15分</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">広告pt</span><span id="officialStatNicoAdPts">—</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">ギフトpt</span><span id="officialStatNicoGiftPts">—</span></div>
      </div>
    </div>
    <section id="northStarLanes">
      <div data-nl-trio-slot="konta" title="こん太（広告ランキング）"></div>
      <div data-lane="contributionRanking"><p class="nl-north-star-lane__label">ギフト貢献度</p><p class="nl-north-star-lane__sublabel">ニコニコ公式</p></div>
      <div data-lane="giftHistory">
        <p class="nl-north-star-lane__label">この番組へのギフト履歴<span id="giftHistoryProgramPt">公式累計</span></p>
        <p class="nl-north-star-lane__sublabel">履歴</p>
      </div>
      <div data-lane="adRanking"></div>
      <div data-lane="programPoints"></div>
      <div data-lane="eventRank"></div>
      <div data-lane="eventScore"></div>
      <div data-lane="eventVotingSupporters"></div>
      <p class="nl-north-star-lanes__note">公式ページで見えている値を写します。</p>
      <p id="northStarLaneGadgetSummary-giftHistory"><span class="nl-north-star-lane__summary-note">公式番組累計（プレイヤー表示と同じ）</span></p>
    </section>
    <div id="giftRankingFetchPrompt"></div>
    <a id="watchOfficialEventBannerCard"></a>
  `;
  return document;
}

describe('applyPlatformMetricChrome', () => {
  it('数が来る前のニコ生の札(（接続中…）・推定中・—)は、ほかのサービスでは読み込み中にする', () => {
    for (const t of ['（接続中…）', '（取得不可）', '推定中', '—', '~120']) {
      const root = mount();
      root.querySelector('#watchConcurrentEst').textContent = t;
      applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
      expect(root.querySelector('#watchConcurrentEst').textContent).toBe('読み込み中');
    }
    const root = mount();
    root.querySelector('#watchConcurrentEst').textContent = '8,664';
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
    expect(root.querySelector('#watchConcurrentEst').textContent).toBe('8,664');
  });

  it('YouTube ではニコ生のチップを隠し、このPCの合計を足す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, {
      platform: 'youtube',
      facts: {
        streamAgeProvenance: 'official',
        support: tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'JPY' }, { kind: 'membership' }]),
      },
    });
    expect(root.querySelector('.nl-live-stat-card--visitors').hidden).toBe(true);
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-label').textContent).toBe('同時視聴者数');
    expect(root.querySelector('#officialStatNicoAdPts').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoViewers').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoComments').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoGiftPts').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoStreamAge').parentElement.hidden).toBe(false);
    expect(root.querySelector('[data-nl-metric="superchat"] .nl-official-nico-stats__val').textContent).toBe('¥500 · 1件');
    // v0.1.2207: メンバー加入は 1 以上なら出す(以前は出さなかった)。推定がスパチャより前
    expect(root.querySelector('[data-nl-metric="members"] .nl-official-nico-stats__val').textContent).toBe('1人');
    const keys = [...root.querySelectorAll('[data-nl-metric]')].map((el) => el.getAttribute('data-nl-metric'));
    expect(keys).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'superchat', 'members']);
    expect(root.documentElement.classList.contains('nl-cap-youtube')).toBe(true);
    expect(root.querySelector('[data-lane="adRanking"]').hidden).toBe(true);
    expect(root.querySelector('#giftRankingFetchPrompt').hidden).toBe(true);
    expect(root.querySelector('[data-lane="contributionRanking"] .nl-north-star-lane__label').textContent).toContain('スパチャの合計順');
    expect(root.querySelector('[data-lane="contributionRanking"] .nl-north-star-lane__sublabel').textContent).toBe('ニコニコ公式');
    expect(root.querySelector('#giftHistoryProgramPt').hidden).toBe(true);
    expect(root.querySelector('[data-lane="giftHistory"] .nl-north-star-lane__label').textContent).toContain('スーパーチャット・ギフト');
    expect(root.querySelector('[data-nl-trio-slot="konta"]').getAttribute('title')).not.toContain('広告');
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-icon').getAttribute('title')).not.toContain('広告');
  });

  it('後から来た推定のチップも先頭に並べ直す(v0.1.2207)', () => {
    const root = mount();
    // 数える前: 公式の数だけ
    applyPlatformMetricChrome(root, { platform: 'mixch', facts: { official: { level: 3 } } });
    const before = [...root.querySelectorAll('[data-nl-metric]')].map((el) => el.getAttribute('data-nl-metric'));
    expect(before).toEqual(['level']);
    // 数え終わった後: 推定 → コイン → ギフト → 公式の数
    applyPlatformMetricChrome(root, {
      platform: 'mixch',
      facts: { official: { level: 3 }, support: tallySupportItems([{ kind: 'superchat', amount: 400, currency: 'MXCOIN', channelId: 'mx:1', giftName: 'バラ' }]) },
    });
    const after = [...root.querySelectorAll('[data-nl-metric]')].map((el) => el.getAttribute('data-nl-metric'));
    expect(after).toEqual(['estimatedViewerSpend', 'estimatedStreamerTakeHome', 'nativeTotal', 'paidGifts', 'level']);
    expect(root.querySelector('[data-nl-metric="estimatedViewerSpend"] .nl-official-nico-stats__val').textContent).toBe('約¥480');
  });

  it('記録にスパチャが1件も無いうちはギフト欄を出さず、来たら出す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: tallySupportItems([]) } });
    expect(document.documentElement.hasAttribute('data-nl-gift-has')).toBe(false);
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'JPY' }]) } });
    expect(document.documentElement.getAttribute('data-nl-gift-has')).toBe('1');
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: null } });
    expect(document.documentElement.getAttribute('data-nl-gift-has')).toBe('1');
    const css = document.getElementById('nl-platform-capability-style')?.textContent || '';
    expect(css).toContain('html.nl-cap-foreign:not([data-nl-gift-has="1"]) .nl-north-star-gift-stack{display:none!important;}');
  });

  it('ニコ生以外では、中身の無いギフト欄の点線の枠を出さない', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'abema', facts: {} });
    const css = document.getElementById('nl-platform-capability-style')?.textContent || '';
    expect(css).toContain('html.nl-cap-foreign .nl-north-star-gift-stack:not(:has(> [data-lane="giftHistory"]:not([hidden])))');
  });

  it('欄を出し直しても、次の適用でまた隠す', async () => {
    const root = mount();
    const stop = watchPlatformMetricChrome(root, () => ({ platform: 'twitch', facts: { support: null } }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    // Twitch は広告ランキングの欄に公式のギフトサブ順位を出す=隠さない(中身が無ければニコ生版の部品が隠す)
    expect(root.querySelector('[data-lane="adRanking"]').dataset.nlPlatformHide).toBeUndefined();
    root.querySelector('#giftRankingFetchPrompt').hidden = false;
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => r()));
    expect(root.querySelector('#giftRankingFetchPrompt').hidden).toBe(true);
    expect(root.querySelector('[data-nl-metric="superchat"]')).toBeNull();
    stop();
  });

  it('適用し終えたら止まる(自分の書き換えで次の適用を呼び続けない・0.1.2126)', async () => {
    const root = mount();
    let runs = 0;
    const facts = { viewers: 12, support: tallySupportItems([{ kind: 'superchat', amount: 100, currency: 'BITS' }]) };
    const stop = watchPlatformMetricChrome(root, () => {
      runs += 1;
      return { platform: 'twitch', facts };
    });
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
    for (let i = 0; i < 4; i += 1) await frame();
    const settled = runs;
    for (let i = 0; i < 10; i += 1) await frame();
    // 何も変わっていない10フレームのあいだは1回も適用し直さない(前は毎フレーム回っていた)
    expect(runs).toBe(settled);
    // 経過のチップは末尾のまま
    expect(root.querySelector('.nl-official-nico-stats__row').lastElementChild?.querySelector('#officialStatNicoStreamAge')).not.toBeNull();
    // ニコ生版の描画が欄を出し直したら、また適用して隠す(見張りは生きている)
    root.querySelector('#giftRankingFetchPrompt').hidden = false;
    await frame();
    await frame();
    expect(runs).toBeGreaterThan(settled);
    expect(root.querySelector('#giftRankingFetchPrompt').hidden).toBe(true);
    stop();
  });

  it('2つめの公式ランキングがあるサービスだけ広告ランキングの欄を使い、前の配信で隠した印を外す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
    expect(root.querySelector('[data-lane="adRanking"]').hidden).toBe(true);
    expect(document.documentElement.classList.contains('nl-cap-subboard')).toBe(false);
    applyPlatformMetricChrome(root, { platform: 'kick', facts: {} });
    expect(root.querySelector('[data-lane="adRanking"]').hidden).toBe(false);
    expect(document.documentElement.classList.contains('nl-cap-subboard')).toBe(true);
    const css = document.getElementById('nl-platform-capability-style')?.textContent || '';
    expect(css).toContain('html.nl-cap-foreign:not(.nl-cap-subboard) [data-lane="adRanking"]');
    expect(css).toContain('[data-lane="adRanking"] .nl-north-star-ad-stats__row:first-child{display:none!important;}');
    applyPlatformMetricChrome(root, { platform: 'abema', facts: {} });
    expect(document.documentElement.classList.contains('nl-cap-subboard')).toBe(false);
  });

  it('ミクチャへ移ると YouTube の見出しは残さず、ギフトの見出しにする', () => {
    const root = mount();
    const label = () => root.querySelector('[data-lane="giftHistory"] .nl-north-star-lane__label').firstChild.nodeValue;
    const sub = () => root.querySelector('[data-lane="giftHistory"] .nl-north-star-lane__sublabel').textContent;
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
    expect(label()).toBe('スーパーチャット・ギフト');
    applyPlatformMetricChrome(root, { platform: 'mixch', facts: {} });
    expect(label()).toBe('ギフト');
    expect(sub()).toBe('このPCの記録です。');
    expect(root.querySelector('#giftHistoryProgramPt')).not.toBeNull();
  });

  it('見出しを持たないサービスでは、ニコ生版の描画が書き直した見出しを戻さない', () => {
    const root = mount();
    const p = root.querySelector('[data-lane="giftHistory"] .nl-north-star-lane__label');
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
    p.firstChild.nodeValue = 'ギフト履歴(書き直し)';
    applyPlatformMetricChrome(root, { platform: 'other', facts: {} });
    expect(p.firstChild.nodeValue).toBe('ギフト履歴(書き直し)');
  });

  it('ニコ生の状態では何も隠さない', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'niconico', facts: {} });
    expect(root.querySelector('.nl-live-stat-card--visitors').hidden).toBe(false);
    expect(root.querySelector('#officialStatNicoAdPts').parentElement.hidden).toBe(false);
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-label').textContent).toBe('推定同時接続');
  });

  it('SHOWROOM の見出しを出し、ニコ生の「直接値」は消す', () => {
    const root = mount();
    const est = root.querySelector('#watchConcurrentEst');
    const sub = root.createElement('div');
    sub.id = 'watchConcurrentSub';
    sub.textContent = '直接値';
    est.after(sub);
    applyPlatformMetricChrome(root, { platform: 'showroom', facts: {} });
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-label').textContent).toBe('視聴者数');
    expect(sub.textContent).toBe('');
    const css = root.querySelector('#nl-platform-capability-style').textContent;
    expect(css).toContain('html.nl-cap-showroom #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数"');
    expect(css).not.toContain('[data-lane="adRanking"]{display:none');
    expect(css).toContain('html.nl-cap-foreign:not(.nl-cap-subboard) [data-lane="adRanking"]');
  });
});

  it('SHOWROOM ではなふだと空の公式の数字を出さず、コメント欄は残す', () => {
    const root = mount();
    const inline = root.createElement('div');
    inline.className = 'nl-nameplate-inline';
    inline.textContent = 'これはニコ生そのものの設定';
    const details = root.createElement('details');
    details.id = 'nlPopupSettings';
    const summary = root.createElement('summary');
    summary.textContent = '詳細設定（記録のON/OFF・なふだ・取り込み・パネル位置・動き・表示トラブル）';
    details.append(summary);
    const lanes = root.createElement('section');
    lanes.id = 'northStarLanes';
    const lane = root.createElement('div');
    lane.dataset.lane = 'adRanking';
    lane.hidden = true;
    lanes.append(lane);
    const compose = root.createElement('section');
    compose.className = 'nl-comment-compose';
    root.body.append(inline, details, lanes, compose);
    applyPlatformMetricChrome(root, { platform: 'showroom', facts: {} });
    expect(inline.hidden).toBe(true);
    expect(summary.textContent).toBe('詳細設定（記録のON/OFF・取り込み・パネル位置・動き・表示トラブル）');
    expect(compose.hidden).toBe(false);
    const css = root.getElementById('nl-platform-capability-style').textContent;
    expect(css).toContain('html.nl-cap-foreign .nl-nameplate-inline{display:none!important;}');
    expect(css).toContain('#northStarLanes:not(:has([data-lane]:not([hidden])))');
    expect(css).not.toContain('html.nl-cap-foreign .nl-comment-compose');
    expect(css).toContain('details:has(#giftSubAppHistorySummary)');
    expect(css).toContain('html.nl-cap-no-paid details:has(#giftQuickStatsMount)');
  });

  it('SHOWROOM はギフトの見出しに直し、広告とサイドバーと a: を出さない', () => {
    const root = mount();
    const header = root.createElement('p');
    header.className = 'nl-sub';
    const brand = root.createElement('div');
    brand.className = 'nl-header';
    brand.append(header);
    header.textContent = 'ニコ生の応援コメントを、このPCで見える化（記録は自分でON）';
    const tl = root.createElement('span');
    tl.className = 'nl-support-timeline__summary-label';
    tl.textContent = '応援タイムライン（コメント＋ギフト）';
    const users = root.createElement('details');
    const usersSummary = root.createElement('summary');
    usersSummary.textContent = 'ギフト・広告ユーザー（簡易）';
    const mountEl = root.createElement('div');
    mountEl.id = 'giftQuickStatsMount';
    users.append(usersSummary, mountEl);
    const side = root.createElement('details');
    const sideSummary = root.createElement('summary');
    sideSummary.id = 'giftSubAppHistorySummary';
    sideSummary.textContent = 'ギフトサイドバー履歴（未取得）';
    side.append(sideSummary);
    const anon = root.createElement('label');
    anon.className = 'nl-anonymous-identicon-opt';
    anon.textContent = 'a:xxxxx';
    const concept = root.createElement('div');
    concept.className = 'nl-project-concept-body';
    concept.textContent = 'ニコ生の応援コメントをこのPCに記録';
    root.body.append(brand, tl, users, side, anon, concept);
    applyPlatformMetricChrome(root, { platform: 'showroom', facts: {} });
    expect(header.textContent).toBe('応援コメントを、このPCで見える化（記録は自分でON）');
    expect(tl.textContent).toBe('応援タイムライン（コメント＋ギフト）');
    expect(usersSummary.textContent).toBe('ギフトユーザー（簡易）');
    expect(users.hidden).toBe(false);
    expect(side.hidden).toBe(true);
    expect(anon.hidden).toBe(true);
    expect(concept.textContent).toBe('応援コメントをこのPCに記録');
    expect(root.documentElement.classList.contains('nl-cap-no-paid')).toBe(false);
  });

  it('ABEMA はギフトの欄を出さず、タイムラインはコメントだけ', () => {
    const root = mount();
    const tl = root.createElement('span');
    tl.className = 'nl-support-timeline__summary-label';
    tl.textContent = '応援タイムライン（コメント＋ギフト）';
    const users = root.createElement('details');
    const mountEl = root.createElement('div');
    mountEl.id = 'giftQuickStatsMount';
    users.append(root.createElement('summary'), mountEl);
    root.body.append(tl, users);
    applyPlatformMetricChrome(root, { platform: 'abema', facts: {} });
    expect(tl.textContent).toBe('応援タイムライン（コメント）');
    expect(users.hidden).toBe(true);
    expect(root.documentElement.classList.contains('nl-cap-no-paid')).toBe(true);
  });

  it('watch と nicolivelog を1回だけ配信ページの言い方にする。コメント本文は残す', () => {
    document.documentElement.removeAttribute('data-nl-foreign-wording');
    const root = mount();
    const legend = root.createElement('span');
    legend.id = 'inlinePanelWidthLegend';
    legend.textContent = 'ページ内パネルの位置・幅（watch）';
    const reload = root.createElement('button');
    reload.id = 'reloadWatchTabPanelBtn';
    reload.textContent = 'watch を再読み込み';
    reload.title = '対象の watch タブを再読み込みします（F5 と同じ）';
    const about = root.createElement('p');
    about.className = 'nl-project-concept';
    about.textContent = '開発識別子として nicolivelog が含まれることがあります。';
    const box = root.createElement('textarea');
    box.id = 'commentInput';
    box.textContent = 'watch を見てね';
    root.body.append(legend, reload, about, box);
    applyPlatformMetricChrome(root, { platform: 'twitch', facts: {} });
    expect(legend.textContent).toBe('ページ内パネルの位置・幅（配信ページ）');
    expect(reload.textContent).toBe('配信ページを再読み込み');
    expect(reload.getAttribute('title')).toBe('対象の配信タブを再読み込みします（F5 と同じ）');
    expect(about.textContent).toBe('開発識別子として 開発用の名前 が含まれることがあります。');
    expect(box.textContent).toBe('watch を見てね');
    legend.textContent = 'ページ内パネルの位置・幅（watch）';
    applyPlatformMetricChrome(root, { platform: 'twitch', facts: {} });
    expect(legend.textContent).toBe('ページ内パネルの位置・幅（watch）');
    document.documentElement.removeAttribute('data-nl-foreign-wording');
    const nico = mount();
    const nicoLegend = nico.createElement('span');
    nicoLegend.textContent = 'ページ内パネルの位置・幅（watch）';
    nico.body.append(nicoLegend);
    applyPlatformMetricChrome(nico, { platform: 'niconico', facts: {} });
    expect(nicoLegend.textContent).toBe('ページ内パネルの位置・幅（watch）');
  });

describe('開いた瞬間の CSS', () => {
  it('boot は能力表と同じ文字列と、全サービスの見出しを持つ', () => {
    const boot = readFileSync(join(process.cwd(), 'extension/yt-loading-boot.js'), 'utf8');
    expect(boot).toContain(buildForeignCapabilityCss());
    expect(boot).toContain('nl-count-loading');
    expect(boot).toContain("q.get('site')");
    for (const id of bootSubBoardIds()) expect(boot).toContain(`${id}: 1`);
    for (const [id, cap] of Object.entries(PLATFORM_CAPABILITIES)) {
      if (cap.native === true) continue;
      expect(boot).toContain(`${id}: '${cap.concurrentLabel}'`);
    }
    const start = boot.indexOf('function foreignWords');
    const end = boot.indexOf('function applyForeignWords');
    const foreignWords = new Function(`${boot.slice(start, end)}\nreturn foreignWords;`)();
    const sample = 'watch を再読み込み。開発識別子として nicolivelog。別々の生放送。';
    expect(foreignWords(sample)).toBe(rewriteForeignWording(sample, 'showroom'));
  });
});
