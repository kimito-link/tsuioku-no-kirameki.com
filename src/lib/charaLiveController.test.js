/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { startCharaLive, REACTION_MIN_GAP_MS } from './charaLiveController.js';
import {
  listCharaLiveImagePaths,
  buildCharaLiveStageDom,
  charaLiveStageCss
} from './charaLiveStage.js';
import { CHARA_LIVE_IDS } from './charaLiveState.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 時間と rAF を手で回すテスト用ハーネス(実時間に依存させない)。 */
function makeHarness() {
  let now = 0;
  /** @type {Array<() => void>} */
  let frames = [];
  const live = startCharaLive({
    doc: document,
    resolveUrl: (p) => `chrome-extension://test/${p}`,
    now: () => now,
    requestFrame: (cb) => {
      frames.push(() => cb(now));
      return frames.length;
    },
    cancelFrame: () => {},
    reducedMotion: false,
    getHeatLevel: () => 0.3
  });
  return {
    live,
    advance(ms) {
      now += ms;
      const due = frames;
      frames = [];
      for (const f of due) f();
    },
    at: () => now
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('常駐ステージ', () => {
  it('3 体ぶんの DOM が常に出る', () => {
    const { root } = buildCharaLiveStageDom(document, (p) => p);
    const chars = root.querySelectorAll('.nlcl-chara');
    expect(chars).toHaveLength(3);
    expect([...chars].map((c) => c.dataset.chara)).toEqual(CHARA_LIVE_IDS);
  });

  it('配信の操作を奪わない(pointer-events を切ってある)', () => {
    const { live } = makeHarness();
    expect(live.root.className).toBe('nlcl-stage');
    const css = document.getElementById('nlcl-stage-style').textContent;
    expect(css).toContain('pointer-events: none');
    live.destroy();
  });

  it('先読み画像はすべて実在パターン(存在しない konta の normal-mouth- を作らない)', () => {
    const paths = listCharaLiveImagePaths();
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).not.toContain('kitsune-yukkuri-normal-mouth-');
      expect(p.endsWith('.png')).toBe(true);
    }
  });

  it('setVisible(false) で隠れ、描画も止まる(閉じても CPU を食わない)', () => {
    const h = makeHarness();
    h.advance(0);
    const el = h.live.root.querySelector('.nlcl-chara');
    h.advance(500);
    const before = el.style.transform;

    h.live.setVisible(false);
    expect(h.live.root.hidden).toBe(true);
    // 非表示中はフレームが進んでも描き変わらない。
    h.advance(5000);
    expect(el.style.transform).toBe(before);

    // 戻せば再び動き出す。
    h.live.setVisible(true);
    expect(h.live.root.hidden).toBe(false);
    h.advance(1500);
    expect(el.style.transform).not.toBe(before);
    h.live.destroy();
  });

  it('destroy でレイヤーが消える(放送ページに残骸を残さない)', () => {
    const { live } = makeHarness();
    expect(document.querySelectorAll('.nlcl-stage')).toHaveLength(1);
    live.destroy();
    expect(document.querySelectorAll('.nlcl-stage')).toHaveLength(0);
  });
});

describe('常駐アニメーション', () => {
  it('時間が進むと立ち絵の位置が変わる(止まって見えない)', () => {
    const h = makeHarness();
    h.advance(0);
    const first = h.live.root.querySelector('.nlcl-chara').style.transform;
    h.advance(1500);
    const later = h.live.root.querySelector('.nlcl-chara').style.transform;
    expect(first).toBeTruthy();
    expect(later).not.toBe(first);
    h.live.destroy();
  });
});

