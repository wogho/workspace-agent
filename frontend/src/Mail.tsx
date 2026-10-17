import { useEffect, useState } from "react";
import { request } from "./api";

type MailRow = {
  id: number;
  sent_at: string;
  recipient_mask: string;
  subject: string;
  order_tail: string;
  key_mask: string;
  status: string;
  status_label: string;
  status_at: string | null;
  opened_at: string | null;
  open_count: number;
  delivered_at: string | null;
  delivery_note: string;
};

type MailDetail = {
  sender_label: string;
  recipient_mask: string;
  subject: string;
  sent_at: string;
  key_mask: string;
  preview: string;
};

const fmt = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const tone: Record<string, string> = {
  relayed: "ok",
  accepted: "wait",
  bounced: "bad",
  suppressed: "bad",
};

export default function Mail() {
  const [rows, setRows] = useState<MailRow[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState<MailDetail | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = () =>
    request<{ rows: MailRow[]; waiting: number }>("/api/mail/").then((data) => {
      setRows(data.rows);
      setWaiting(data.waiting);
    });

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setBusy("refresh");
    setMessage("");
    try {
      const result = await request<{ logs: number; changed: number }>("/api/mail/refresh/", {
        method: "POST",
      });
      setMessage(`전달 기록 ${result.logs}건 확인 · 상태 변경 ${result.changed}건`);
      await load();
    } catch (error) {
      setMessage(`전달 상태를 가져오지 못했습니다: ${String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const view = async (id: number) => {
    setBusy(`view-${id}`);
    setMessage("");
    try {
      setOpen(await request<MailDetail>(`/api/mail/${id}/`, { method: "POST" }));
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="mail">
      <div className="mail-head">
        <div>
          <h2>보낸 메일</h2>
          <p className="sub">
            고객 전달 기록 · 수신자·키는 가림 값으로 표시
            {waiting ? ` · 발송 대기 ${waiting}건` : ""}
          </p>
        </div>
        <button className="btn ghost" onClick={refresh} disabled={busy === "refresh"}>
          {busy === "refresh" ? "확인 중…" : "전달 상태 새로고침"}
        </button>
      </div>
      {message && <p className="note">{message}</p>}
      <div className="mail-list">
        {rows.length === 0 && <p className="empty">아직 보낸 메일이 없습니다.</p>}
        {rows.map((row) => (
          <div key={row.id} className="mail-row" onClick={() => view(row.id)}>
            <span className={`dot ${tone[row.status] ?? "wait"}`} title={row.status_label} />
            <div className="mail-main">
              <div className="mail-top">
                <b>{row.recipient_mask}</b>
                <span className="when">{fmt(row.sent_at)}</span>
              </div>
              <div className="mail-subj">{row.subject}</div>
              <div className="mail-meta">
                주문 …{row.order_tail} · 키 {row.key_mask} · {row.status_label} ·{" "}
                {row.opened_at ? (
                  <b className="opened">
                    수신확인 {fmt(row.opened_at)}
                    {row.open_count > 1 ? ` (${row.open_count}회)` : ""}
                  </b>
                ) : (
                  "미열람"
                )}{" "}
                · {row.delivered_at ? `전달 처리 ${fmt(row.delivered_at)}` : row.delivery_note || "전달 처리 전"}
              </div>
            </div>
            <button
              className="btn ghost small"
              disabled={busy === `view-${row.id}`}
              onClick={(event) => {
                event.stopPropagation();
                void view(row.id);
              }}
            >
              {busy === `view-${row.id}` ? "…" : "메일 보기"}
            </button>
          </div>
        ))}
      </div>
      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <div className="modal mail-view" onClick={(event) => event.stopPropagation()}>
            <div className="mail-view-head">
              <h3>{open.subject}</h3>
              <button className="btn ghost small" onClick={() => setOpen(null)}>
                닫기
              </button>
            </div>
            <dl>
              <dt>보낸 주체</dt>
              <dd>{open.sender_label}</dd>
              <dt>받는 대상</dt>
              <dd>{open.recipient_mask}</dd>
              <dt>보낸 시각</dt>
              <dd>{fmt(open.sent_at)}</dd>
              <dt>키 표시</dt>
              <dd className="key">{open.key_mask}</dd>
            </dl>
            <pre className="mail-body">{open.preview}</pre>
            <p className="sub">
              공개 화면은 원문과 외부 메시지 식별자 대신 가림 값과 미리보기만 표시합니다.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
