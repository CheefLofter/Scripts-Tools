export class UserError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserError";
    this.exitCode = exitCode;
  }
}

export class GuideOutputError extends Error {
  readonly raw: string;
  readonly details?: string;

  constructor(message: string, raw: string, details?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GuideOutputError";
    this.raw = raw;
    this.details = details;
  }
}
