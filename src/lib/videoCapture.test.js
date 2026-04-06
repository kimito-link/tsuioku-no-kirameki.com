import { describe, it, expect } from 'vitest';
import {
  fitThumbnailDimensions,
  buildScreenshotFilename,
  SCREENSHOT_DOWNLOAD_SUBDIR,
  interpretCaptureError
} from './videoCapture.js';

describe('fitThumbnailDimensions', () => {
  it('縮小不要ならそのまま', () => {
    expect(fitThumbnailDimensions(640, 360, 1280, 720)).toEqual({
      width: 640,
      height: 360
    });
  });

  it('幅が maxW を超えるとアスペクト維持で縮小', () => {
    expect(fitThumbnailDimensions(1920, 1080, 1280, 720)).toEqual({
      width: 1280,
      height: 720
    });
  });

  it('高さが maxH に合わせて縮小', () => {
    expect(fitThumbnailDimensions(800, 2000, 1280, 720)).toEqual({
      width: 288,
      height: 720
    });
  });

  it('0 や負の入力は最小 1px にクランプ（縮小のみ）', () => {
    expect(fitThumbnailDimensions(0, 100, 1280, 720)).toEqual({
      width: 1,
      height: 100
    });
  });

  it('max が 0 のときは 1 にフォールバック', () => {
    expect(fitThumbnailDimensions(100, 100, 0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('buildScreenshotFilename', () => {
  it('スクショ用サブフォルダ配下に lv とタイムスタンプを含む', () => {
    const name = buildScreenshotFilename('lv12345', 'png', 1_700_000_000_000);
    expect(name).toMatch(
      new RegExp(`^${SCREENSHOT_DOWNLOAD_SUBDIR}/nicolivelog-lv12345-\\d+\\.png$`)
    );
    expect(name).toContain('1700000000000');
  });

  it('危険文字を除去して親ディレクトリへ逃がさない', () => {
    const name = buildScreenshotFilename('lv../../x', 'png', 1);
    expect(name.startsWith(`${SCREENSHOT_DOWNLOAD_SUBDIR}/`)).toBe(true);
    expect(name.slice(`${SCREENSHOT_DOWNLOAD_SUBDIR}/`.length)).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name).not.toContain('..');
  });

  it('拡張子のドットは正規化', () => {
    expect(buildScreenshotFilename('lv1', '.PNG', 0)).toMatch(/\.png$/i);
  });
});

describe('interpretCaptureError', () => {
  it('SecurityError は tainted_canvas', () => {
    expect(interpretCaptureError(new DOMException('nope', 'SecurityError'))).toBe(
      'tainted_canvas'
    );
  });

  it('その他エラーは capture_failed', () => {
    expect(interpretCaptureError(new Error('canvas broke'))).toBe('capture_failed');
  });

  it('no video メッセージは no_video', () => {
    expect(interpretCaptureError(new Error('no video element'))).toBe('no_video');
  });

  it('null は unknown', () => {
    expect(interpretCaptureError(null)).toBe('unknown');
  });
});
