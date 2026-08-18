/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  LANE_CONTENT_LOD_EAGER_HEAD,
  LANE_CONTENT_LOD_ENABLED,
  LANE_CONTENT_LOD_HOLLOW_CLASS,
  buildHollowTileEl,
  countHollowTiles,
  forgetLaneContentLod,
  isAlreadyFilled,
  observeHollowTile,
  shouldRenderHollow
} from './laneContentLod.js';

/**
 * 中身LOD(枠は残す。中身だけ空にする)の単体検査。
 *
 * ★この検査が守っているのは「DOMを減らすこと」ではなく
 *   【減らしても壊れないこと】= never-drop(C1)と幕(C2)。
 *   数を減らす修正は、守りを壊すと黒画面を再生産する(2026-08-13 の決着)。
 */

const baseCtx = {
  laneName: 'tanu',
  index: 30,
  hasRealThumb: false,
  hasWrap: false,
  alreadyFilled: false
};

describe('shouldRenderHollow — どこを枠だけにするか', () => {
  it('たぬ姉段の後列の匿名は枠だけにする', () => {
    expect(shouldRenderHollow(baseCtx)).toBe(true);
  });

  it('★前列(24枚目まで)は必ずフルで描く — 既存LODの境界と揃える', () => {
    for (let i = 0; i < LANE_CONTENT_LOD_EAGER_HEAD; i += 1) {
      expect(shouldRenderHollow({ ...baseCtx, index: i })).toBe(false);
    }
    // 25枚目(index=24)から hollow に落ちる = popup.html の nth-child(n + 25) と同じ境界
    expect(shouldRenderHollow({ ...baseCtx, index: LANE_CONTENT_LOD_EAGER_HEAD })).toBe(true);
  });

  it('★③会場(wrapTileEl あり)は対象外 — 3D変形で可視判定が崩れた前科があるため', () => {
    expect(shouldRenderHollow({ ...baseCtx, hasWrap: true })).toBe(false);
  });

  it('★実サムネ持ちは対象外 — 既存LODも縮めていない領域を勝手に変えない', () => {
    expect(shouldRenderHollow({ ...baseCtx, hasRealThumb: true })).toBe(false);
  });

  it('★一度中身を詰めた人は二度と枠に戻さない(一方通行) — img 再生成の churn を作らないため', () => {
    expect(shouldRenderHollow({ ...baseCtx, alreadyFilled: true })).toBe(false);
  });

  it('たぬ姉段以外は対象外(MVP のスコープ)', () => {
    for (const laneName of ['link', 'gift', 'ad', 'konta', 'unknown']) {
      expect(shouldRenderHollow({ ...baseCtx, laneName })).toBe(false);
    }
  });

  it('壊れた入力でも例外を投げず false に倒れる', () => {
    expect(shouldRenderHollow(null)).toBe(false);
    expect(shouldRenderHollow(undefined)).toBe(false);
    expect(shouldRenderHollow({})).toBe(false);
  });
});

describe('buildHollowTileEl — 枠の形', () => {
  it('★タイルとして数えられる形である(span + 基本 class) = 幕の解除条件を満たす', () => {
    const el = buildHollowTileEl({ title: 'たぬ' });
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('nl-story-userlane-cell')).toBe(true);
    expect(el.classList.contains(LANE_CONTENT_LOD_HOLLOW_CLASS)).toBe(true);
  });

  it('★中身は1つも持たない = これが DOM を減らしている実体', () => {
    const el = buildHollowTileEl({ title: 'たぬ' });
    expect(el.childElementCount).toBe(0);
    expect(el.querySelector('img')).toBe(null);
  });

  it('title は枠のうちから持つ(中身が来る前でも誰か分かる)', () => {
    expect(buildHollowTileEl({ title: 'あの人' }).title).toBe('あの人');
  });

  it('title が無くても壊れない', () => {
    expect(() => buildHollowTileEl({})).not.toThrow();
    expect(() => buildHollowTileEl(null)).not.toThrow();
  });
});

