import { describe, it, expect } from "vitest";
import { scoreEvidence } from "../scorer.js";
import type { DataPoint } from "../../agents/identity.js";

function makeDataPoints(fields: Record<string, string[]>): DataPoint[] {
  return Object.entries(fields).map(([field, variants]) => ({
    field,
    value: variants[0],
    normalized: variants[0].toLowerCase(),
    search_variants: variants,
  }));
}

describe("scoreEvidence", () => {
  const baseDataPoints = makeDataPoints({
    full_name: ["juan garcia lopez", "juan", "garcia", "lopez"],
    dni_nie: ["12345678Z", "12345678"],
    phone: ["+34600111222", "600111222", "600 111 222"],
    employer: ["acme corp"],
    city: ["madrid"],
  });

  it("scores very_high when DNI is found in text", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Administrador con NIF 12345678Z en BORME",
      [["full_name", "dni_nie"]],
      "boe.es",
    );
    expect(result.pairingConfidence).toBe("very_high");
    expect(result.matchedFields).toContain("dni_nie");
    expect(result.total).toBeGreaterThanOrEqual(0.5);
  });

  it("scores high when name + phone match", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Juan Garcia Lopez contacto 600111222",
      [["full_name", "phone"]],
      "linkedin.com",
    );
    expect(result.pairingConfidence).toBe("high");
    expect(result.matchedFields).toContain("full_name");
    expect(result.matchedFields).toContain("phone");
  });

  it("scores medium when name + city match", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Juan Garcia Lopez trabaja en Madrid",
      [["full_name", "city"]],
      "linkedin.com",
    );
    expect(result.pairingConfidence).toBe("medium");
    expect(result.matchedFields).toContain("full_name");
    expect(result.matchedFields).toContain("city");
  });

  it("scores low when only name matches", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Juan Garcia was spotted at the event",
      [],
      "twitter.com",
    );
    expect(result.pairingConfidence).toBe("low");
    expect(result.matchedFields).toContain("full_name");
  });

  it("handles accent normalization (Garcia vs García)", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Juan García López — administrador en Madrid",
      [["full_name", "city"]],
      "boe.es",
    );
    expect(result.matchedFields).toContain("full_name");
    expect(result.matchedFields).toContain("city");
  });

  it("applies source authority bonus for government sources", () => {
    const govResult = scoreEvidence(
      baseDataPoints,
      "Juan Garcia en registro",
      [],
      "boe.es",
    );
    const socialResult = scoreEvidence(
      baseDataPoints,
      "Juan Garcia en registro",
      [],
      "twitter.com",
    );
    expect(govResult.total).toBeGreaterThan(socialResult.total);
  });

  it("returns empty match for unrelated text", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Completely unrelated content about weather",
      [],
      "example.com",
    );
    expect(result.matchedFields).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.pairingConfidence).toBe("low");
  });

  it("confirms target pairs when both fields match", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "12345678Z Juan Garcia administrador ACME Corp",
      [["full_name", "dni_nie"], ["full_name", "employer"]],
      "einforma.com",
    );
    expect(result.matchedPairs).toContainEqual(["full_name", "dni_nie"]);
    expect(result.matchedPairs).toContainEqual(["full_name", "employer"]);
    expect(result.pairingConfidence).toBe("very_high");
  });

  it("handles case with only name data (no DNI/phone)", () => {
    const nameOnly = makeDataPoints({
      full_name: ["juan garcia", "juan", "garcia"],
    });
    const result = scoreEvidence(
      nameOnly,
      "Juan Garcia profile page",
      [],
      "linkedin.com",
    );
    expect(result.matchedFields).toContain("full_name");
    expect(result.total).toBeGreaterThan(0);
  });

  it("scores high when name + employer match", () => {
    const result = scoreEvidence(
      baseDataPoints,
      "Juan Garcia Lopez works at ACME Corp in Spain",
      [["full_name", "employer"]],
      "linkedin.com",
    );
    expect(result.pairingConfidence).toBe("high");
    expect(result.matchedFields).toContain("full_name");
    expect(result.matchedFields).toContain("employer");
  });
});
