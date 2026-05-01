export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PLAYER_DEAD'
  | 'PLAYER_NOT_DEAD'
  | 'INSUFFICIENT_FUNDS'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'REFRESH_RATE_LIMITED'
  | 'TICK_RATE_LIMITED'
  | 'LOGIN_LOCKED'
  | 'LOGIN_FAILED'
  | 'INTERNAL_ERROR';

export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly meta?: Record<string, unknown>;

  constructor(code: ActionErrorCode, message?: string, meta?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.meta = meta;
    this.name = 'ActionError';
  }
}

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: ActionErrorCode; message: string; meta?: Record<string, unknown> };
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(err: unknown): ActionResult<never> {
  if (err instanceof ActionError) {
    return { ok: false, error: { code: err.code, message: err.message, meta: err.meta } };
  }
  console.error('[ActionError unexpected]', err);
  return {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
  };
}
