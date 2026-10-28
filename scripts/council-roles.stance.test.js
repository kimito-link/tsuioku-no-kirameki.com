import { describe, expect, it } from "vitest";
import { buildSystem, DESIGN_STANCE, DESIGN_STANCE_VERSION, ROLE_LABEL } from "./council-roles.mjs";

describe("会議の判断基準が全役割に届く", () => {
  it("基準の要点（CVR/LTV・100年・問い返さない・抜け漏れ）を含む", () => {
    for (const k of ["CVR", "LTV", "100年", "根本解決", "問い返さない", "抜け漏れ", "出典", "禁止事項"]) {
      expect(DESIGN_STANCE).toContain(k);
    }
  });
  it("2026-10-27 の最新方針（北極星・ガードレール・無料の人・コード構成・判断の順番・公開前4問）を含む", () => {
    expect(DESIGN_STANCE_VERSION).toBe("2026-10-27");
    for (const k of [
      "LTV÷CPA",
      "CPAは下げるほど良い",
      "ガードレール",
      "無料ユーザー",
      "使われるほど黒字",
      "1ファイル1責務",
      "ガードレール→LTV÷CPA→回収の早さ→保守の手間",
      "商品インパクト",
      "物差しそのもの",
      "まだ測れていない",
      "公開前4問",
    ]) {
      expect(DESIGN_STANCE).toContain(k);
    }
  });
  it("批判役を含むどの役割の system にも入る（役割で漏れない）", () => {
    for (const name of ["groq/gpt-oss-120b", "nvidia/deepseek-v4.1-flash", "sambanova/gemma-4-31B-it", "cloudflare/qwen3-30b-a3b"]) {
      expect(buildSystem({ modelName: name, taskText: "x" }).system).toContain("【判断基準（必ず従う）】");
    }
    expect(Object.keys(ROLE_LABEL).length).toBeGreaterThan(3);
  });
});
