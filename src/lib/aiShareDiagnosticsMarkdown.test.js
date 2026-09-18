import { describe, expect, it } from 'vitest';
import {
  formatAiShareDiagnosticsMarkdown,
  romiDebugDataChecklist
} from './aiShareDiagnosticsMarkdown.js';

/**
 * characterization test（元の挙動を固定）。
 * popup-entry.js から Track A で切り出した2関数の入出力を固定する。
 */

describe('romiDebugDataChecklist（切り出し前と同じ）', () => {
  it('9 項目の固定チェックリストを返す', () => {
    const out = romiDebugDataChecklist();
    expect(out).toHaveLength(9);
    expect(out[0]).toContain('diagSchemaVersion');
    expect(out[out.length - 1]).toContain('persistGateFailures');
  });

  it('毎回同じ内容（副作用なし）', () => {
    expect(romiDebugDataChecklist()).toEqual(romiDebugDataChecklist());
  });
});

describe('formatAiShareDiagnosticsMarkdown（切り出し前と同じ）', () => {
  const base = {
    extensionName: 'nicolivelog',
    extensionVersion: '0.1.1523',
    watchUrlNote: 'lv12345 を選択',
    lastSendMessageError: '',
    payload: { diagSchemaVersion: 'v7', a: 1 }
  };

  it('見出し・バージョン行・JSON ブロックを含む', () => {
    const md = formatAiShareDiagnosticsMarkdown(base);
    expect(md).toContain('## nicolivelog 診断バンドル（AI 共有用）');
    expect(md).toContain('- 拡張: nicolivelog v0.1.1523');
    expect(md).toContain('- タブ選択: lv12345 を選択');
    expect(md).toContain('```json');
    expect(md).toContain('"diagSchemaVersion": "v7"');
  });

  it('lastSendMessageError が空なら送信行を出さない', () => {
    const md = formatAiShareDiagnosticsMarkdown(base);
    expect(md).not.toContain('- content への送信:');
  });

  it('lastSendMessageError があれば送信行を出す', () => {
    const md = formatAiShareDiagnosticsMarkdown({ ...base, lastSendMessageError: 'boom' });
    expect(md).toContain('- content への送信: `boom`');
  });

  it('diagSchemaVersion が空なら（未付与）と表示', () => {
    const md = formatAiShareDiagnosticsMarkdown({ ...base, payload: { a: 1 } });
    expect(md).toContain('診断スキーマ: `（未付与）`');
  });

  it('payload をインデント付き JSON で埋め込む', () => {
    const md = formatAiShareDiagnosticsMarkdown(base);
    expect(md).toContain(JSON.stringify(base.payload, null, 2));
  });
});
