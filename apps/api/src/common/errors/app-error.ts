import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@xenonchat/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    public readonly status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
