import { useEffect, useState } from "react";
import { api, Calc, won } from "./api";

const RATE_LABEL: Record<string, string> = {
  sales_fee: "판매 수수료", vat_reserve: "부가세 예비", income_tax_reserve: "소득세·지방세 예비",
  refund_loss: "환불·키 오류 손실", overseas_payment_fee: "해외결제 수수료",
};

export default function Calculator() {
  const [policy, setPolicy] = useState<Record<string, any> | null>(null);
  const [cost, setCost] = useState("1739");
  const [competitor, setCompetitor] = useState("2350");
  const [result, setResult] = useState<Calc | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { api.policy().then((p) => setPolicy(p.current)); }, []);
  const run = async () => {
    setError("");
    try { setResult(await api.calc(cost, competitor)); } catch (e) { setError(String(e)); }
  };
  useEffect(() => { run(); }, []);

  return (
    <div className="page two">
      <section className="box">
        <h2>계산기</h2>
        <p className="muted small">가격 정책에 따라 노출가와 등록가를 구분합니다. 노출가 = 알림받기 쿠폰 적용 후 보이는 가격, 등록가 = 노출가 + 쿠폰.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="calc-form">
          <label>매입가(원)<input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" /></label>
          <label>경쟁 최저가(원, 없으면 비움)<input value={competitor} onChange={(e) => setCompetitor(e.target.value)} inputMode="numeric" /></label>
          <button className="btn">계산</button>
        </form>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className={`verdict ${result.pass ? "good" : "warn"}`}>
            <div className="big">{result.pass ? "통과" : "탈락"} · 예상 순이익 {won(result.profit_krw)}</div>
            <div className="calc">
              {result.mode === "no_competitor" ? `경쟁 상품 없음 → 순이익 ${won(result.no_competitor_profit_krw)}이 되는 노출가` : "노출가 = 경쟁 최저가 − 50원"}<br />
              노출가 <b>{won(result.exposed_price_krw)}</b> · 등록가 <b>{won(result.list_price_krw)}</b> · 공제 {won(result.deductions_krw)} (비용률 {(result.cost_rate * 100).toFixed(3)}%)
            </div>
          </div>
        )}
      </section>
      <section className="box">
        <h2>정책 <span className="muted small">{policy?.policy_version}</span></h2>
        {policy && (
          <table className="plain">
            <tbody>
              {Object.entries(policy.rates as Record<string, number>).map(([k, v]) => (
                <tr key={k}><td>{RATE_LABEL[k] ?? k}</td><td className="r">{(v * 100).toFixed(3)}%</td><td className="muted small">{policy.notes?.[k]}</td></tr>
              ))}
              <tr><td>알림받기 쿠폰</td><td className="r">{won(policy.coupon_krw)}</td><td className="muted small">등록가 = 노출가 + 쿠폰</td></tr>
              <tr><td>경쟁가 대비 인하</td><td className="r">{won(policy.undercut_krw)}</td><td className="muted small">기본값. 더 크게 낮추는 것은 사용자·CFO 결정</td></tr>
              <tr><td>최소 순이익</td><td className="r">{won(policy.min_profit_krw)}</td><td className="muted small">접수된 주문은 {won(policy.existing_order_min_profit_krw)} 기준</td></tr>
              <tr><td>주문당 고정비</td><td className="r">{won(policy.fixed_cost_per_order_krw)}</td><td /></tr>
            </tbody>
          </table>
        )}
        <p className="muted small">정책 값은 승인된 운영 정책 저장소에서 읽습니다.</p>
      </section>
    </div>
  );
}
