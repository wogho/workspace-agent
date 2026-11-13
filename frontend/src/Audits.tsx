import { useEffect, useState } from "react";
import { request, when } from "./api";

type AuditRow = { at: string; severity_label: string; verdict_label: string; pattern_label: string; product_label: string; reason_label: string; status_label: string };
type AuditResponse = { days: number; summary: { open: number; needs_user: number; resolved: number; by_severity: Record<string, number> }; rows: AuditRow[] };

export default function Audits() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try { setData(await request<AuditResponse>(`/api/public/audits/?days=${days}`)); setError(""); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => { void load(); }, [days]);
  if (!data) return <main className="page"><p className={error ? "error" : "muted"}>{error || "오탐 내역을 불러오는 중…"}</p></main>;
  return (
    <main className="page aud">
      <div className="lp-head"><div className="lp-title"><h1>오탐 내역</h1><span className="muted">판정 품질과 사용자 확인 필요 항목</span></div>
        <div className="chg-tools"><div className="seg">{[7, 30, 90, 365].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n === 365 ? "1년" : `${n}일`}</button>)}</div>
          <button className="btn ghost small-btn" onClick={() => void load()}>새로고침</button></div></div>
      <section className="chg-cards aud-cards">
        <div className="chg-card"><span>미처리</span><b>{data.summary.open}</b></div>
        <div className="chg-card"><span>사용자 판단</span><b>{data.summary.needs_user}</b></div>
        <div className="chg-card good"><span>해결</span><b>{data.summary.resolved}</b></div>
        {Object.entries(data.summary.by_severity).map(([key, count]) => <div className="chg-card" key={key}><span>{key}</span><b>{count}</b></div>)}
      </section>
      <div className="pcard"><div className="p-head"><h3>판정 목록</h3><span className="muted small">최근 {data.days}일 · {data.rows.length}건</span></div>
        <table className="ptable"><thead><tr><th>시각</th><th>심각도</th><th>판정</th><th>유형</th><th>상품</th><th>영향</th><th>상태</th></tr></thead>
          <tbody>{data.rows.length === 0 && <tr><td colSpan={7} className="empty">오탐·미탐 기록이 없습니다.</td></tr>}
            {data.rows.map((row, i) => <tr key={`${row.at}-${i}`}><td className="mono small">{when(row.at)}</td><td><span className="pill warn">{row.severity_label}</span></td><td>{row.verdict_label}</td><td>{row.pattern_label}</td><td>{row.product_label}</td><td className="small">{row.reason_label}</td><td><span className="pill info">{row.status_label}</span></td></tr>)}</tbody>
        </table>
      </div>
      <p className="foot muted small">판정 원문·경쟁 판매자·상품번호·가격·파일 경로는 공개 API에서 반환하지 않습니다. 공개 화면은 읽기 전용입니다.</p>
    </main>
  );
}