describe('コメント読み上げへの相槌', () => {
  it('読み上げが鳴った瞬間に 1 体が相槌を入れる', () => {
    const h = makeHarness();
    h.advance(0);
    h.live.onCommentSpoken({ commentKey: 'no:1' });
    h.advance(50);
    const speaking = h.live.root.querySelectorAll('.nlcl-chara.is-speaking');
    expect(speaking).toHaveLength(1);
    // 吹き出しが出ている。
    const bubble = speaking[0].querySelector('.nlcl-chara__bubble');
    expect(bubble.hidden).toBe(false);
    expect(bubble.textContent).toBeTruthy();
    h.live.destroy();
  });

  it('読み上げが終わったら黙る(声が止まったのに口が動き続けない)', () => {
    const h = makeHarness();
    h.advance(0);
    h.live.onCommentSpoken({ commentKey: 'no:1' });
    h.advance(50);
    expect(h.live.root.querySelectorAll('.nlcl-chara.is-speaking')).toHaveLength(1);
    h.live.onCommentSpokenEnd();
    h.advance(50);
    expect(h.live.root.querySelectorAll('.nlcl-chara.is-speaking')).toHaveLength(0);
    h.live.destroy();
  });

  it('連続コメントで喋りっぱなしにならない(間引きが効く)', () => {
    const h = makeHarness();
    h.advance(0);
    // 立て続けに 10 件届いても、間引き間隔より短ければ 1 回しか反応しない。
    for (let i = 0; i < 10; i += 1) {
      h.live.onCommentSpoken({ commentKey: `no:${i}` });
      h.advance(20);
    }
    expect(h.live.root.querySelectorAll('.nlcl-chara.is-speaking').length).toBeLessThanOrEqual(1);
    h.live.destroy();
  });

  it('十分に間が空けば再び反応する', () => {
    const h = makeHarness();
    h.advance(0);
    h.live.onCommentSpoken({ commentKey: 'no:1' });
    h.advance(50);
    h.live.onCommentSpokenEnd();
    h.advance(REACTION_MIN_GAP_MS + 100);
    h.live.onCommentSpoken({ commentKey: 'no:2' });
    h.advance(50);
    expect(h.live.root.querySelectorAll('.nlcl-chara.is-speaking')).toHaveLength(1);
    h.live.destroy();
  });
});

describe('配信者の呼びかけへの返事', () => {
  it('名指しされた子が答える', () => {
    const h = makeHarness();
    h.advance(0);
    const who = h.live.onStreamerAddressed({
      prompt: 'たぬ姉さん、これ詳しいよね',
      answer: 'そうタヌ'
    });
    expect(who).toBe('tanunee');
    h.advance(50);
    const el = h.live.root.querySelector('[data-chara="tanunee"]');
    expect(el.classList.contains('is-speaking')).toBe(true);
    expect(el.querySelector('.nlcl-chara__bubble').textContent).toContain('そうタヌ');
    h.live.destroy();
  });

  it('返事の吹き出しには名前が付く(誰が答えたか分かる)', () => {
    const h = makeHarness();
    h.advance(0);
    h.live.onStreamerAddressed({ prompt: 'りんく、どう?', answer: 'たのしい！' });
    h.advance(50);
    const el = h.live.root.querySelector('[data-chara="rinku"]');
    expect(el.querySelector('.nlcl-chara__name').textContent).toBe('りんく');
    h.live.destroy();
  });
});

describe('AI シンキング', () => {
  it('考えている間だけ「…」が出る', () => {
    const h = makeHarness();
    h.advance(0);
    expect(h.live.root.querySelectorAll('.nlcl-chara__think:not([hidden])')).toHaveLength(0);

    const who = h.live.beginThinking({ prompt: 'こん太、これ何?' });
    expect(who).toBe('konta');
    h.advance(50);
    const thinking = h.live.root.querySelectorAll('.nlcl-chara__think:not([hidden])');
    expect(thinking).toHaveLength(1);

    h.live.endThinking();
    h.advance(50);
    expect(h.live.root.querySelectorAll('.nlcl-chara__think:not([hidden])')).toHaveLength(0);
    h.live.destroy();
  });

  it('思考は時間で勝手に消えない(AI が終わるまで続く)', () => {
    const h = makeHarness();
    h.advance(0);
    h.live.beginThinking({});
    h.advance(120000); // 2 分待っても
    expect(h.live.root.querySelectorAll('.nlcl-chara__think:not([hidden])')).toHaveLength(1);
    h.live.endThinking();
    h.advance(50);
    expect(h.live.root.querySelectorAll('.nlcl-chara__think:not([hidden])')).toHaveLength(0);
    h.live.destroy();
  });

  it('名指し無しならたぬ姉(解説役)が考える', () => {
    const h = makeHarness();
    h.advance(0);
    expect(h.live.beginThinking({})).toBe('tanunee');
    h.live.destroy();
  });
});

