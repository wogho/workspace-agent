import { useEffect, useState } from "react";
import { request, won } from "./api";

type OrderRow = {
  order_tail: string;
  product_label: string;
  paid_at: string | null;
  payment: number | null;
  status: string;
  status_label: string;
  claim_label: string;
  purchase_label: string;
  delivery_label: string;
};
type OrderResponse = { rows: OrderRow[]; statuses: Record<string, string> };

const date = (v: string | null) => v ? new Date(v).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Orders() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await request<OrderResponse>(`/api/public/orders/?${new URLSearchParams({ q: query, status })}`);
      setRows(data.rows);
      setStatuses(data.statuses);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { void load(); }, [status]);

  return (
    <main className="page orders">
      <div className="lp-head">
        <div className="lp-title"><h1>주문 현황</h1><span className="muted">비식별 주문 흐름·구매·전달 상태</span></div>
        <button className="btn ghost" onClick={() => void load()}>새로고침</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="o-search">
        <input placeholder="상품주문번호 끝자리·상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>주문</th><th>상품</th><th>결제</th><th className="r">금액</th><th>구매</th><th>전달</th><th>클레임</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="empty">주문이 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={r.order_tail}>
                <td><b>…{r.order_tail}</b><div className="muted small">{date(r.paid_at)}</div></td>
                <td>{r.product_label}</td><td><span className={`st ${r.status}`}>{r.status_label}</span></td>
                <td className="r">{won(r.payment)}</td><td>{r.purchase_label || "—"}</td><td>{r.delivery_label || "—"}</td><td>{r.claim_label || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot muted small">공개 계약은 주문 식별자·고객정보·외부 채널 식별자·키 원문을 반환하지 않습니다. 처리 버튼과 원본 응답은 운영 화면에서만 제공합니다.</p>
    </main>
  );
}
