/**
 * Typed domain error for business and persistence layers.
 * Transport-specific mapping (HTTP, CLI, etc.) should live elsewhere.
 */
export class DomainError extends Error {
  readonly domainCode: string;

  constructor(domainCode: string, options?: ErrorOptions) {
    super(domainCode, options);
    this.name = 'DomainError';
    this.domainCode = domainCode;
  }
}

export function domainError(domainCode: string, options?: ErrorOptions): DomainError {
  return new DomainError(domainCode, options);
}

export function readDomainCode(error: unknown): string | null {
  if (error instanceof DomainError) {
    return error.domainCode;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return null;
}
