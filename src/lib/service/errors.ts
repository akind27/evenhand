export type ServiceErrorCode = 'NOT_FOUND' | 'INVALID_STATE' | 'INVALID_INPUT' | 'PAYMENT' | 'HOLD_LOST';

/** The one error type the service throws on purpose. Routes match on `code`. */
export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function invalidInput(message: string): never {
  throw new ServiceError('INVALID_INPUT', message);
}
