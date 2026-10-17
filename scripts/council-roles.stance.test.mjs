import { describe, expect, it } from "vitest";
import { buildSystem, DESIGN_STANCE, ROLE_LABEL } from "./council-roles.mjs";

describe("会議の判断基準が全役割に届く", () => {
  it("基準の要点（CVR/LTV・100年・問い返さない・抜け漏れ）を含む", () => {
    for (const k of ["CVR", "LTV", "100年", "根本解決", "問い返さない", "抜け漏れ", "出典", "禁止事項"]) {
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
