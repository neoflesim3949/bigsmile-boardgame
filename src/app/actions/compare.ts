'use server';

import { z } from 'zod';
import { query } from '@/lib/db';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';

/**
 * /compare 公開留言 server actions（任何人可寫入，無 session 驗證）。
 * - 寫入限制：authorName 1-30 字、content 1-1000 字（DB CHECK + zod 雙保險）
 * - itemKey 限定 "1.1" ~ "4.10" 格式，防止隨便寫入造表外資料
 */

export interface CompareCommentRow {
  id: number;
  item_key: string;
  author_name: string;
  content: string;
  created_at: string;
}

const ITEM_KEY_RE = /^[1-4]\.\d{1,2}$/;

const AddSchema = z.object({
  itemKey: z.string().regex(ITEM_KEY_RE, '條目編號格式錯誤'),
  authorName: z.string().trim().min(1, '留言者必填').max(30, '留言者最多 30 字'),
  content: z.string().trim().min(1, '內容必填').max(1000, '內容最多 1000 字'),
});

export async function listCompareComments(): Promise<Record<string, CompareCommentRow[]>> {
  const r = await query<CompareCommentRow>(
    `SELECT id, item_key, author_name, content, created_at
     FROM "CompareComment"
     ORDER BY created_at ASC`,
  );
  const byKey: Record<string, CompareCommentRow[]> = {};
  for (const row of r.rows) {
    (byKey[row.item_key] ??= []).push({
      ...row,
      created_at: new Date(row.created_at as unknown as string | Date).toISOString(),
    });
  }
  return byKey;
}

export async function addCompareComment(input: {
  itemKey: string;
  authorName: string;
  content: string;
}): Promise<ActionResult<CompareCommentRow>> {
  try {
    const parsed = AddSchema.parse(input);
    const r = await query<CompareCommentRow>(
      `INSERT INTO "CompareComment" (item_key, author_name, content)
       VALUES ($1, $2, $3)
       RETURNING id, item_key, author_name, content, created_at`,
      [parsed.itemKey, parsed.authorName, parsed.content],
    );
    if (r.rows.length === 0) {
      throw new ActionError('INTERNAL_ERROR', '寫入失敗');
    }
    const row = r.rows[0];
    return ok({
      ...row,
      created_at: new Date(row.created_at as unknown as string | Date).toISOString(),
    });
  } catch (err) {
    return fail(err);
  }
}
