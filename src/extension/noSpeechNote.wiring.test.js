import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★配線テスト: 発言0件のときの文言が、正本 noSpeechNote.js を通っているか。
 *
 * 純関数のテストが緑でも、画面が呼んでいなければ利用者には何も届かない
 * （「計器を足しただけで直したことにしない」の実装版）。
 * ここは実ファイルの中身を読んで、呼び出しが実在することを縛る。
 */

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), 'comeview-entry.js');
const src = readFileSync(ENTRY, 'utf8');

describe('★配線: 発言0件の文言は noSpeechNote.js が決める', () => {
  it('正本を import している', () => {
    expect(src).toMatch(/import \{ buildNoSpeechNote \} from '\.\.\/lib\/noSpeechNote\.js';/);
  });

  it('発言件数の分岐で buildNoSpeechNote(row) を呼んでいる', () => {
    expect(src).toContain('buildNoSpeechNote(row)');
  });

  it('★固定文字列を直書きに戻していない（戻すとギフトの事実が消える）', () => {
    // 正本ファイル側にだけ定数として存在してよい。entry に直書きが復活したら赤。
    expect(src).not.toContain("'この配信の記録にはまだ発言がありません'");
  });
});
