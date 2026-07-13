import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ErrorCodes } from '@xenonchat/shared';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    if (exception instanceof AppError) {
      return reply.status(exception.status).send({
        ok: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          retry_after_ms: exception.retryAfterMs,
        },
      });
    }

    if (exception instanceof ZodError) {
      return reply.status(HttpStatus.BAD_REQUEST).send({
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: exception.flatten(),
        },
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return reply.status(HttpStatus.CONFLICT).send({
          ok: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'A unique value is already in use',
            details: { fields: exception.meta?.target },
          },
        });
      }
      if (exception.code === 'P2025') {
        return reply.status(HttpStatus.NOT_FOUND).send({
          ok: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: 'Resource not found',
          },
        });
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
      return reply.status(status).send({
        ok: false,
        error: {
          code: status === 401 ? ErrorCodes.AUTH_INVALID_TOKEN : ErrorCodes.VALIDATION_ERROR,
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      });
    }

    // eslint-disable-next-line no-console
    console.error(exception);
    return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      ok: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    });
  }
}