describe('★C2(幕): 枠は「タイル1枚」として数えられる', () => {
  it('hollow だけを並べても childElementCount は枚数どおり = 0枚の瞬間が生まれない', () => {
    const lane = document.createElement('div');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 100; i += 1) frag.appendChild(buildHollowTileEl({ title: `u${i}` }));
    lane.replaceChildren(frag);
    // popup-entry.js の countStoryUserLaneDomTiles は childElementCount を合算する。
    // ＝枠だけでも「タイルが在る」と数えられる ＝ 幕(シェード)は従来どおり畳まれる。
    expect(lane.childElementCount).toBe(100);
  });
});

describe('observeHollowTile — 可視域に入ったら1回だけ詰める', () => {
  let observed;
  let callbacks;

  beforeEach(() => {
    observed = [];
    callbacks = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb) {
          this.cb = cb;
          callbacks.push(cb);
        }
        observe(el) {
          observed.push(el);
          this.last = el;
        }
        unobserve() {}
        disconnect() {}
      }
    );
  });

  it('可視になるまで fill は呼ばれない', () => {
    const lane = document.createElement('div');
    const hollow = buildHollowTileEl({ title: 'x' });
    lane.appendChild(hollow);
    const fill = vi.fn();
    observeHollowTile(lane, hollow, 'u1', fill);
    expect(observed).toContain(hollow);
    expect(fill).not.toHaveBeenCalled();
  });

  it('可視になったら fill が呼ばれ、その人は filled として記憶される(一方通行)', () => {
    const lane = document.createElement('div');
    const hollow = buildHollowTileEl({ title: 'x' });
    lane.appendChild(hollow);
    const fill = vi.fn();
    observeHollowTile(lane, hollow, 'u1', fill);

    expect(isAlreadyFilled(lane, 'u1')).toBe(false);
    callbacks[0]([{ isIntersecting: true, target: hollow }], { unobserve() {} });
    expect(fill).toHaveBeenCalledTimes(1);
    // ★記憶していないと、次の再描画でまた枠に戻り img を作り直す = churn の再生産
    expect(isAlreadyFilled(lane, 'u1')).toBe(true);
  });

  it('★二重に可視通知が来ても fill は1回きり', () => {
    const lane = document.createElement('div');
    const hollow = buildHollowTileEl({ title: 'x' });
    lane.appendChild(hollow);
    const fill = vi.fn();
    observeHollowTile(lane, hollow, 'u1', fill);
    const obs = { unobserve() {} };
    callbacks[0]([{ isIntersecting: true, target: hollow }], obs);
    callbacks[0]([{ isIntersecting: true, target: hollow }], obs);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('可視でない通知では fill しない', () => {
    const lane = document.createElement('div');
    const hollow = buildHollowTileEl({ title: 'x' });
    lane.appendChild(hollow);
    const fill = vi.fn();
    observeHollowTile(lane, hollow, 'u1', fill);
    callbacks[0]([{ isIntersecting: false, target: hollow }], { unobserve() {} });
    expect(fill).not.toHaveBeenCalled();
  });

  it('★fill が例外を投げても他のタイルを巻き込まない', () => {
    const lane = document.createElement('div');
    const a = buildHollowTileEl({ title: 'a' });
    const b = buildHollowTileEl({ title: 'b' });
    lane.append(a, b);
    const fillB = vi.fn();
    observeHollowTile(lane, a, 'ua', () => { throw new Error('boom'); });
    observeHollowTile(lane, b, 'ub', fillB);
    expect(() => {
      callbacks[0]([{ isIntersecting: true, target: a }, { isIntersecting: true, target: b }], {
        unobserve() {}
      });
    }).not.toThrow();
    expect(fillB).toHaveBeenCalledTimes(1);
  });

  it('★filledKeys は段ごとに独立(別の段の記憶を巻き込まない)', () => {
    const laneA = document.createElement('div');
    const laneB = document.createElement('div');
    const h = buildHollowTileEl({ title: 'x' });
    laneA.appendChild(h);
    observeHollowTile(laneA, h, 'u1', () => {});
    callbacks[0]([{ isIntersecting: true, target: h }], { unobserve() {} });
    expect(isAlreadyFilled(laneA, 'u1')).toBe(true);
    expect(isAlreadyFilled(laneB, 'u1')).toBe(false);
  });

  it('★forget しても「一度詰めた人」の記憶は消えない(戻さないため)', () => {
    const lane = document.createElement('div');
    const h = buildHollowTileEl({ title: 'x' });
    lane.appendChild(h);
    observeHollowTile(lane, h, 'u1', () => {});
    callbacks[0]([{ isIntersecting: true, target: h }], { unobserve() {} });
    forgetLaneContentLod(lane);
    expect(isAlreadyFilled(lane, 'u1')).toBe(true);
  });

  it('forget は observer を切る(IO がターゲット参照を握るリークを防ぐ)', () => {
    const lane = document.createElement('div');
    const h = buildHollowTileEl({ title: 'x' });
    lane.appendChild(h);
    let disconnected = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb) { this.cb = cb; }
        observe() {}
        unobserve() {}
        disconnect() { disconnected += 1; }
      }
    );
    observeHollowTile(lane, h, 'u1', () => {});
    forgetLaneContentLod(lane);
    expect(disconnected).toBe(1);
  });
});

