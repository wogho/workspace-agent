import { useEffect, useState } from "react";
import { request } from "./api";

type Flow = { trigger: string; team: string; action: string; boundary: string };
type Schedule = { name: string; cadence: string; enabled: boolean; next: string | null };
type LogicResponse = { flows: Flow[]; schedules: Schedule[] };

export default function Logic() {
  const [data, setData] = useState<LogicResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<LogicResponse>("/api/public/logic/").then(setData).catch((e) => setError(String(e)));
  }, []);
  if (!data) return <main className="page"><p className={error ? "error" : "muted"}>{error || "작업 로직을 불러오는 중…"}</p></main>;
  return (
    <main className="page logic">
      <div className="ai-head"><div><h2>작업 로직 · 설정</h2><p className="muted">사건 인계와 예약 주기만 공개합니다. 환경값·자격증명·명령 경로·스킬 본문은 공개하지 않습니다.</p></div></div>
      <div className="stack">
        <div className="pcard"><h3>사건 인계</h3><table className="ptable"><thead><tr><th>시작 조건</th><th>담당</th><th>하는 일</th><th>경계</th></tr></thead>
          <tbody>{data.flows.map((f, i) => <tr key={i}><td>{f.trigger}</td><td>{f.team}</td><td>{f.action}</td><td>{f.boundary}</td></tr>)}</tbody></table></div>
        <div className="pcard"><h3>예약·주기</h3><table className="ptable"><thead><tr><th>업무</th><th>주기</th><th>다음 실행</th><th>상태</th></tr></thead>
          <tbody>{data.schedules.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.cadence}</td><td>{s.next ?? "—"}</td><td>{s.enabled ? <span className="pill good">켜짐</span> : <span className="pill muted">꺼짐</span>}</td></tr>)}</tbody></table></div>
      </div>
    </main>
  );
}
