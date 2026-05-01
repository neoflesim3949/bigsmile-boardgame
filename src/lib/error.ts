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

// 欄位中文名（zod path → 中文）— 給使用者看的錯誤訊息用
const FIELD_LABEL: Record<string, string> = {
  user_id: 'User ID',
  login_id: 'Login ID',
  password: '密碼',
  name: '姓名',
  role: '角色',
  label: '名稱',
  description: '描述',
  emoji: '圖示',
  amount: '金額',
  units: '單位數',
  shares: '股數',
  toUserId: '收款玩家 ID',
};

interface ZodLikeIssue {
  path?: Array<string | number>;
  code?: string;
  message?: string;
  minimum?: number;
  maximum?: number;
  type?: string;
}

interface ZodLikeError {
  issues: ZodLikeIssue[];
}

function isZodError(err: unknown): err is ZodLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

function formatZodIssue(issue: ZodLikeIssue): string {
  const path = issue.path ?? [];
  const fieldKey = String(path[0] ?? '');
  const fieldLabel = FIELD_LABEL[fieldKey] ?? fieldKey;
  const min = issue.minimum;
  const max = issue.maximum;
  if (issue.code === 'too_small' && typeof min === 'number') {
    if (issue.type === 'string') return `${fieldLabel} 至少 ${min} 字`;
    return `${fieldLabel} 至少 ${min}`;
  }
  if (issue.code === 'too_big' && typeof max === 'number') {
    if (issue.type === 'string') return `${fieldLabel} 不可超過 ${max} 字`;
    return `${fieldLabel} 不可超過 ${max}`;
  }
  if (issue.code === 'invalid_type') return `${fieldLabel} 格式錯誤`;
  if (issue.code === 'invalid_format' || issue.code === 'invalid_string') {
    return `${fieldLabel} 格式不正確`;
  }
  if (issue.code === 'invalid_enum_value' || issue.code === 'invalid_value') {
    return `${fieldLabel} 值不在允許範圍`;
  }
  return `${fieldLabel || '輸入'}：${issue.message ?? '格式錯誤'}`;
}

export function fail(err: unknown): ActionResult<never> {
  if (err instanceof ActionError) {
    return { ok: false, error: { code: err.code, message: err.message, meta: err.meta } };
  }
  if (isZodError(err)) {
    const issues = err.issues.slice(0, 3).map(formatZodIssue);
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: issues.join('；'),
        meta: { issues: err.issues },
      },
    };
  }
  console.error('[ActionError unexpected]', err);
  return {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
  };
}
