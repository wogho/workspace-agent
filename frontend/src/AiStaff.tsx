import { useEffect, useState } from "react";
import { request } from "./api";

type Employee = { id: string; display_name: string; role: string; team: string; model_label: string; state: string; jobs: number; failed: number };
type AiResponse = { employees: Employee[]; model_counts: Record<string, number> };

export default function AiStaff() {
  const [data, setData] = useState<AiResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    request<AiResponse>("/api/public/ai/").then(setData).catch((e) => setError(String(e)));
  }, []);

  if (!data) return <main className="page"><p className={error ? "error" : "muted"}>{error || "AI 사원 정보를 불러오는 중…"}</p></main>;
  return (
    <main className="page ai">
      <div className="ai-head"><div><h2>AI 사원 · 모델</h2><p className="muted">역할·팀·모델 적용 상태만 표시합니다. 계정·작업공간·스킬 본문은 공개 API에 포함하지 않습니다.</p></div></div>
      <div className="usage">{Object.entries(data.model_counts).map(([model, count]) => <span key={model} className="pill info">{model} · {count}명</span>)}</div>
      <div className="pcard">
        <table className="ptable ai-table">
          <thead><tr><th>사원</th><th>팀</th><th>역할</th><th>모델</th><th>상태</th><th>작업</th></tr></thead>
          <tbody>{data.employees.map((e) => (
            <tr key={e.id}><td><b>{e.display_name}</b><div className="muted small">{e.id}</div></td><td>{e.team}</td><td>{e.role}</td>
              <td>{e.model_label}</td><td><span className={`pill ${e.state === "working" ? "info" : "muted"}`}>{e.state}</span></td>
              <td>{e.jobs}건{e.failed ? <span className="bad-t"> · 실패 {e.failed}</span> : ""}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </main>
  );
}
