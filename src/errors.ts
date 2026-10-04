export class LowdeepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LowdeepError";
  }
}

export class LowdeepValidationError extends LowdeepError {
  public readonly issues: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = "LowdeepValidationError";
    this.issues = issues;
  }
}

export class LowdeepConfigurationError extends LowdeepError {
  constructor(message: string) {
    super(message);
    this.name = "LowdeepConfigurationError";
  }
}

export class LowdeepMaxRetriesError extends LowdeepError {
  public readonly attempts: number;
  public readonly lastResponseContent: string | null;
  public readonly lastError: unknown;

  constructor(
    message: string,
    attempts: number,
    lastResponseContent: string | null,
    lastError: unknown,
  ) {
    super(message);
    this.name = "LowdeepMaxRetriesError";
    this.attempts = attempts;
    this.lastResponseContent = lastResponseContent;
    this.lastError = lastError;
  }
}
