import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Neo V2 vs 體系版（Bigsmile Unity）功能比對',
  description: '跨版本盤點 · 5/5 會議結論 · 待議項目',
  robots: { index: false, follow: false },
};

/**
 * 公開比對頁（無需登入）。
 * 對應 docs/different_NeoV2&BigsmileUnity.md，做成類 PDF 視覺。
 * middleware.ts PUBLIC_PATHS 已放行 /compare；ThemeProvider 強制深色。
 */
export default function ComparePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ===== Hero ===== */}
      <section className="border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-transparent">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <Pill color="sky">FUNCTIONAL COMPARISON</Pill>
          <h1 className="mt-5 text-3xl sm:text-5xl font-bold leading-tight tracking-tight">
            Neo V2 vs 體系版
            <span className="block text-2xl sm:text-3xl text-zinc-300 mt-2 font-semibold">
              （Bigsmile Unity）功能比對
            </span>
          </h1>
          <p className="mt-3 text-zinc-400">跨版本盤點 · 5/5 會議結論 · 待議項目</p>

          <div className="mt-6 inline-block border-l-4 border-sky-500 bg-zinc-900/60 px-5 py-3 rounded-r-md">
            <MetaRow label="撰寫日期" value="2026-05-06" />
            <MetaRow label="資料來源" value="5/5 會議討論 + 跨版本盤點" />
            <MetaRow label="文件目的" value="供 PM / 設計 / 工程跨版對齊" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-14">
        {/* ===== 摘要 ===== */}
        <Section title="摘要">
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard num="3" label="已決定項目" />
            <StatCard num="3" label="需求待實作" />
            <StatCard num="3" label="未討論 / 待補議" />
          </div>
          <Table
            headers={['區塊', 'Neo V2 功能數', '體系版可達成', '體系版無']}
            rows={[
              ['用戶端', '9', '3（同等 / 可達成）', '4（無）+ 2（部分差異）'],
              ['關主端', '4', '2（同等）', '2（無）'],
              ['活動看板', '1（雙模式）', '0.5（僅最終）', '—'],
              ['後台邏輯', '10', '2（部分達成）', '8（無 / 不做 / 待討論）'],
            ]}
          />
        </Section>

        {/* ===== 1. 用戶端 ===== */}
        <Section title="1. 用戶端對照">
          <Table
            headers={['#', '功能', 'Neo V2', '體系版', '差異 / 5/5 結論']}
            colWidths={['w-12', 'w-40', '', '', '']}
            rows={[
              ['1.1', <strong key="t">命格 / 角色</strong>, '抽卡命格池（多範本、可設比例 / quota）', '角色（不能抽卡，玩家直接選）', <Warn key="x">體系版 <strong>不能抽卡</strong>，只能選角色</Warn>],
              ['1.2', <strong key="t">掃碼加分</strong>, '關主掃 QR → 套快捷模組', '掃碼加分（可雙向）', <Ok key="x">達成相同效果</Ok>],
              ['1.3', <strong key="t">進行狀態（每回合自動扣值）</strong>, '業力影響 + 借款利息會自動扣', '無', <Neutral key="x">選配；體系版不做（見 §4.7）</Neutral>],
              ['1.4',
                <strong key="t">四項數值<br /><span className="text-xs text-zinc-400 font-normal">（金錢 / 健康 / 福分 / 業力）</span></strong>,
                '各項上限 / 死亡狀態 / 視覺化',
                '維度數值（多維）',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">5/5 結論：</div>
                  <BulletList items={[
                    <>單項數值<strong>可設上限值</strong></>,
                    <>負額需查<strong>後台排行榜</strong>人工處理</>,
                  ]} />
                  <div className="pt-2 space-y-1">
                    <ReqLine n="1">某個維度值 &lt; 0 時應 <strong>出現提示</strong></ReqLine>
                    <ReqLine n="3">（待確認）單一維度設上限值機制</ReqLine>
                  </div>
                </div>,
              ],
              ['1.5', <strong key="t">換匯所<br /><span className="text-xs text-zinc-400 font-normal">（玩家自行換匯）</span></strong>, '後台設方案、玩家自選兌換', '無', <Pending key="x">未討論</Pending>],
              ['1.6', <strong key="t">銀行借貸<br /><span className="text-xs text-zinc-400 font-normal">（玩家自行借貸生成合約）</span></strong>, '後台設方案、合約化還款', '無', <Pending key="x">未討論</Pending>],
              ['1.7', <strong key="t">轉帳</strong>, '玩家輸完整 ID / 掃 QR 找對方', '轉帳', <Ok key="x">達成相同效果</Ok>],
              ['1.8', <strong key="t">股市大廳<br /><span className="text-xs text-zinc-400 font-normal">（玩家自行買賣）</span></strong>, '≤ 10 檔股票、依當下 current_price 即時成交', '無',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">5/5 結論：</div>
                  <p><strong>無法客製、改完關主人工買賣</strong>（體系版股市改由關主端代操）</p>
                </div>],
              ['1.9', <strong key="t">道具</strong>, '關主識別 + 快捷發放設定 buff', '可針對單項任務作加成',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-amber-300">⚠ 設計取向不同：</div>
                  <BulletList items={[
                    <><strong>Neo</strong>：道具是 <strong>關主前置條件</strong>（req_item_id），用於「持某道具才能做某事」</>,
                    <><strong>體系</strong>：道具是 <strong>任務加成器</strong>（持有時 quick action 加倍效果）</>,
                  ]} />
                </div>],
            ]}
          />
        </Section>

        {/* ===== 2. 關主端 ===== */}
        <Section title="2. 關主端對照">
          <Table
            headers={['#', '功能', 'Neo V2', '體系版', '差異 / 結論']}
            colWidths={['w-12', 'w-40', '', '', '']}
            rows={[
              ['2.1', <strong key="t">快捷分數配置</strong>, <code key="x">/captain/actions</code>, '後台任務設定', <Ok key="x">達成相同效果</Ok>],
              ['2.2', <strong key="t">重生鍵</strong>,
                '站點 allow_rebirth=true 時對死亡玩家觸發、自動依後台重生初始值',
                <strong key="x">改後台 GM 重新配發分數</strong>,
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-amber-300">⚠ 流程不同：</div>
                  <BulletList items={[
                    <><strong>Neo</strong>：自動化（防呆 + 雙重驗證）</>,
                    <><strong>體系</strong>：admin 手動配發</>,
                  ]} />
                </div>],
              ['2.3', <strong key="t">股票加成賣出</strong>, '關主可代售加倍率（含道具前置條件）', '無', <Bad key="x">體系版無此功能</Bad>],
              ['2.4', <strong key="t">進行列表 + 確認完成</strong>, '兩步驗證（再掃 QR / 輸 ID）+ 確認結算', '任務（可雙向掃碼加分）',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-amber-300">⚠ 流程簡化：</div>
                  <BulletList items={[
                    <><strong>Neo</strong>：localStorage 持久化進行列表 + 雙步驗證防誤觸</>,
                    <><strong>體系</strong>：直接掃碼加分、無中間態</>,
                  ]} />
                </div>],
            ]}
          />
        </Section>

        {/* ===== 3. 活動看板 ===== */}
        <Section title="3. 活動看板端對照">
          <Table
            headers={['#', '功能', 'Neo V2', '體系版', '差異']}
            colWidths={['w-12', 'w-40', '', '', '']}
            rows={[
              ['3.1', <strong key="t">看板顯示</strong>,
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold">雙模式：</div>
                  <BulletList items={[
                    <><strong>常規模式</strong>：股票走勢 + 跑馬燈 + 事件輪播</>,
                    <><strong>終局模式</strong>：完整風雲榜 + 排序 / 分頁</>,
                  ]} />
                </div>,
                <strong key="x">僅最終風雲榜</strong>,
                <Warn key="x">Neo 含活動進行中股市行情、體系版只有結算後排名</Warn>],
            ]}
          />
        </Section>

        {/* ===== 4. 後台邏輯 ===== */}
        <Section title="4. 後台及邏輯端對照">
          <Table
            headers={['#', '功能', 'Neo V2', '體系版', '差異 / 結論']}
            colWidths={['w-12', 'w-44', '', '', '']}
            rows={[
              ['4.1', <strong key="t">回合及回合推進計算各項目數值影響</strong>,
                'admin 手動推進、每回合 10 分鐘、一次推進觸發：套用股價腳本 + 強制平倉 + 業力影響 + 借款利息結算（多項數值同步計算）',
                '無回合邏輯',
                <Bad key="x">體系版不分回合（無「推進」這個動作、無連動計算）</Bad>],
              ['4.2', <strong key="t">數值顯示 / 隱藏</strong>,
                <><code>ShowAllStats</code> 控制福分 / 業力具體數值；只見狀態 label</>,
                <strong key="x">使用六維能力值並起特殊名稱替代</strong>,
                <Warn key="x">體系版用「假名字」遮蔽（Neo 是直接擋數值顯示）</Warn>],
              ['4.3', <strong key="t">最終計分權重</strong>,
                <>三項權重（money×W_m + blessing×W_b − karma×W_k）後台可調</>,
                '無',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">5/5 結論：</div>
                  <ReqLine n="2">各維度可<strong>自訂計算權重</strong>、列出排行榜（體系版要新增此功能）</ReqLine>
                </div>],
              ['4.4', <strong key="t">賣股福分扣分</strong>,
                'profit > 0 時依 divisor 扣福分（admin 可調 divisor）',
                '同股票模組相關邏輯',
                <Warn key="x">體系版股市無此設計（因股市改關主操作）</Warn>],
              ['4.5', <strong key="t">重生後初始值</strong>,
                '後台設 RebirthMoney/Health/Blessing/Karma',
                <strong key="x">後台 GM 重新配發分數</strong>,
                <Warn key="x">Neo 自動套用、體系手動配</Warn>],
              ['4.6', <strong key="t">新手命格範本（抽卡池）可設比例</strong>,
                <>InitialValueTemplate CRUD + draw_ratio + MaxDestinyDraws cycle 演算法</>,
                '角色（不能抽卡）',
                <Warn key="x">體系版無抽卡機制</Warn>],
              ['4.7', <strong key="t">業力影響<br /><span className="text-xs text-zinc-400 font-normal">（KarmaBand）</span></strong>,
                '每回合自動套四項 delta 依當下 karma',
                '無',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">5/5 結論：</div>
                  <p><strong>不做此功能</strong></p>
                </div>],
              ['4.8', <strong key="t">換匯所後台<br /><span className="text-xs text-zinc-400 font-normal">（可設換匯比例）</span></strong>,
                'ExchangeOption CRUD + 倍率即時控制',
                '無',
                <Pending key="x">未討論</Pending>],
              ['4.9', <strong key="t">銀行借貸後台<br /><span className="text-xs text-zinc-400 font-normal">（福份抵押 + 每期金錢 / 福份利息）</span></strong>,
                'BankLoanOption CRUD + 合約化',
                '無',
                <Pending key="x">未討論</Pending>],
              ['4.10', <strong key="t">股市商品<br /><span className="text-xs text-zinc-400 font-normal">（可設回合價格 / 事件 / 自動回收）</span></strong>,
                'StockRoundScript + StockRoundEvent + force_liquidation_ratio',
                '無',
                <div key="x" className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">5/5 結論：</div>
                  <p><strong>無法客製、改完關主人工買賣</strong></p>
                </div>],
            ]}
          />
        </Section>

        {/* ===== 5/5 會議結論 ===== */}
        <Section title="5/5 會議重點結論彙整">
          <Callout color="emerald" title="✅ 已決定">
            <Table
              headers={['項目', '結論']}
              rows={[
                ['4 項數值（1.4）', '單項數值可設上限值；負額需查後台排行榜人工處理'],
                ['股市大廳（1.8 / 4.10）', '體系版無法客製股市，改完關主人工買賣'],
                ['業力影響（4.7）', '不做此功能'],
              ]}
              compact
            />
          </Callout>

          <Callout color="amber" title="📌 需求待實作">
            <Table
              headers={['#', '需求內容', '來源']}
              colWidths={['w-24', '', 'w-28']}
              rows={[
                [<strong key="t">需求 1</strong>, <>某個維度值 &lt; 0 時，前端應 <strong>出現提示</strong> 給玩家</>, '1.4 衍生'],
                [<strong key="t">需求 2</strong>, <>各維度可 <strong>自訂計算權重</strong>，列出排行榜</>, '4.3'],
                [<strong key="t">需求 3</strong>, <>單一維度可設 <strong>上限值</strong> 機制（待確認規格）</>, '1.4 衍生'],
              ]}
              compact
            />
          </Callout>

          <Callout color="sky" title="⏸ 未討論 / 待補議">
            <Table
              headers={['項目', '影響']}
              rows={[
                ['換匯所（1.5 / 4.8）', '體系版要不要做？做的話 UI / 規格如何'],
                ['銀行借貸（1.6 / 4.9）', '同上'],
                ['進行狀態自動扣值（1.3）', '跟業力 4.7 連動，業力既不做、自動扣值是否一併刪除？'],
              ]}
              compact
            />
          </Callout>
        </Section>

        {/* ===== 設計取向核心差異 ===== */}
        <Section title="設計取向核心差異">
          <SubSection title="A. 自動化 vs 手動化">
            <Table
              headers={['面向', 'Neo V2', '體系版']}
              rows={[
                ['玩家買賣股票', '玩家自助', <strong key="x">關主代操</strong>],
                ['重生', '自動套重生初始值', <strong key="x">GM 手動配</strong>],
                ['業力影響', '每回合自動', <strong key="x">不做</strong>],
                ['借款利息', '每回合自動扣', <strong key="x">無借貸機制</strong>],
              ]}
              compact
            />
            <ArrowNote>
              體系版 <strong>重操作門檻、輕系統自動</strong>，更接近「桌遊以人為主、系統輔助」。
            </ArrowNote>
          </SubSection>

          <SubSection title="B. 命運機制 vs 角色機制">
            <Table
              headers={['Neo V2', '體系版']}
              rows={[['抽命格（隨機 + ratio）', '選角色']]}
              compact
            />
            <ArrowNote>
              Neo 偏「命運論」（你抽到什麼是天意 / 機運），體系版偏「角色扮演」（你選擇你要的）。
            </ArrowNote>
          </SubSection>

          <SubSection title="C. 經濟系統複雜度">
            <Table
              headers={['Neo V2', '體系版']}
              rows={[['股市 + 換匯 + 借貸 + 業力扣分 + 強制平倉', '沒有經濟系統（只有計分）']]}
              compact
            />
            <ArrowNote>Neo 有完整虛擬經濟、體系版專注核心積分玩法。</ArrowNote>
          </SubSection>
        </Section>

        {/* ===== 跨版本實作可行性 ===== */}
        <Section title="跨版本實作可行性建議">
          <SubSection title="體系版要實作 Neo 的功能，需要的工程量">
            <Table
              headers={['功能', '體系版實作難度', '建議優先序']}
              rows={[
                ['需求 1（負值提示）', <span key="x" className="text-emerald-400">🟢 低（純 UI 邏輯）</span>, <strong key="y">必做</strong>],
                ['需求 2（計分權重）', <span key="x" className="text-emerald-400">🟢 低（後端公式 + admin UI 可調）</span>, <strong key="y">必做</strong>],
                ['需求 3（單維上限）', <span key="x" className="text-emerald-400">🟢 低（同需求 1）</span>, <strong key="y">必做</strong>],
                ['換匯所', <span key="x" className="text-amber-400">🟡 中（後端方案表 + 玩家 UI）</span>, '待 PM 決議'],
                ['銀行借貸', <span key="x" className="text-orange-400">🟠 中高（合約模式 + 利息結算）</span>, '待 PM 決議'],
                ['命格抽卡', <span key="x" className="text-orange-400">🟠 中高（演算法 + 範本管理）</span>, '體系版「角色」已部分覆蓋、不必補'],
                ['業力影響', '—', '5/5 已決定不做'],
                ['玩家自助股市', '—', '5/5 已決定不做'],
              ]}
              compact
            />
          </SubSection>

          <SubSection title="Neo V2 要簡化向體系版靠攏，需要的工程量">
            <p className="text-zinc-400 text-sm mb-3">如果 Neo 想關掉某些功能讓玩法接近體系：</p>
            <Table
              headers={['Neo 功能', '關閉方式']}
              rows={[
                ['業力影響', 'admin 把所有 KarmaBand 的 delta 設 0'],
                ['換匯所', '不創 ExchangeOption row（玩家點 /exchange 看到空清單）'],
                ['銀行借貸', '不創 BankLoanOption row'],
                ['玩家自助股市', <>把所有 Stock <code>is_visible=false</code> 並 <code>is_sellable=false</code>（或單純不告訴玩家股市路徑）</>],
                ['抽命格', <><code>AppSettings.CardDrawMode=&apos;false&apos;</code>（middleware 不導 /onboarding）</>],
              ]}
              compact
            />
            <ArrowNote color="emerald">Neo V2 設計上即支援「關閉部分功能」，可彈性配置。</ArrowNote>
          </SubSection>
        </Section>

        {/* ===== 結論 ===== */}
        <Section title="結論">
          <p className="font-semibold text-zinc-200 mb-4">兩版本定位明顯不同：</p>
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <div className="rounded-lg border border-sky-800/60 bg-sky-950/30 p-5">
              <div className="text-sky-300 font-bold mb-2">Neo V2</div>
              <p className="text-zinc-200">功能完整、自動化高、虛擬經濟深、命格機制。</p>
              <p className="text-zinc-400 text-sm mt-1">適合「玩家自主、系統做事多」的活動。</p>
            </div>
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-5">
              <div className="text-amber-300 font-bold mb-2">體系版</div>
              <p className="text-zinc-200">功能精簡、人為操作多、純積分玩法、角色機制。</p>
              <p className="text-zinc-400 text-sm mt-1">適合「以人為主、系統當記分板」的活動。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="font-semibold text-zinc-100 mb-1">5/5 會議的決議走向</div>
              <p className="text-zinc-300">
                體系版 <strong>不擴張為 Neo V2</strong>，而是補足 3 個必要需求（負值提示 / 計分權重 / 單維上限）後維持精簡定位。
              </p>
            </div>
            <div>
              <div className="font-semibold text-zinc-100 mb-1">未來潛在合作</div>
              <p className="text-zinc-300">若體系版未來要加經濟系統（換匯 / 借貸），可參考 Neo V2 的 schema 與規範。</p>
            </div>
          </div>
        </Section>

        <footer className="border-t border-zinc-800/60 pt-6 text-center text-xs text-zinc-500">
          Neo V2 vs 體系版（Bigsmile Unity）功能比對 · 2026-05-06
        </footer>
      </div>
    </main>
  );
}

