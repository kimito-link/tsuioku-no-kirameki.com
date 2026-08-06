import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

/**
 * ★v0.1.1273: このファイルが固定していた「4秒経路の再描画ゲート」は撤去された。
 *
 * ■ 経緯(2026-08-06にユーザーと突き合わせて判明)
 *   発端はリリース(v0.1.1244)後の「ノートPCで重いかも」という指摘だった。
 *   v0.1.1248 で毎秒11回の描き直しを止めたのは正しい対処。
 *   ところが v0.1.1250 で【4秒経路に再描画ゲートを足した】のが事故の始まりで、
 *   直後の v0.1.1254 のタイトルが「自分が塞いだ非常口を戻す」だった
 *   =自分でゲートを足し、自分で復帰経路を塞いだと書いている。
 *   以降28版、そのゲートが生む症状を別の原因と誤認して追い続けた。
 *
 * ■ なぜテストごと消すのか(コメントアウトで残さない)
 *   これらの断言は「ゲートが在ること」を固定する内容で、ゲート撤去と両立しない。
 *   赤いまま残すと出荷ゲートが永久に通らず、skip で残すと「なぜ skip か」が
 *   いずれ失われる。★消した事実と理由をこのファイルに残すのが最も誤解が少ない。
 *
 * ■ 代わりに何を守るか
 *   「4秒経路が無条件で描き直す」ことを下で断言する。
 *   これは v0.1.1248(リリース直後で安定していた版)と同じ挙動であり、
 *   将来また誰かがゲートを足そうとしたらここが赤くなる。
 *   ([[gate-may-be-the-only-recovery-path-2026-08-04]] を機械で守る)
 */
describe('4秒経路は無条件で描き直す(ゲートを足さない)', () => {
  it('★復帰ゲートの判定関数を呼んでいない(v0.1.1250のゲートが復活したら赤)', () => {
    // shouldRenderInlineHostOnPoll による分岐は撤去済み。
    // ここが再び現れたら「唯一の復帰経路にゲートを足す」事故の再演。
    const calls = contentSrc.match(/shouldRenderInlineHostOnPoll\(\{/g) || [];
    expect(calls).toHaveLength(0);
  });

  it('★4秒経路の2箇所とも renderPageFrameOverlay を無条件で呼ぶ', () => {
    /*
     * 期待する形(watch / 非watch の2箇所):
     *   ensurePageFrameStyleAlive();
     *   inlineLayoutDirty = false;
     *   renderPageFrameOverlay();
     * ★if で包まれていないこと(=条件付きに戻していないこと)を形で固定する。
     */
    const unconditional = contentSrc.match(
      /ensurePageFrameStyleAlive\(\);\n\s*inlineLayoutDirty = false;\n\s*renderPageFrameOverlay\(\);/g
    ) || [];
    expect(unconditional).toHaveLength(2);
  });

  it('★片方だけ戻す/片方だけゲートを足す非対称を防ぐ', () => {
    // 2箇所は必ず同じ形。非対称にすると「症状が半分だけ残る」形になり、
    // 原因の切り分けが極端に難しくなる(実際にそれで28版を費やした)。
    const verdictBranch = contentSrc.match(/if \(verdict\.render\) \{/g) || [];
    expect(verdictBranch).toHaveLength(0);
  });
});