/**
 * CSS のブロックコメントを除いた「実際に効く宣言だけ」を返す。
 *
 * ★これが無いと事故る(2026-08-25 実際に踏んだ): 解説コメントに書いた
 *   「z-index:2147483000」を正規表現が拾い、z6 に戻してもテストが通ってしまった。
 *   テストは【実際に効く値】だけを見なければ、守っているつもりで何も守れない。
 *
 * @param {string} css
 * @returns {string}
 */
function stripCssComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * `.nlcl-stage { … }` の中の実宣言を取り出す。
 * @param {string} css
 * @returns {string}
 */
function charaStageBlock(css) {
  const bare = stripCssComments(css);
  const i = bare.indexOf('.nlcl-stage {');
  return bare.slice(i, bare.indexOf('}', i));
}

/*
 * ★2026-08-25 実機で踏んだ事故の回帰テスト。
 *
 * 当初キャラを document.body 直下に position:fixed + z-index:2147483000 で置いた。
 * ところが会場ルート .nlsb-root も【まったく同じ z-index の全画面(inset:0)要素】で、
 * かつ後から DOM に入るため、同値 z-index は DOM 順で後勝ち＝キャラは完全に覆われ
 * 【一度も画面に出なかった】。単体テストは DOM を作れば通ってしまうので気づけない。
 *
 * よって「会場の実CSSと突き合わせる」形で固定する。venueBar.js の文字列を読むのは
 * 既存の *.wiring.test.js と同じ作法(別バンドルなので import できない)。
 */
describe('★会場に覆われない(実機で踏んだ事故の固定)', () => {
  const venueBarSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../extension/venueBar.js'),
    'utf8'
  );

  it('会場ステージの内側にマウントしている(body 直下に置かない)', () => {
    // startCharaLive の呼び出しが mount: stage を渡していること。
    const call = venueBarSrc.slice(venueBarSrc.indexOf('startCharaLive({'));
    expect(call.slice(0, 400)).toMatch(/mount:\s*stage/);
  });

  it('会場ルートと同じ z-index を使っていない(同値は DOM 順で負ける)', () => {
    const rootZ = venueBarSrc.match(/\.nlsb-root\s*\{[^}]*z-index:\s*(\d+)/);
    expect(rootZ, '.nlsb-root の z-index が読めない').toBeTruthy();
    expect(charaStageBlock(charaLiveStageCss())).not.toContain(`z-index: ${rootZ[1]}`);
  });

  /*
   * ★2回目の同じ失敗(2026-08-25)の固定。
   *   1回目を直すとき z6 にしたが、stage.append(stageLayout, bubbleLayer, rosterPanel, ...)
   *   は startCharaLive より先に走るため、【同じ z6 の rosterPanel より DOM順で前】に
   *   置かれてまた負けた。venueBar.js:2711 のコメント自身が
   *   「stage.appendの最後に置くことで同z-index(6)の常駐レイヤーより手前に来る」と
   *   言っている＝先に入る側は同値だと必ず負ける。
   *   よって「会場で使われている z-index の最大より大きい」ことを実測で要求する。
   */
  it('会場内のどの z-index よりも大きい(同値・以下だと DOM順で負ける)', () => {
    const used = [...venueBarSrc.matchAll(/z-index:\s*(\d+)/g)]
      .map((m) => Number(m[1]))
      // 会場ルート/トグルの 2147483000 はページ全体に対する値で、stage 内の重なりとは別軸。
      .filter((z) => z < 1000);
    expect(used.length, '会場の z-index が読めない').toBeGreaterThan(0);
    const maxInVenue = Math.max(...used);

    const mine = Number(/z-index:\s*(\d+)/.exec(charaStageBlock(charaLiveStageCss()))[1]);
    expect(
      mine,
      `会場の最大 z-index は ${maxInVenue}。キャラは ${mine} では手前に出ない`
    ).toBeGreaterThan(maxInVenue);
  });

  it('ステージ内で効く配置になっている(fixed だと親の外へ出る)', () => {
    const block = charaStageBlock(charaLiveStageCss());
    expect(block).toContain('position: absolute');
    expect(block).not.toContain('position: fixed');
  });
});
