import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

interface Props { params: Promise<{ id: string }> }

export default async function StockDetailPage({ params }: Props) {
  await requireRole('admin');
  const { id } = await params;

  const stock = await query<{ id: string; code: string; name: string; current_price: number }>(
    `SELECT id, code, name, current_price FROM "Stock" WHERE id = $1`,
    [id],
  );
  if (stock.rows.length === 0) redirect('/admin/stocks');

  const history = await query<{ price: number; recorded_at: string }>(
    `SELECT price, recorded_at FROM "StockHistory"
     WHERE stock_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
    [id],
  );

  const s = stock.rows[0];
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <a href="/admin/stocks" className="text-zinc-500 hover:text-amber-400 text-sm">← 回股票列表</a>
      <h1 className="text-2xl font-bold text-zinc-100 mt-4 flex items-baseline gap-3">
        <span className="font-mono text-amber-300">{s.code}</span>
        <span>{s.name}</span>
        <span className="text-amber-400 ml-auto">{s.current_price.toLocaleString()}</span>
      </h1>
      <p className="text-sm text-zinc-500 mt-1">編輯請回列表頁點 ✏️ 圖示。本頁顯示最近 100 筆價格歷史。</p>

      <div className="glass-panel rounded-2xl mt-6 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/30">
              <th className="p-3">記錄時間</th>
              <th className="p-3 text-right">價格</th>
            </tr>
          </thead>
          <tbody className="text-zinc-200 text-sm">
            {history.rows.map((h, i) => (
              <tr key={i} className="border-b border-zinc-800/50">
                <td className="p-3 text-zinc-400 text-xs">{new Date(h.recorded_at).toLocaleString()}</td>
                <td className="p-3 text-right font-mono text-amber-300">{h.price.toLocaleString()}</td>
              </tr>
            ))}
            {history.rows.length === 0 && (
              <tr><td colSpan={2} className="p-8 text-center text-zinc-500">尚無歷史價格</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
