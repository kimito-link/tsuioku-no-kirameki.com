// 分類器の問いの文（classifyPrompt）と、カテゴリの説明（CATEGORIES）の回帰テスト。
// なぜ（2026-11-26）: 「振り分けの費用対効果」を決める問いが fact と判定され、統括・発散役のいない5体で会議が回った。
//   分類はモデルがするので結果そのものは試せない。代わりに、モデルに渡す決まり（決めるお題は design）が消えないことを守る。
import { describe, it, expect } from "vitest";
import { classifyPrompt, CATEGORIES } from "./council-roles.mjs";

describe("classifyPrompt", () => {
  it("決めるお題は調査や数字を含んでも design、と分類器に伝える", () => {
    const p = classifyPrompt("直近30日の使用実績を比べて、振り分けをどうするか決めたい");
    expect(p).toContain("design にする");
    expect(p).toContain("費用対効果");
  });
  it("fact は答えが1つに決まる事実の確認だけ", () => {
    expect(CATEGORIES.fact.hint).toContain("何かを決めるお題は含めない");
    expect(CATEGORIES.fact.hint).not.toContain("比較");
  });
});