describe('★IntersectionObserver が無い環境ではフェイルソフトで即座に詰める', () => {
  it('観測できないからといって空のまま放置しない(見えない失敗を作らない)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const lane = document.createElement('div');
    const h = buildHollowTileEl({ title: 'x' });
    lane.appendChild(h);
    const fill = vi.fn();
    observeHollowTile(lane, h, 'u1', fill);
    expect(fill).toHaveBeenCalledTimes(1);
  });
});

describe('countHollowTiles — 効いているかを数で読む計器', () => {
  it('枠の数を数える', () => {
    const lane = document.createElement('div');
    for (let i = 0; i < 5; i += 1) lane.appendChild(buildHollowTileEl({ title: `u${i}` }));
    const full = document.createElement('span');
    full.className = 'nl-story-userlane-cell';
    lane.appendChild(full);
    expect(countHollowTiles(lane)).toBe(5);
    expect(lane.childElementCount).toBe(6); // ★タイル総数は減っていない
  });

  it('壊れた入力でも 0 を返す', () => {
    expect(countHollowTiles(null)).toBe(0);
    expect(countHollowTiles({})).toBe(0);
  });
});

describe('★kill スイッチ(撤回手順)', () => {
  it('既定では有効', () => {
    expect(LANE_CONTENT_LOD_ENABLED).toBe(true);
  });

  it('★無効化したら shouldRenderHollow が常に false = 挙動が完全に旧へ戻る', async () => {
    // ★実際にソースを書き換えて評価する(定数を読み替えただけの「宣言」では
    //   スイッチが壊れていても緑のままになる= 死んだ検査になる)。
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    // ★happy-dom 環境では import.meta.url が file: にならないため cwd 起点で読む。
    const src = readFileSync(
      path.join(process.cwd(), 'src/extension/story/laneContentLod.js'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const killed = src.replace(
      'export const LANE_CONTENT_LOD_ENABLED = true;',
      'export const LANE_CONTENT_LOD_ENABLED = false;'
    );
    // 置換が実際に効いたことを確かめる(空振りしたまま緑になるのを防ぐ)
    expect(killed).not.toBe(src);

    const mod = await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(killed).toString('base64')}`
    );
    expect(mod.LANE_CONTENT_LOD_ENABLED).toBe(false);
    // どの位置・どの段でも hollow にならない
    expect(mod.shouldRenderHollow(baseCtx)).toBe(false);
    expect(mod.shouldRenderHollow({ ...baseCtx, index: 9999 })).toBe(false);

    // observe も何もしない(無効時に IO を作らない)
    let made = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor() { made += 1; }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const lane = document.createElement('div');
    const h = mod.buildHollowTileEl({ title: 'x' });
    const fill = vi.fn();
    mod.observeHollowTile(lane, h, 'u1', fill);
    expect(made).toBe(0);
    expect(fill).not.toHaveBeenCalled();
  });
});