/* ====== Reusable building blocks ====== */

function Pill({ children, color = 'sky' }: { children: React.ReactNode; color?: 'sky' | 'amber' | 'emerald' }) {
  const map = {
    sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  } as const;
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold tracking-wider ${map[color]}`}>
      {children}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm py-0.5">
      <span className="text-zinc-500 w-20 shrink-0">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-zinc-100 border-b-2 border-sky-500/40 pb-2 mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
        <span className="w-1 h-5 bg-sky-500 rounded" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatCard({ num, label }: { num: string; label: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="text-4xl font-bold text-sky-400">{num}</div>
      <div className="text-sm text-zinc-400 mt-1">{label}</div>
    </div>
  );
}

function Table({
  headers,
  rows,
  colWidths,
  compact = false,
}: {
  headers: React.ReactNode[];
  rows: React.ReactNode[][];
  colWidths?: string[];
  compact?: boolean;
}) {
  const padCls = compact ? 'px-3 py-2' : 'px-3 py-3';
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-sky-950/60 text-sky-200 border-b border-zinc-800">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`${padCls} text-left font-semibold ${colWidths?.[i] ?? ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={ri}
              className={`border-b border-zinc-800/60 last:border-b-0 ${ri % 2 === 0 ? 'bg-zinc-900/30' : 'bg-zinc-900/10'}`}
            >
              {r.map((cell, ci) => (
                <td key={ci} className={`${padCls} align-top text-zinc-200 leading-relaxed`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-0.5 text-zinc-300">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Ok({ children }: { children: React.ReactNode }) {
  return <span className="text-emerald-400">✅ {children}</span>;
}
function Bad({ children }: { children: React.ReactNode }) {
  return <span className="text-rose-400">❌ {children}</span>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-300">⚠ {children}</span>;
}
function Neutral({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-300">🟡 {children}</span>;
}
function Pending({ children }: { children: React.ReactNode }) {
  return <span className="text-sky-300">⏸ <strong>{children}</strong></span>;
}

function ReqLine({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-amber-200">
      <span className="font-semibold shrink-0">📌 需求 {n}：</span>
      <span>{children}</span>
    </div>
  );
}

function Callout({
  color,
  title,
  children,
}: {
  color: 'emerald' | 'amber' | 'sky';
  title: string;
  children: React.ReactNode;
}) {
  const map = {
    emerald: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300',
    amber: 'border-amber-700/60 bg-amber-950/30 text-amber-300',
    sky: 'border-sky-700/60 bg-sky-950/30 text-sky-300',
  } as const;
  return (
    <div className={`rounded-lg border-l-4 ${map[color]} pl-4 py-3 pr-3 space-y-3`}>
      <div className="font-bold">{title}</div>
      {children}
    </div>
  );
}

function ArrowNote({ children, color = 'sky' }: { children: React.ReactNode; color?: 'sky' | 'emerald' }) {
  const map = {
    sky: 'border-sky-500/40 bg-sky-950/20 text-sky-200',
    emerald: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
  } as const;
  return (
    <div className={`mt-2 rounded-md border-l-4 ${map[color]} px-4 py-2 text-sm`}>
      → {children}
    </div>
  );
}
