import { describe, expect, it } from "bun:test";
import {
  LowdeepConfigurationError,
  LowdeepError,
  LowdeepMaxRetriesError,
  LowdeepValidationError,
} from "../src/errors";

describe("errors: custom exception classes", () => {
  it("creates LowdeepValidationError with issues", () => {
    const issues = [{ path: ["name"], message: "Required" }];
    const err = new LowdeepValidationError("Validation failed", issues);

    expect(err).toBeInstanceOf(LowdeepError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LowdeepValidationError");
    expect(err.issues).toEqual(issues);
  });

  it("creates LowdeepMaxRetriesError with full attempt diagnosis", () => {
    const err = new LowdeepMaxRetriesError(
      "All retries failed",
      3,
      '{"broken":',
      new Error("Unexpected EOF"),
    );

    expect(err).toBeInstanceOf(LowdeepError);
    expect(err.name).toBe("LowdeepMaxRetriesError");
    expect(err.attempts).toBe(3);
    expect(err.lastResponseContent).toBe('{"broken":');
    expect((err.lastError as Error).message).toBe("Unexpected EOF");
  });

  it("creates LowdeepConfigurationError", () => {
    const err = new LowdeepConfigurationError("Invalid key");
    expect(err).toBeInstanceOf(LowdeepError);
    expect(err.name).toBe("LowdeepConfigurationError");
  });
});
