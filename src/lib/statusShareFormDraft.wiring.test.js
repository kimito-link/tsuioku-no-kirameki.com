import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-14: status の「WEB共有の設定」欄は、配信カードの再描画のたびに作り直される。
 *   保存前の入力(貼り付けた鍵)を覚えないと、貼った直後に空へ戻る(利用者の「貼り付けても消えてしまう」)。
 */
const src = fs.readFileSync(path.resolve('src/extension/status-entry.js'), 'utf8').split('\r\n').join('\n');
const at = src.indexOf('function buildUploadConfigEditor() {');
const body = src.slice(at, at + 5200);

describe('status-entry: 共有設定欄の入力は再描画をまたいで残る', () => {
  it('★下書きの入れ物がエディタの外(モジュール直下)にある', () => {
    const draft = src.indexOf('const _uploadConfigDraft = {');
    expect(draft).toBeGreaterThan(0);
    expect(draft).toBeLessThan(at);
  });
  it('★各欄は作るとき下書きを優先し、入力のたびに下書きへ書く', () => {
    expect(body).toMatch(/input\.value = draft !== null \? draft : value;/);
    expect(body).toMatch(/input\.addEventListener\('input', \(\) => \{ _uploadConfigDraft\[draftKey\] = input\.value; \}\);/);
  });
  it('★3つの欄すべてが下書きキーを渡している', () => {
    expect(body).toMatch(/field\('ingestKey', /);
    expect(body).toMatch(/field\('viewToken', /);
    expect(body).toMatch(/field\('appOrigin', /);
  });
  it('★開閉も覚える(貼り付け中に勝手に閉じない)', () => {
    expect(body).toMatch(/_uploadConfigDraft\.open !== null \? _uploadConfigDraft\.open/);
    expect(body).toMatch(/details\.addEventListener\('toggle'/);
  });
  it('★保存したら下書きを捨てる(保存後に古い入力へ戻らない)', () => {
    const save = body.indexOf("saveBtn.addEventListener('click'");
    const tail = body.slice(save, save + 900);
    expect(tail).toMatch(/_uploadConfigDraft\.ingestKey = null;/);
    expect(tail).toMatch(/_uploadConfigDraft\.viewToken = null;/);
  });
});
