import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the guardrail module as raw source so this test does not depend on
// TypeScript path resolution into the Supabase functions directory.
const SRC = readFileSync(
  resolve(__dirname, "../../../supabase/functions/_shared/responsible-ai.ts"),
  "utf8",
);

function extractExport(name: string): string {
  const re = new RegExp(`export const ${name}\\s*=\\s*(?:\`([\\s\\S]*?)\`|"([^"]*)")`);
  const m = SRC.match(re);
  if (!m) throw new Error(`Could not find export ${name}`);
  return (m[1] ?? m[2] ?? "").toString();
}

const RESPONSIBLE_AI_GUARDRAILS = extractExport("RESPONSIBLE_AI_GUARDRAILS");
const WHATSAPP_ADVISORY_FOOTER = extractExport("WHATSAPP_ADVISORY_FOOTER");
const WEB_ADVISORY_FOOTER = extractExport("WEB_ADVISORY_FOOTER");

// These tests guard the Responsible-AI guardrail block that is prepended to
// every AI system prompt. If someone accidentally weakens the guardrails,
// these assertions fail and block the change.

describe("Responsible AI guardrails", () => {
  it("declares the six mandatory principles", () => {
    for (const clause of [
      "TRANSPARENCY",
      "ATTRIBUTION",
      "UNCERTAINTY",
      "SAFETY SCOPE",
      "LOCALITY",
      "HUMAN OVERSIGHT",
    ]) {
      expect(RESPONSIBLE_AI_GUARDRAILS).toContain(clause);
    }
  });

  it("frames advice as decision support, not instructions", () => {
    expect(RESPONSIBLE_AI_GUARDRAILS.toLowerCase()).toContain("decision-support");
  });

  it("attributes advice to Mudhumeni Hungwe (Powered by Zyterra) and hides the model", () => {
    expect(RESPONSIBLE_AI_GUARDRAILS).toContain("Mudhumeni Hungwe");
    expect(RESPONSIBLE_AI_GUARDRAILS).toContain("Powered by Zyterra");
    expect(RESPONSIBLE_AI_GUARDRAILS.toLowerCase()).toContain("never name");
  });

  it("blocks unsafe advice categories", () => {
    const text = RESPONSIBLE_AI_GUARDRAILS.toLowerCase();
    expect(text).toContain("label rates");
    expect(text).toContain("veterinary");
    expect(text).toContain("financial");
    expect(text).toContain("legal");
  });

  it("grounds advice in Southern African context", () => {
    expect(RESPONSIBLE_AI_GUARDRAILS.toLowerCase()).toContain("zimbabwean");
    expect(RESPONSIBLE_AI_GUARDRAILS.toLowerCase()).toContain("southern african");
  });

  it("ships channel-appropriate disclaimer footers", () => {
    expect(WHATSAPP_ADVISORY_FOOTER.length).toBeLessThan(200);
    expect(WHATSAPP_ADVISORY_FOOTER.toLowerCase()).toContain("extension officer");
    expect(WEB_ADVISORY_FOOTER.toLowerCase()).toContain("ai-assisted guidance");
    expect(WEB_ADVISORY_FOOTER.toLowerCase()).toContain("verify");
  });
});
