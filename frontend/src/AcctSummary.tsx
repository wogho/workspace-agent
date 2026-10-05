import { Overview, n } from "./acctApi";
import { won } from "./api";

type Mode = "month" | "year" | "all";

export function PeriodBar({ mode, setMode, year, setYear, years }: {
  mode: Mode; setMode: (mode: Mode) => void; year: number; setYear: (year: number) => void; years: number[];
}) {
  return (
    <div className="a-period">
      <div className="seg big">
        {([["month", "월별"], ["year", "연간"], ["all", "전체"]] as const).map(([key, label]) => (
          <button key={key} className={mode === key ? "on" : ""} onClick={() => setMode(key)}>{label}</button>
        ))}
      </div>
      {mode !== "month" && <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((value) => <option key={value}>{value}년</option>)}</select>}
      {mode === "month" && <span className="muted small">월별 대조와 자료 상태를 함께 확인</span>}
      {mode === "all" && <span className="muted small">전체 기간 요약</span>}
    </div>
  );
}

export default function AcctSummary({ overview, mode }: { overview: Overview; mode: Mode }) {
  const t = overview.total;
  const expected = t.exp_profit;
  const unknown = t.exp_unknown_months;
  const coverage = overview.coverage;
  return (
    <section className="a-summary">
      {coverage && (
        <div className="a-cov">
          {[
            ["판매·정산", coverage.sales.synced ? "동기화 기록 있음" : "기록 없음"],
            ["구매 인계", `${coverage.handoff.count}건`],
            ["카드 명세서", coverage.card.months.length ? "자료 있음" : "자료 없음"],
            ["계좌 내역", coverage.bank.months.length ? "자료 있음" : "자료 없음"],
            ["세금계산서", coverage.invoice.months.length ? "자료 있음" : "자료 없음"],
          ].map(([label, value]) => <div className="cov ok" key={label}><span className="cov-dot" /><div><b>{label}</b><span>{value}</span></div></div>)}
        </div>
      )}
      <div className="a-cards five">
        <div className="a-card"><h4>{mode === "month" ? "선택 기간 주문" : "주문"}</h4><b className="a-big">{n(t.ordered)}건</b><small>발송 {n(t.shipped)} · 확정 {n(t.decided)}</small></div>
        <div className="a-card"><h4>매출 기준</h4><b className="a-big">{won(t.sales_basis)}</b><small>결제·정산 대조</small></div>
        <div className="a-card good"><h4>정산·입금</h4><b className="a-big">{won(t.settle_amount)}</b><small>입금 확인 {won(t.cash_in)}</small></div>
        <div className="a-card"><h4>매입 원가</h4><b className="a-big">{won(t.cc_actual_cost ?? t.card_purchase_krw)}</b><small>인계 {n(t.cc_handoffs)}건 · 카드 {n(t.card_purchases)}건</small></div>
        <div className={`a-card ${expected < 0 ? "warn" : "good"}`}><h4>예상 수익</h4><b className="a-big">{expected == null ? "—" : won(expected)}</b><small>{unknown ? `원가 미상 ${unknown}개월 제외` : "원가·세금 예비 반영"}</small></div>
      </div>
      {overview.flags.length > 0 && <div className="notice">{overview.flags.map((flag, i) => <div key={i}>확인 필요 · {flag}</div>)}</div>}
    </section>
  );
}
