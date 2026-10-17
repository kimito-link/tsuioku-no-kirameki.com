import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit, selfTest } from '../../scripts/audit/static-dead-selectors.mjs';

/**
 * 「CSS はあるのに、対応するクラス/ID/属性を作るコードが無い(=一度も効かない規則)」の再発防止ラチェット(v0.1.1652)。
 *
 * ■ 実例(なぜこれが要るか)
 *   会場のたぬ姉段の後列LOD(25人目以降の匿名はアイコンのみ)の CSS は .nl-story-userlane--tanu を前提に書かれていたが、会場の
 *   makeLane は一度もそのクラスを付けず、CSS は【会場では一度も効かなかった】。面の差を宣言する既存の検査は「意図した差」と
 *   登録していたため素通りした(実測: 552人すべて名前つきの横長タイル・列の高さ 1474px)。
 *   「CSS にセレクタがある」だけでは足りない=【そのクラスを実際に作るコードが、その面にあるか】を機械で見る。
 *
 * ■ 検査(scripts/audit/static-dead-selectors.mjs の runAudit を使う・基準=scripts/audit/dead-selector-baseline.json)
 *   1. 自己検査が全て合格(検査器自身が壊れていないこと)。
 *   2. 空振りの緑を許さない: 各面で読めた CSS 規則数・JS ファイル数が基準の80%以上。0件で緑にならない。
 *   3. ラチェット: 確証デッドのトークンが基準に無い新規で増えたら、トークンとファイル:行を名指しして赤。
 *   4. 基準の掃除: 基準にあるが、もうデッドでない(直した)トークンが残っていたら赤=基準を下げて固定する。
 *   5. 会場の『popup は作る ∧ 会場の CSS にある ∧ 会場は作らない』型は上限0(基準に入れても許さない)。
 *
 * ■ 基準を更新するとき
 *   下げる: node scripts/audit/make-dead-selector-baseline.mjs
 *   上げる: node scripts/audit/make-dead-selector-baseline.mjs --allow-increase "理由(15字以上)"(理由は基準ファイルに残る)
 *
 * ■ この検査が見えないもの(限界)
 *   共有モジュールの中にクラスの文字列はあるが、その面の経路では通らない型(例: nl-story-userlane--windowed は会場では窓化されない)は静的には見えない。
 *   実ブラウザ監査 scripts/audit/runtime-venue-audit.mjs(手動)で補う。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = JSON.parse(readFileSync(path.join(repoRoot, 'scripts/audit/dead-selector-baseline.json'), 'utf8'));
const result = runAudit();
const byId = Object.fromEntries(result.surfaces.map((s) => [s.id, s]));

const deadOf = (s) => Object.fromEntries(s.tokenRows.filter((r) => r.dead).map((r) => [`${r.kind}:${r.token}`, `${r.rules[0].file}:${r.rules[0].line}`]));

describe('静的デッドセレクタ監査(ラチェット)', () => {
  it('★検査器の自己検査が全て合格', () => {
    const st = selfTest();
    expect(st.length).toBeGreaterThan(10);
    expect(st.filter((x) => !x.ok).map((x) => x.name)).toEqual([]);
  });

  it('★基準に載っている面を、すべて読めている(面が消えて緑にならない)', () => {
    expect(Object.keys(baseline.surfaces).length).toBeGreaterThanOrEqual(6);
    for (const id of Object.keys(baseline.surfaces)) expect(byId[id], `面 ${id} が監査結果に無い`).toBeTruthy();
  });

  for (const id of Object.keys(baseline.surfaces)) {
    const base = baseline.surfaces[id];

    it(`★[${id}] 空振りでない(CSS規則数・JSファイル数が基準の80%以上)`, () => {
      const s = byId[id];
      expect(s.cssRuleCount).toBeGreaterThanOrEqual(Math.floor(base.cssRuleCount * 0.8));
      expect(s.jsFileCount).toBeGreaterThanOrEqual(Math.floor(base.jsFileCount * 0.8));
      expect(s.tokenRows.length).toBeGreaterThan(0);
    });

    it(`★[${id}] 新しい確証デッドが増えていない(増えたら名指し)`, () => {
      const cur = deadOf(byId[id]);
      const added = Object.keys(cur).filter((k) => !(k in base.dead)).map((k) => `${k} (${cur[k]})`);
      expect(added, `新しいデッド: 「CSS はあるが作るコードが無い」トークン。クラスを付けるか規則を消してください。意図的なら make-dead-selector-baseline.mjs --allow-increase "理由"`).toEqual([]);
    });

    it(`★[${id}] 基準にあるが、もうデッドでないトークンが残っていない(直したら基準を下げる)`, () => {
      const cur = deadOf(byId[id]);
      const stale = Object.keys(base.dead).filter((k) => !(k in cur));
      expect(stale, '直したトークンです。node scripts/audit/make-dead-selector-baseline.mjs で基準を下げて固定してください').toEqual([]);
    });
  }

  it('★会場: 「popup は作る ∧ 会場の CSS にある ∧ 会場は作らない」型が0件(たぬ姉の --tanu 型は基準に入れても許さない)', () => {
    const venue = byId.venue;
    const bad = venue.tokenRows.filter((r) => r.dead && r.elsewhere.includes('popup')).map((r) => `${r.kind}:${r.token} (${r.rules[0].file}:${r.rules[0].line})`);
    expect(bad, '他の面(popup)は作っているのに、会場だけ作らない=会場で効かない規則').toEqual([]);
  });
});
