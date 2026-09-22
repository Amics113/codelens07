import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/security";

describe("secret redaction", () => {
  it("redacts API keys and passwords", () => {
    const result = redactSecrets('API_KEY="abcdefghijklmnop1234" password=supersecretvalue123');
    expect(result.count).toBeGreaterThan(0);
    expect(result.redacted).not.toContain("abcdefghijklmnop1234");
  });

  it("redacts JWT-like values", () => {
    const token = "eyJabcdefghijklmno.eyJabcdefghijklmno.eyJabcdefghijklmno";
    const result = redactSecrets(token);
    expect(result.redacted).not.toContain(token);
  });
});
