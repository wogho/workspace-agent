import { useEffect, useState } from "react";
import { request } from "./api";

type Check = { name: string; status: "ok" | "warn" | "bad" | "info"; value: string; detail?: string };
type Problem = { severity: "high" | "warning" | "info"; component: string; message: string; active: boolean };
type DashboardData = {
  generated_at: string;
  summary: { ok: number; warn: number; bad: number; total: number };
  kpis: { orders: number; open_orders: number; products: number; observations: number; mail_sent: number };
  checks: Check[];
  problems: Problem[];
};

const severity: Record<string, string> = { high: "높음", warning: "경고", info: "정보" };
const status: Record<string, string> = { ok: "정상", warn: "주의", bad: "장애", info: "정보" };

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      setData(await request<DashboardData>("/api/public/dashboard/"));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!data) {
    return <main className="page dash"><p className={error ? "error" : "muted"}>{error || "통합 관제 정보를 불러오는 중…"}</p></main>;
  }

  const overall = data.summary.bad ? "bad" : data.summary.warn ? "warn" : "ok";
  const active = data.problems.filter((p) => p.active);

  return (
    <main className="page dash">
      <div className="dash-head">
        <div className={`state-banner ${overall}`}>
          <span className="dot-lg" />
          <div>
            <b>{overall === "ok" ? "모든 구성요소 정상" : overall === "warn" ? "주의가 필요한 구성요소가 있습니다" : "장애가 발생한 구성요소가 있습니다"}</b>
            <span>정상 {data.summary.ok} · 주의 {data.summary.warn} · 장애 {data.summary.bad} / 구성요소 {data.summary.total}개</span>
          </div>
        </div>
        <div className="dash-tools">
          <button className="btn ghost small-btn" disabled={busy} onClick={() => void load()}>{busy ? "확인 중…" : "지금 다시 확인"}</button>
          <span className="muted small">{new Date(data.generated_at).toLocaleString("ko-KR")} 기준</span>
        </div>
      </div>

      <section className="kpis">
        <div className="kpi"><span>주문</span><b>{data.kpis.orders}</b><em>진행 중 {data.kpis.open_orders}</em></div>
        <div className="kpi"><span>판매 상품</span><b>{data.kpis.products}</b><em>공개 집계</em></div>
        <div className="kpi"><span>관측</span><b>{data.kpis.observations}</b><em>최근 24시간</em></div>
        <div className="kpi"><span>전달 기록</span><b>{data.kpis.mail_sent}</b><em>가림 값 기반</em></div>
      </section>

      <section className="dgrid">
        <div className="pcard span2">
          <div className="p-head"><h3>문제</h3><span className="muted small">현재 {active.length}건</span></div>
          <table className="ptable">
            <thead><tr><th>심각도</th><th>구성요소</th><th>내용</th><th>상태</th></tr></thead>
            <tbody>
              {data.problems.length === 0 && <tr><td colSpan={4} className="empty">문제가 없습니다.</td></tr>}
              {data.problems.slice(0, 40).map((p, i) => (
                <tr key={i} className={`sev-${p.severity}`}>
                  <td><span className={`sev ${p.severity}`}>{severity[p.severity]}</span></td>
                  <td>{p.component}</td><td className="pmsg">{p.message}</td>
                  <td>{p.active ? <span className="pill bad">발생 중</span> : <span className="pill muted">기록</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pcard">
        <div className="p-head"><h3>구성요소 상태</h3><span className="muted small">상세 자격증명·주소·내부 경로는 표시하지 않음</span></div>
        <div className="hosts">
          {data.checks.map((c) => (
            <div key={c.name} className={`tile ${c.status}`} title={c.detail ?? c.name}>
              <div className="t-top"><span className="t-dot" /><b>{c.name}</b></div>
              <div className="t-val">{c.value}</div>
              <div className="t-det">{c.detail || status[c.status]}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
