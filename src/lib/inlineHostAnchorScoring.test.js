import { describe, it, expect } from 'vitest';
import {
  scoreInlineHostAnchorCandidate,
  DEFAULT_INLINE_HOST_ANCHOR_LIMITS
} from './inlineHostAnchorScoring.js';

const VIEWPORT = { width: 1280, height: 720 };

/** @param {Partial<{left:number,top:number,width:number,height:number}>} r */
const rect = (r) => ({
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  ...r
});

const VIDEO_RECT = rect({ left: 320, top: 80, width: 640, height: 360 });

describe('scoreInlineHostAnchorCandidate', () => {
  it('video 単体相当（rect == videoRect）は eligible', () => {
    const r = scoreInlineHostAnchorCandidate({
      rect: VIDEO_RECT,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it('video + 公式コメ列（横並び 1.2x 幅 / aspect 2.0）は eligible', () => {
    const candidate = rect({
      left: 320,
      top: 80,
      width: 768, // video 640 の 1.2x
      height: 384 // aspect 2.0
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: candidate,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(true);
  });

  it('video + コメ列の方が video 単体より score が高い（より広く包含）', () => {
    const onlyVideo = scoreInlineHostAnchorCandidate({
      rect: VIDEO_RECT,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    const withCommentColumn = scoreInlineHostAnchorCandidate({
      rect: rect({
        left: 320,
        top: 80,
        width: 768,
        height: 384
      }),
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(withCommentColumn.score).toBeGreaterThan(onlyVideo.score);
  });

  it('視聴行 + バナー一式（aspect 3.0）は eligible=false (aspect 上限超え)', () => {
    const huge = rect({
      left: 0,
      top: 0,
      width: 1200, // video 640 の 1.875x
      height: 400
    });
    // aspect = 1200 / 400 = 3.0 → maxAspect 2.6 超え
    const r = scoreInlineHostAnchorCandidate({
      rect: huge,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/aspect/);
  });

  it('幅が video より極端に小さい候補は eligible=false', () => {
    const tiny = rect({
      left: 320,
      top: 80,
      width: 320, // video 640 の 0.5x
      height: 180
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: tiny,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/width/);
  });

  it('幅が video の 2x（広すぎ）は eligible=false', () => {
    const wide = rect({
      left: 0,
      top: 80,
      width: 1280, // video 640 の 2x
      height: 600 // aspect 2.13
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: wide,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    // area / width のどちらが先に弾かれるかは順序依存（実装上は area が先）
    expect(r.reason).toMatch(/width|area/);
  });

  it('幅 video の 1.8x かつ高さは小さい（area は OK / width だけ NG）', () => {
    // width / videoMax を単独で弾かせる純粋ケース
    const wideButShort = rect({
      left: 0,
      top: 80,
      width: 1200, // video 640 の 1.875x → maxWidthRatioToVideo 1.6 超え
      height: 480 // aspect 2.5（範囲内）, area 576000 / viewport 921600 = 0.625... ぎりぎり超える
    });
    // area を確実に範囲内にするため maxAreaRatio を緩めて width だけで弾かせる
    const r = scoreInlineHostAnchorCandidate(
      {
        rect: wideButShort,
        viewport: VIEWPORT,
        videoRect: VIDEO_RECT
      },
      { maxAreaRatio: 0.95 }
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/width/);
  });

  it('高さが video の 5x ある候補は eligible=false（縦長は aspect で先に弾かれる）', () => {
    const tall = rect({
      left: 280,
      top: 80,
      width: 720, // video の 1.125x
      height: 1800 // video 360 の 5x、aspect 0.4
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: tall,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    // 実装の検査順では area / aspect / height のいずれかで弾かれる。
    // height>videoMax 単独で発火するケース（aspect も width も範囲内、かつ
    // 高さだけ video の 3.5x 超）は現実には存在しないため、巨大ラッパー
    // 除外として「どれかで弾かれる」を担保すれば十分。
    expect(r.reason).toMatch(/area|aspect|height/);
  });

  it('top が video から 200px 離れている候補は eligible=false', () => {
    const offset = rect({
      left: 320,
      top: 320, // video top 80 から 240px ずれ
      width: 720,
      height: 400
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: offset,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/top/);
  });

  it('面積が viewport の 80% を占める候補は eligible=false', () => {
    const huge = rect({
      left: 0,
      top: 80,
      width: 1280, // viewport 全幅
      height: 600 // viewport 720 のほぼ全部 → area ratio 0.83
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: huge,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    // 大きい順で先に area 上限が弾かれる（aspect ~2.13 は範囲内）
    expect(r.reason).toMatch(/area|width/);
  });

  it('aspect < 1（縦長）は eligible=false', () => {
    const portrait = rect({
      left: 320,
      top: 80,
      width: 640,
      height: 800 // aspect 0.8
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: portrait,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/aspect/);
  });

  it('minWidth 未満は eligible=false', () => {
    const small = rect({
      left: 320,
      top: 80,
      width: 200,
      height: 140
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: small,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/width|videoMin/);
  });

  it('minHeight 未満は eligible=false', () => {
    const flat = rect({
      left: 320,
      top: 80,
      width: 640,
      height: 100
    });
    const r = scoreInlineHostAnchorCandidate({
      rect: flat,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/height/);
  });

  it('overrides で aspect 上限を緩めると、aspect 3.0 でも eligible になる', () => {
    const horizontal = rect({
      left: 0,
      top: 80,
      width: 720,
      height: 240 // aspect 3.0
    });
    const strict = scoreInlineHostAnchorCandidate({
      rect: horizontal,
      viewport: VIEWPORT,
      videoRect: VIDEO_RECT
    });
    expect(strict.eligible).toBe(false);
    const loose = scoreInlineHostAnchorCandidate(
      {
        rect: horizontal,
        viewport: VIEWPORT,
        videoRect: VIDEO_RECT
      },
      { maxAspect: 3.5 }
    );
    expect(loose.eligible).toBe(true);
  });

  it('DEFAULT_INLINE_HOST_ANCHOR_LIMITS は freeze されている', () => {
    expect(Object.isFrozen(DEFAULT_INLINE_HOST_ANCHOR_LIMITS)).toBe(true);
  });

  it('DEFAULT_INLINE_HOST_ANCHOR_LIMITS は旧 3.4/0.92 より厳しい', () => {
    expect(DEFAULT_INLINE_HOST_ANCHOR_LIMITS.maxAspect).toBeLessThan(3.4);
    expect(DEFAULT_INLINE_HOST_ANCHOR_LIMITS.maxAreaRatio).toBeLessThan(0.92);
  });
});
