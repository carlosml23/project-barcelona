import { describe, it, expect } from "vitest";
import { generateNameVariants, nameTokens, normaliseName, normaliseDni, extractDniWithoutLetter, validateDni, normaliseEmployer } from "../identity.js";

describe("generateNameVariants", () => {
  it("returns full name for 2-token names", () => {
    const variants = generateNameVariants("Juan Garcia");
    expect(variants).toContain("juan garcia");
    expect(variants).toHaveLength(1);
  });

  it("generates variants for 3-token names (nombre apellido1 apellido2)", () => {
    const variants = generateNameVariants("Juan Garcia Lopez");
    expect(variants).toContain("juan garcia lopez");
    expect(variants).toContain("juan lopez");   // nombre + apellido2
    expect(variants).toContain("juan garcia");   // nombre + apellido1
  });

  it("generates variants for 4-token Spanish names (nombre1 nombre2 apellido1 apellido2)", () => {
    const variants = generateNameVariants("Carlos Sebastian Morales Lascano");
    // Full name
    expect(variants).toContain("carlos sebastian morales lascano");
    // Drop middle name — most common social usage
    expect(variants).toContain("carlos morales lascano");
    // First name + first surname
    expect(variants).toContain("carlos morales");
    // Both first names + first surname
    expect(variants).toContain("carlos sebastian morales");
    // Middle name as first
    expect(variants).toContain("sebastian morales lascano");
  });

  it("generates variants for 5-token names", () => {
    const variants = generateNameVariants("Maria Jose Garcia Fernandez Ruiz");
    // First + last two tokens
    expect(variants).toContain("maria fernandez ruiz");
    // First + second-to-last
    expect(variants).toContain("maria fernandez");
    // First two + last two
    expect(variants).toContain("maria jose fernandez ruiz");
  });

  it("preserves accents in variants (accent normalization happens at match time)", () => {
    const variants = generateNameVariants("José María García López");
    // Accents are preserved — the scorer normalizes at comparison time
    expect(variants).toContain("josé maría garcía lópez");
    expect(variants).toContain("josé garcía lópez");
    expect(variants).toContain("josé garcía");
  });

  it("deduplicates variants", () => {
    const variants = generateNameVariants("Carlos Morales");
    const unique = new Set(variants);
    expect(variants.length).toBe(unique.size);
  });
});

describe("nameTokens", () => {
  it("splits and lowercases name", () => {
    expect(nameTokens("Juan Garcia Lopez")).toEqual(["juan", "garcia", "lopez"]);
  });

  it("filters short tokens", () => {
    expect(nameTokens("A García")).toEqual(["garcía"]);
  });

  it("collapses whitespace", () => {
    expect(nameTokens("  Juan   Garcia  ")).toEqual(["juan", "garcia"]);
  });
});

describe("normaliseDni", () => {
  it("strips whitespace and hyphens, uppercases", () => {
    expect(normaliseDni("12 345 678-z")).toBe("12345678Z");
  });
});

describe("extractDniWithoutLetter", () => {
  it("extracts digits from DNI", () => {
    expect(extractDniWithoutLetter("12345678Z")).toBe("12345678");
  });

  it("extracts NIE prefix + digits", () => {
    expect(extractDniWithoutLetter("X1234567A")).toBe("X1234567");
  });
});

describe("validateDni", () => {
  it("validates DNI format", () => {
    expect(validateDni("12345678Z")).toBe(true);
    expect(validateDni("1234567Z")).toBe(false);
  });

  it("validates NIE format", () => {
    expect(validateDni("X1234567A")).toBe(true);
    expect(validateDni("A1234567B")).toBe(false);
  });
});

describe("normaliseEmployer", () => {
  it("strips corporate suffixes", () => {
    expect(normaliseEmployer("Acme Corp S.L.")).toBe("Acme Corp");
    expect(normaliseEmployer("BigCo, S.A.")).toBe("BigCo");
  });
});
