import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/** Formato de erro consistente da API: { code, message, details }. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { code, message, details } = this.normalize(exception, status);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      code,
      message,
      details,
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private normalize(
    exception: unknown,
    status: number,
  ): { code: string; message: string; details?: unknown } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "string") {
        return { code: this.codeFromStatus(status), message: response };
      }
      const r = response as Record<string, unknown>;
      return {
        code: (r.code as string) ?? this.codeFromStatus(status),
        message: Array.isArray(r.message)
          ? (r.message as string[]).join(", ")
          : ((r.message as string) ?? exception.message),
        details: r.message && Array.isArray(r.message) ? r.message : undefined,
      };
    }
    return {
      code: "INTERNAL_ERROR",
      message:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? "Internal server error"
          : "Unexpected error",
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status] ? String(HttpStatus[status]) : `HTTP_${status}`;
  }
}
