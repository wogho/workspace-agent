import { useEffect, useState } from "react";
import { request, when } from "./api";

type ChangeRow = { at: string; kind_label: string; product_label: string; detail: string; owner_label: string; ok: boolean };
type ChangesResponse = { days: number; counts: Record<string, number>; failed: number; rows: ChangeRow[] };

export default function Changes() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setData(await request<ChangesResponse>(`/api/public/changes/?days=${days}`));
      setError("");
    } catch (e) { setError(String(e)); }
  };
  useEffect(() => { void load(); }, [days]);
  if (!data) return <main className="page"><p className={error ? "error" : "muted"}>{error || "상품 변동을 불러오는 중…"}</p></main>;
  return (
    <main className="page chg">
      <div className="lp-head"><div className="lp-title"><h1>상품 변동</h1><span className="muted">스토어 반영·장부 결정의 비민감 기록</span></div>
        <div className="chg-tools"><div className="seg">{[1, 3, 7, 30].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n === 1 ? "오늘·어제" : `${n}일`}</button>)}</div>
          <button className="btn ghost small-btn" onClick={() => void load()}>새로고침</button></div></div>
      <section className="chg-cards">
        {Object.entries(data.counts).map(([kind, count]) => <div className="chg-card" key={kind}><span>{kind}</span><b>{count.toLocaleString("ko-KR")}</b></div>)}
        <div className={`chg-card ${data.failed ? "bad" : "zero"}`}><span>실패</span><b>{data.failed}</b></div>
      </section>
      <div className="pcard"><div className="p-head"><h3>변동 기록</h3><span className="muted small">최근 {data.days}일 · {data.rows.length}건</span></div>
        <table className="ptable"><thead><tr><th>시각</th><th>종류</th><th>상품</th><th>변경 내용</th><th>담당</th><th>결과</th></tr></thead>
          <tbody>{data.rows.length === 0 && <tr><td colSpan={6} className="empty">변동 기록이 없습니다.</td></tr>}
            {data.rows.map((row, i) => <tr key={`${row.at}-${i}`}><td className="mono small">{when(row.at)}</td><td><span className="pill info">{row.kind_label}</span></td><td>{row.product_label}</td><td className="small">{row.detail || "—"}</td><td>{row.owner_label}</td><td><span className={`pill ${row.ok ? "good" : "bad"}`}>{row.ok ? "완료" : "실패"}</span></td></tr>)}</tbody>
        </table>
      </div>
      <p className="foot muted small">상품명·상품번호·판매 채널 URL·실제 가격은 공개 API에서 반환하지 않습니다.</p>
    </main>
  );
}
