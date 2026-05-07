import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 玩家 QR / display token 用 HMAC-SHA256 簽章。
 * 格式：base64url(payload).base64url(signature)
 * payload = JSON { sub, kind, nonce, exp }
 */

export type QrKind = 'player' | 'display';

interface QrPayload {
  sub: string;
  kind: QrKind;
  nonce: string;
  exp: number;
}

function qrSecret(): string {
  const s = process.env.QR_SECRET;
  if (!s || s.length < 32) {
    throw new Error('QR_SECRET must be set to a string of at least 32 characters');
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64url');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', qrSecret()).update(payloadB64).digest('base64url');
}

export function signQrToken(sub: string, kind: QrKind, ttlSeconds: number): string {
  const payload: QrPayload = {
    sub,
    kind,
    nonce: randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyQrToken(
  token: string,
  expectedKind: QrKind,
): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  // Constant-time HMAC 比較（code review 0505 L2）— 防 timing attack 漸近發現有效簽章
  const expected = Buffer.from(sign(payloadB64));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let payload: QrPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.kind !== expectedKind) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { sub: payload.sub };
}
