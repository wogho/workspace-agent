import { Fragment, useEffect, useMemo, useState } from "react";
import { acct, BankRow, Card, CHECK, Doc, Invoice, MonthRow, n, Order, Overview, SettleDay } from "./acctApi";
import AcctSummary, { PeriodBar } from "./AcctSummary";
import { day, when, won } from "./api";

/* 회계 장부: 월별 대조 · 판매·정산 · 세금계산서 · 카드 매입 · 부가세 · 문서함 */

const TABS = [
  { key: "summary", label: "요약" },
  { key: "months", label: "월별 대조" },
  { key: "orders", label: "판매·정산" },
  { key: "invoices", label: "세금계산서" },
  { key: "bank", label: "계좌 입금" },
  { key: "cards", label: "카드 매입" },
  { key: "vat", label: "부가세" },
  { key: "docs", label: "문서함" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } };

export default function Accounting() {
  const [tab, setTab] = useState<Tab>(() => load("acct.tab", "summary"));
  const [year, setYear] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState<"month" | "year" | "all">("month");
  const [ov, setOv] = useState<Overview | null>(null);
  const [month, setMonth] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [error, setError] = useState("");

  const refresh = () => acct.overview(year).then(setOv).catch((e) => setError(String(e)));
  useEffect(() => { refresh(); }, [year]);
  useEffect(() => save("acct.tab", tab), [tab]);

  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      setLog((await acct.sync()).log.join(" · "));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const openMonth = (m: string, t: Tab = "orders") => { setMonth(m); setTab(t); };
  const months = ov?.months.map((m) => m.month) ?? [];

  return (
    <div className="ledger-page acct">
      <header className="lp-head">
        <div className="lp-title">
          <h1>회계 장부</h1>
          <span className="muted">스마트스토어 판매·정산·부가세는 커머스 API · 마지막 동기화 {when(ov?.last_sync)}</span>
        </div>
        <div className="lp-actions">
          {log && <span className="muted small log" title={log}>{log}</span>}
          <label className="sortsel"><span>연도</span>
            <select value={ov?.year ?? ""} onChange={(e) => { setYear(Number(e.target.value)); setMonth(""); }}>
              {(ov?.years ?? []).map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </label>
          <button className="btn ghost" disabled={busy} onClick={sync} title="최근 40일 판매·정산·부가세 자료를 다시 읽습니다">{busy ? "동기화 중…" : "최근 자료 동기화"}</button>
        </div>
      </header>
      {ov && <PeriodBar mode={mode} setMode={setMode} year={ov.year} setYear={(value) => setYear(value)} years={ov.years} />}
      {error && <div className="error">{error}</div>}
      {ov && ov.flags.length > 0 && (
        <div className="notice">{ov.flags.map((f, i) => <div key={i}>확인 필요 · {f}</div>)}</div>
      )}

      <nav className="status-tabs" aria-label="회계 메뉴">
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </nav>

      {tab === "summary" && ov && <AcctSummary overview={ov} mode={mode} />}
      {tab === "months" && ov && <Months ov={ov} onChanged={refresh} openMonth={openMonth} />}
      {tab === "orders" && <Orders months={months} month={month} setMonth={setMonth} />}
      {tab === "invoices" && <Invoices />}
      {tab === "bank" && <Bank year={ov?.year} months={months} month={month} setMonth={setMonth} />}
      {tab === "cards" && <Cards months={months} month={month} setMonth={setMonth} />}
      {tab === "vat" && ov && <Vat ov={ov} />}
      {tab === "docs" && <Docs />}
    </div>
  );
}

function MonthSelect({ months, month, setMonth }: { months: string[]; month: string; setMonth: (m: string) => void }) {
  return (
    <label className="sortsel"><span>월</span>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>
        <option value="">전체</option>
        {months.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </label>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className={`kstat ${tone ?? ""}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

/* ───────── 월별 대조 ───────── */

function Months({ ov, onChanged, openMonth }: { ov: Overview; onChanged: () => void; openMonth: (m: string, t?: Tab) => void }) {
  const [sel, setSel] = useState<MonthRow | null>(null);
  const t = ov.total;
  return (
    <>
      <section className="kstats">
        <Kpi label={`${ov.year}년 결제`} value={`${n(t.ordered)}건`} sub={`발송 ${n(t.shipped)} · 취소 ${n(t.canceled)} · 반품·환불 ${n(t.refunded)}`} />
        <Kpi label={`${ov.year}년 매출(결제·정산 ${ov.year}년)`} value={won(t.sales_basis)} sub={`구매확정 ${n(t.decided)}건 · 고객 결제 ${won(t.sales_amount)}`} />
        <Kpi label={`정산액(${ov.year}년 판매분)`} value={won(t.settle_amount)} sub={`수수료 ${won(t.commission)}`} tone="good" />
        <Kpi label={`계좌 입금 확인(${ov.year}년분)`} value={won(t.cash_in)} sub={t.cash_in === t.settle_amount ? "정산액과 일치 ✓" : `정산액과 차이 ${won(t.settle_amount - t.cash_in)}`} tone={t.cash_in === t.settle_amount ? "good" : "warn"} />
        <Kpi label="카드 매입" value={`${n(t.card_purchases)}건`} sub={won(t.card_purchase_krw)} />
        <Kpi label="세금계산서 합계" value={won(t.invoice_total)} sub="네이버 수수료 세금계산서" />
      </section>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>월</th><th className="r">결제</th><th className="r">발송</th><th className="r">구매확정</th><th className="r">정산완료</th>
              <th className="r">진행 중</th><th className="r">발송 전 취소</th><th className="r">반품·환불</th>
              <th className="r">매입 인계</th><th className="r">차이</th><th className="r">카드 매입</th>
              <th className="r" title="그 달 결제분 중 같은 해에 정산된 금액">정산액</th><th className="r" title="그 달 계좌에 들어온 금액과 정산 연결 여부">계좌 확인</th><th className="r" title="정산 기준일 기준 — 세금계산서와 같아야 함">수수료(기준일)</th><th className="r">세금계산서</th><th>대조</th>
            </tr>
          </thead>
          <tbody>
            {ov.months.map((m) => (
              <tr key={m.month} onClick={() => setSel(m)} className={sel?.month === m.month ? "sel" : ""}>
                <td><b>{m.month}</b></td>
                <td className="r">{n(m.ordered)}</td><td className="r">{n(m.shipped)}</td><td className="r">{n(m.decided)}</td><td className="r">{n(m.settled)}</td>
                <td className="r">{m.in_progress ? <span className="warn-t">{m.in_progress}</span> : "0"}</td>
                <td className="r">{n(m.canceled)}</td><td className="r">{m.refunded ? <span className="bad-t">{m.refunded}</span> : "0"}</td>
                <td className="r">{m.purchase_count ?? <span className="muted">—</span>}</td>
                <td className="r">{m.purchase_diff == null ? <span className="muted">—</span> : m.purchase_diff === 0 ? <span className="good-t">0</span> : <b className="bad-t">{m.purchase_diff > 0 ? "+" : ""}{m.purchase_diff}</b>}</td>
                <td className="r">{m.card_purchases ? n(m.card_purchases) : <span className="muted">—</span>}</td>
                <td className="r">{won(m.settle_amount)}</td>
                <td className="r">{!m.deposit.covered ? <span className="muted">자료 없음</span> : m.deposit.missing ? <b className="bad-t">미확인 {m.deposit.missing}</b> : <span className="good-t">✓ 전부</span>}</td>
                <td className="r">{won(m.commission_basis)}</td>
                <td className="r">{m.invoices ? <span className={m.invoice_total === m.commission_basis ? "good-t" : "bad-t"}>{won(m.invoice_total)}</span> : <span className="muted">없음</span>}</td>
                <td><span className={`status ${CHECK[m.check_status]?.tone ?? ""}`}><i />{CHECK[m.check_status]?.label ?? m.check_status}</span></td>
              </tr>
            ))}
            {!ov.months.length && <tr><td colSpan={16} className="empty">{ov.year}년 자료가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="foot muted small">연도 기준: 결제와 정산이 모두 그해인 주문만 셉니다(달은 결제월). 매입 기준: 매입 1건 = 발송(직접전달)된 판매 1건(수량). 발송 전 취소는 매입이 없어야 하고, 발송 뒤 반품·환불은 이미 매입한 건입니다. 차이 = 매입 인계 − 발송.</p>
      {sel && <MonthPanel m={sel} onClose={() => setSel(null)} onSaved={(x) => { setSel(x); onChanged(); }} openMonth={openMonth} />}
    </>
  );
}

function MonthPanel({ m, onClose, onSaved, openMonth }: { m: MonthRow; onClose: () => void; onSaved: (m: MonthRow) => void; openMonth: (m: string, t?: Tab) => void }) {
  const [count, setCount] = useState(m.purchase_count == null ? "" : String(m.purchase_count));
  const [memo, setMemo] = useState(m.check_memo);
  const [status, setStatus] = useState(m.check_status);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCount(m.purchase_count == null ? "" : String(m.purchase_count)); setMemo(m.check_memo); setStatus(m.check_status); }, [m.month]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const saveIt = async () => {
    setBusy(true);
    try {
      onSaved(await acct.month(m.month, { purchase_count: count === "" ? "" : Number(count), memo, status }));
    } finally {
      setBusy(false);
    }
  };
  const rows: [string, React.ReactNode][] = [
    ["결제(주문)", `${n(m.ordered)}건`], ["발송(직접전달)", `${n(m.shipped)}건`], ["구매확정", `${n(m.decided)}건`], ["정산완료", `${n(m.settled)}건`],
    ["진행 중(발송·미확정)", `${n(m.in_progress)}건`], ["발송 전 취소", `${n(m.canceled)}건`], ["반품·환불(발송 뒤)", `${n(m.refunded)}건`],
    ["카드 매입(외부 결제·매입처)", m.card_purchases ? `${n(m.card_purchases)}건 · ${won(m.card_purchase_krw)}` : "자료 없음"],
    ["매출(결제·정산 같은 해)", won(m.sales_basis)],
    ["정산액(이 달 결제분)", won(m.settle_amount)],
    ["계좌 입금(같은 해 판매분)", won(m.cash_in)],
    ["계좌 입금 확인", !m.deposit.covered ? "계좌 자료 없음" : m.deposit.missing ? `미확인 ${m.deposit.missing}건 · ${won(m.deposit.missing_amount)}` : `정산 ${m.deposit.settled}건 모두 입금 확인 · ${won(m.bank_in)}`],
    ["수수료(정산 기준일)", won(m.commission_basis)],
    ["세금계산서", m.invoices ? `${m.invoices}장 · ${won(m.invoice_total)}` : "없음"],
  ];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={`${m.month} 대조`}>
        <header>
          <div>
            <div className="muted small">월 대조</div>
            <h2>{m.month}</h2>
            <span className={`status ${CHECK[m.check_status]?.tone ?? ""}`}><i />{CHECK[m.check_status]?.label}</span>
            {m.checked_at && <span className="muted small"> · {when(m.checked_at)} {m.purchase_from}</span>}
          </div>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="panel-body">
          <dl className="facts wide">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
          <div className="links">
            <button className="linkbtn" onClick={() => openMonth(m.month, "orders")}>이 달 판매·정산 보기</button>
            <button className="linkbtn" onClick={() => openMonth(m.month, "cards")}>이 달 카드 매입 보기</button>
          </div>
          <h3>구매팀 매입 건수 인계</h3>
          <div className="row-input">
            <input value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="매입 건수" inputMode="numeric" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(CHECK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <p className="muted small">발송 {n(m.shipped)}건과 같아야 합니다.{count !== "" && ` 지금 차이 ${Number(count) - m.shipped > 0 ? "+" : ""}${Number(count) - m.shipped}건.`}</p>
          <textarea rows={4} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="차이 원인·확인 내용" />
          <div className="decide"><button className="btn" disabled={busy} onClick={saveIt}>저장</button></div>
        </div>
      </aside>
    </>
  );
}

/* ───────── 판매·정산 ───────── */

const ORDER_FILTERS = [
  { key: "", label: "전체" }, { key: "shipped", label: "발송" }, { key: "PURCHASE_DECIDED", label: "구매확정" },
  { key: "settled", label: "정산완료" }, { key: "unsettled", label: "정산 전" }, { key: "canceled", label: "발송 전 취소" }, { key: "refunded", label: "반품·환불" },
];

function Orders({ months, month, setMonth }: { months: string[]; month: string; setMonth: (m: string) => void }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Order[] | null>(null);
  const [days, setDays] = useState<SettleDay[]>([]);
  useEffect(() => {
    setRows(null);
    const t = setTimeout(() => acct.orders({ month, status, q }).then((r) => setRows(r.rows)), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [month, status, q]);
  useEffect(() => { acct.settlements(month).then(setDays); }, [month]);
  const sum = (f: (o: Order) => number | null | undefined) => (rows ?? []).reduce((a, o) => a + (f(o) ?? 0), 0);
  return (
    <>
      <div className="toolbar">
        <MonthSelect months={months} month={month} setMonth={setMonth} />
        <div className="seg">{ORDER_FILTERS.map((f) => <button key={f.key} className={status === f.key ? "on" : ""} onClick={() => setStatus(f.key)}>{f.label}</button>)}</div>
        <div className="searchbox"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품명·주문번호" /></div>
        <div className="tool-right"><span className="count"><b>{rows?.length ?? "…"}</b>건 · 결제 {won(sum((o) => o.total_payment))} · 정산 {won(sum((o) => o.settled?.amount))}</span></div>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>결제일</th><th className="c-name">상품</th><th className="r">수량</th><th className="r">결제금액</th><th className="r">판매자 할인</th>
              <th className="r">수수료</th><th className="r">정산 예정</th><th>상태</th><th>발송</th><th>구매확정</th><th className="r">정산</th><th>과세</th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((o) => (
              <tr key={o.product_order_id}>
                <td className="muted">{when(o.paid_at)}</td>
                <td className="c-name"><div className="pname"><span className="t" title={o.product_name}>{o.product_name}</span><small className="mono">{o.product_order_id}</small></div></td>
                <td className="r">{o.quantity}</td><td className="r">{won(o.total_payment)}</td><td className="r">{won(o.seller_discount)}</td>
                <td className="r">{won(o.commission)}</td><td className="r">{won(o.expected_settlement)}</td>
                <td><span className={`status ${o.status === "PURCHASE_DECIDED" ? "good" : ["CANCELED", "RETURNED", "CANCELED_BY_NOPAYMENT"].includes(o.status) ? "bad" : "info"}`}><i />{o.status_label}</span>{o.claim_type && <small className="muted"> · {o.claim_type}</small>}</td>
                <td className="muted">{when(o.sent_at)}</td><td className="muted">{when(o.decided_at)}</td>
                <td className="r">{o.settled ? <div className="two r"><span>{won(o.settled.amount)}</span><small>{day(o.settled.date)}</small></div> : <span className="muted">—</span>}</td>
                <td className={o.tax_type === "TAXATION" ? "" : "warn-t"}>{o.tax_type === "TAXATION" ? "과세" : o.tax_type === "TAX_FREE" ? "면세" : o.tax_type || "—"}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={12} className="empty">해당 주문이 없습니다.</td></tr>}
            {!rows && <tr><td colSpan={12} className="empty">불러오는 중…</td></tr>}
          </tbody>
        </table>
      </div>
      {month && days.length > 0 && (
        <p className="foot muted small">
          {month} 일별 정산: {days.length}건 · 정산 {won(days.reduce((a, d) => a + d.settle_amount, 0))} · 수수료 {won(-days.reduce((a, d) => a + d.commission, 0))} · 수령 {days[0].method === "ACCOUNT" ? "계좌" : days[0].method} {days[0].bank}
        </p>
      )}
    </>
  );
}

/* ───────── 세금계산서 ───────── */

function Invoices() {
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { acct.invoices().then(setRows); }, []);
  return (
    <>
      <p className="foot muted small top">네이버가 매달 보내는 전자세금계산서(보안메일)입니다. 승인된 회계 문서 경로로 확인하고 합계를 그 달 수수료(정산 기준일 기준)와 비교합니다.</p>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>작성일</th><th>공급자</th><th>공급받는자</th><th className="r">공급가액</th><th className="r">세액</th><th className="r">합계</th><th className="r">그 달 수수료(정산 기준일)</th><th>구분</th><th>승인번호</th><th /></tr></thead>
          <tbody>
            {(rows ?? []).map((x) => (
              <Fragment key={x.id}>
                <tr onClick={() => setOpen(open === x.id ? null : x.id)}>
                  <td><b>{x.issue_date}</b></td><td>{x.supplier_name}<small className="muted"> {x.supplier_regno}</small></td>
                  <td>{x.buyer_name}<small className="muted"> {x.buyer_regno}</small></td>
                  <td className="r">{won(x.supply_amount)}</td><td className="r">{won(x.tax_amount)}</td><td className="r"><b>{won(x.total_amount)}</b></td>
                  <td className="r">{won(x.month_commission)}{x.month_commission !== x.total_amount && <small className="warn-t"> 차이 {won(x.total_amount - x.month_commission)}</small>}</td>
                  <td>{x.purpose}</td><td className="mono">{x.issue_id}</td>
                  <td>{x.document_id && <a href={`/api/acct/documents/${x.document_id}/file/`} onClick={(e) => e.stopPropagation()}>XML</a>}</td>
                </tr>
                {open === x.id && (
                  <tr className="sub"><td colSpan={10}>
                    <table className="plain inner"><thead><tr><th>일자</th><th>품목</th><th>규격</th><th className="r">공급가액</th><th className="r">세액</th><th>비고</th></tr></thead>
                      <tbody>{x.items.map((i, k) => <tr key={k}><td>{i.date}</td><td>{i.name}</td><td>{i.spec}</td><td className="r">{won(i.supply)}</td><td className="r">{won(i.tax)}</td><td>{i.note}</td></tr>)}</tbody>
                    </table>
                    {x.remark && <p className="muted small">비고: {x.remark}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {rows && !rows.length && <tr><td colSpan={10} className="empty">아직 넣은 세금계산서가 없습니다. 보안메일(.html)을 문서함에 올리거나 Henry에게 전달하세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ───────── 계좌 입금 ───────── */

function Bank({ year, months, month, setMonth }: { year?: number; months: string[]; month: string; setMonth: (m: string) => void }) {
  const [data, setData] = useState<{ rows: BankRow[]; unpaid: { basis_start: string; basis_end: string; complete_date: string; amount: number }[]; coverage_from: string | null } | null>(null);
  useEffect(() => { acct.bank(month, year).then(setData); }, [month, year]);
  const rows = data?.rows ?? [];
  const txYear = (r: BankRow) => new Date(r.occurred_at).getFullYear();
  const prior = rows.filter((r) => r.sale_year !== null && r.sale_year < txYear(r));
  const sum = (l: BankRow[]) => l.reduce((a, r) => a + r.deposit, 0);
  return (
    <>
      <div className="toolbar">
        <MonthSelect months={months} month={month} setMonth={setMonth} />
        <div className="tool-right"><span className="count"><b>{rows.length}</b>건 · 입금 {won(sum(rows))}{prior.length > 0 && <> = <b>{year}년 판매분 {won(sum(rows) - sum(prior))}</b> + 전년 판매분 {won(sum(prior))}</>} · 미대조 {rows.filter((r) => r.status === "UNMATCHED").length}</span></div>
      </div>
      {prior.length > 0 && (
        <div className="notice info-n"><div>전년 판매분 입금 {prior.length}건 {won(sum(prior))}: 돈은 {year}년에 들어왔지만 판매(결제·발송·구매확정)는 전년이라 <b>{year}년 매출·세금에 들어가지 않습니다</b>(전년 매출). 총입금과 매출은 따로 봅니다.</div></div>
      )}
      {data && data.unpaid.length > 0 && (
        <div className="notice">입금 미확인 정산 {data.unpaid.length}건: {data.unpaid.slice(0, 6).map((u) => `${u.complete_date} ${won(u.amount)}`).join(" · ")}</div>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>거래일시</th><th>적요</th><th className="r">입금</th><th className="r">출금</th><th className="r">잔액</th><th>연결된 정산(기준일)</th><th>대조</th><th>메모</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="static">
                <td>{when(r.occurred_at)}</td><td>{r.memo}<small className="muted"> {r.kind}</small></td>
                <td className="r"><b>{r.deposit ? won(r.deposit) : ""}</b></td><td className="r">{r.withdraw ? won(r.withdraw) : ""}</td>
                <td className="r muted">{won(r.balance)}</td>
                <td>{r.settlements.length ? r.settlements.map((s) => `${s.basis_start}${s.basis_end !== s.basis_start ? `~${s.basis_end.slice(5)}` : ""}`).join(", ") : <span className="muted">—</span>}</td>
                <td>{r.sale_year !== null && r.sale_year < txYear(r)
                  ? <span className="status warn"><i />{r.sale_year}년 판매분 · {txYear(r)}년 매출 아님</span>
                  : <span className={`status ${r.status === "UNMATCHED" ? "bad" : r.status === "NOT_SETTLEMENT" ? "muted" : "good"}`}><i />{r.status_label}</span>}</td>
                <td className="muted small">{r.note}</td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={8} className="empty">계좌 거래내역이 없습니다. 은행에서 내려받은 파일을 문서함(계좌 입금 내역)에 올리거나 Nora에게 전달하세요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="foot muted small">계좌 자료 시작 {data?.coverage_from ? day(data.coverage_from) : "—"} · 연결 기준: 적요가 스마트스토어 정산이고, 같은 날(또는 1~3일 전) 완료된 일별 정산과 금액이 같을 때(합산 입금 포함). 그달 1일 입금에는 전월 말 주문의 정산이 들어 있을 수 있습니다.</p>
    </>
  );
}

/* ───────── 카드 매입 ───────── */

function Cards({ months, month, setMonth }: { months: string[]; month: string; setMonth: (m: string) => void }) {
  const [data, setData] = useState<{ rows: Card[]; statuses: Record<string, string>; kinds: Record<string, string> } | null>(null);
  const [kind, setKind] = useState("");
  useEffect(() => { acct.cards(month).then(setData); }, [month]);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !kind || r.kind === kind), [data, kind]);
  const kindLabel = (key: string) => key === "VENDOR" ? "매입처 직접" : key === "OTHER" ? "기타" : "외부 결제";
  const kindButtons = [["", "전체"], ...Object.keys(data?.kinds ?? {}).filter(Boolean).map((key) => [key, kindLabel(key)])];
  const update = async (id: number, patch: Partial<Card>) => {
    const x = await acct.card(id, patch);
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === id ? x : r)) });
  };
  return (
    <>
      <div className="toolbar">
        <MonthSelect months={months} month={month} setMonth={setMonth} />
        <div className="seg">{kindButtons.map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
        <div className="tool-right"><span className="count"><b>{rows.length}</b>줄 · {won(rows.reduce((a, r) => a + r.amount_krw, 0))} · 미대조 {rows.filter((r) => r.status === "UNMATCHED").length}</span></div>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>이용일</th><th>가맹점</th><th>구분</th><th>매입처</th><th className="r">원화 청구액</th><th className="r">외화</th><th>카드</th><th>승인</th><th>대조</th><th>연결 근거</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="static">
                <td>{r.used_on}</td><td>{r.merchant}</td><td>{r.kind_label}</td><td>{r.vendor ? "매입처" : <span className="muted">—</span>}</td>
                <td className="r"><b className={r.amount_krw < 0 ? "bad-t" : ""}>{won(r.amount_krw)}</b></td>
                <td className="r muted">{r.foreign_amount ? `${r.foreign_amount} ${r.currency}` : "—"}</td>
                <td className="muted">{r.card}</td><td className="mono muted">{r.approval ? `…${r.approval}` : "—"}</td>
                <td><select className="cellsel" value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}>
                  {Object.entries(data?.statuses ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><input className="cellin" defaultValue={r.matched_ref} placeholder="주문·매입 번호" onBlur={(e) => e.target.value !== r.matched_ref && update(r.id, { matched_ref: e.target.value })} /></td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={10} className="empty">카드 이용내역이 없습니다. 명세서(PDF·엑셀)를 문서함에 올리거나 회계웹 담당 Nora에게 전달하세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ───────── 부가세 ───────── */

const VAT_COLS: [string, string][] = [
  ["total", "매출 합계"], ["taxation", "과세"], ["exemption", "면세"], ["card", "신용카드"], ["cash_income", "현금영수증(소득공제)"],
  ["cash_outgoing", "현금영수증(지출증빙)"], ["other", "기타"],
];

function Vat({ ov }: { ov: Overview }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  useEffect(() => { acct.documents().then((d) => setDocs(d.rows.filter((x) => x.kind === "VAT_RETURN" || x.kind === "INCOME_TAX"))); }, []);
  const v = ov.vat;
  const t = ov.total;
  const y = ov.year;
  return (
    <>
      <section className="waterfall">
        <h3>{y}년 금액 구분 — 매출과 총입금은 다른 숫자입니다</h3>
        <div className="wf-row main"><span>{y}년 매출 <em>부가세·종합소득세 신고에 쓰는 매출(수수료 빼기 전)</em></span><b>{won(t.sales_basis)}</b></div>
        <div className="wf-row"><span>− 네이버 수수료 <em>비용 · 세금계산서 {won(t.invoice_total)}{t.invoice_total === t.commission ? " ✓ 일치" : ""}</em></span><b>−{won(t.commission)}</b></div>
        <div className="wf-row sub"><span>= {y}년 정산액 <em>수수료를 뗀 뒤 받을 돈 — 매출 아님</em></span><b>{won(t.settle_amount)}</b></div>
        {t.bank_covered ? <>
          <div className="wf-row"><span>+ 전년 판매분 입금 <em><b>{y}년 매출·세금 아님</b> — {y - 1}년 판매분(세금은 {y - 1}년)의 돈이 {y}년에 들어온 것</em></span><b>+{won(t.bank_prior)}</b></div>
          <div className="wf-row sub"><span>= {y}년 총입금 <em>계좌에 들어온 돈(현금) — 매출 아님</em></span><b>{won(t.bank_total)}</b></div>
        </> : <div className="wf-row"><span className="muted">총입금: 계좌 거래내역이 없어 표시하지 않습니다.</span><b /></div>}
        <p className="muted small">신고할 매출은 맨 위 <b>{won(t.sales_basis)}</b>(스마트스토어 몫)입니다. 다른 매출이 있으면 사업자 전체 과세표준은 더 큽니다.</p>
      </section>
      <section className="kstats">
        <Kpi label="네이버 부가세 참고자료 매출" value={won(v.total)} sub={v.total === ov.total.sales_basis ? "위 매출과 일치 ✓ (정산관리 > 부가세신고 내역)" : `위 매출과 차이 ${won(v.total - ov.total.sales_basis)}`} />
        <Kpi label="과세 · 면세" value={`${won(v.taxation)} · ${won(v.exemption)}`} tone={v.exemption ? "warn" : ""} sub={v.exemption ? "면세 매출이 있음 — 과세 구분 확인" : undefined} />
        <Kpi label="신용카드" value={won(v.card)} />
        <Kpi label="현금영수증" value={won((v.cash_income ?? 0) + (v.cash_outgoing ?? 0))} sub={`소득공제 ${won(v.cash_income)} · 지출증빙 ${won(v.cash_outgoing)}`} />
        <Kpi label="기타" value={won(v.other)} />
      </section>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>월</th>{VAT_COLS.map(([k, l]) => <th key={k} className="r">{l}</th>)}</tr></thead>
          <tbody>
            {[...ov.months].reverse().map((m) => (
              <tr key={m.month} className="static"><td><b>{m.month}</b></td>{VAT_COLS.map(([k]) => <td key={k} className={`r ${k === "exemption" && m.vat[k] ? "warn-t" : ""}`}>{won(m.vat[k])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="foot small">
        <p className="muted">간이과세자는 1년치(1~12월)를 다음 해 1월 1~25일에 신고합니다. 신고서와 납부서는 문서함에 <b>부가가치세 신고서</b>로 올리면 여기에 모입니다.<br />해외 매입은 국세청에 자동으로 잡히지 않습니다(매출만 잡힘). 매입 근거는 <b>카드 매입</b> 탭의 카드 명세서와 문서함의 매입 영수증뿐입니다.</p>
        {docs.length > 0 && <ul className="doclist">{docs.map((d) => <li key={d.id}><a href={`/api/acct/documents/${d.id}/file/`}>{d.period} · {d.title}</a> <span className="muted">{d.kind_label} · {d.status_label}</span></li>)}</ul>}
      </div>
    </>
  );
}

/* ───────── 문서함 ───────── */

function Docs() {
  const [data, setData] = useState<{ rows: Doc[]; kinds: Record<string, string>; statuses: Record<string, string> } | null>(null);
  const [kind, setKind] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => acct.documents().then(setData);
  useEffect(() => { reload(); }, []);
  const rows = (data?.rows ?? []).filter((d) => !kind || d.kind === kind);
  const upload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!(form.get("file") as File)?.name) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await acct.upload(form);
      setMsg(r.created ? `보관했습니다: ${r.document.title}` : `이미 있는 파일입니다: ${r.document.title}`);
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setMsg(String(err));
    } finally {
      setBusy(false);
    }
  };
  const now = new Date();
  return (
    <>
      {data && <form className="upload" onSubmit={upload}>
        <input type="file" name="file" required />
        <select name="kind" defaultValue="OTHER">{Object.entries(data?.kinds ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="period" defaultValue={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`} placeholder="YYYY 또는 YYYY-MM" size={9} />
        <input name="title" placeholder="제목(비우면 파일명)" />
        <input name="note" placeholder="메모" />
        <button className="btn" disabled={busy}>{busy ? "올리는 중…" : "올리기"}</button>
        {msg ? <span className="muted small">{msg}</span> : <span className="muted small">네이버 세금계산서 보안메일(.html)은 승인된 회계 문서 경로에서 확인합니다.</span>}
      </form>}
      <div className="toolbar">
        <div className="seg">
          <button className={kind === "" ? "on" : ""} onClick={() => setKind("")}>전체</button>
          {Object.entries(data?.kinds ?? {}).map(([k, v]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{v}</button>)}
        </div>
        <div className="tool-right"><span className="count"><b>{rows.length}</b>개</span></div>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>기간</th><th>종류</th><th className="c-name">제목</th><th>상태</th><th className="r">크기</th><th>등록</th><th>메모</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="static">
                <td><b>{d.period}</b></td><td>{d.kind_label}</td>
                <td className="c-name"><div className="pname"><span className="t" title={d.title}>{d.title}</span><small>{d.filename}</small></div></td>
                <td><select className="cellsel" value={d.status} onChange={async (e) => { await acct.document(d.id, { status: e.target.value }); reload(); }}>
                  {Object.entries(data?.statuses ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td className="r muted">{Math.max(1, Math.round(d.size / 1024))}KB</td>
                <td className="muted">{day(d.added_at)} · {d.added_by}</td>
                <td className="muted small">{d.note || "—"}</td>
                <td><a href={`/api/acct/documents/${d.id}/file/`}>받기</a></td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={8} className="empty">보관된 문서가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
