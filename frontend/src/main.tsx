import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Accounting from "./Accounting";
import AiStaff from "./AiStaff";
import Calculator from "./Calculator";
import Dashboard from "./Dashboard";
import Ledger from "./Ledger";
import Logic from "./Logic";
import Mail from "./Mail";
import Orders from "./Orders";
import "./styles.css";

const MENU = [
  ["dash", "통합 관제"], ["orders", "주문 현황"], ["ledger", "상품 장부"], ["mail", "보낸 메일"],
  ["acct", "회계 장부"], ["calc", "계산기 · 정책"], ["ai", "AI 사원 · 모델"], ["logic", "작업 로직 · 설정"],
] as const;
type Tab = (typeof MENU)[number][0];
const fromHash = (): Tab => {
  const hash = location.hash.replace(/^#/, "").split("/")[0];
  return (MENU.find(([key]) => key === hash)?.[0] ?? "dash") as Tab;
};

function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (key: Tab) => { setTab(key); history.replaceState(null, "", `#${key}`); };
  return (
    <>
      <nav className="top">
        <div className="brand">오픈게이밍월드 <span>업무 웹</span></div>
        <div className="tabs">
          {MENU.map(([key, label]) => <button key={key} className={tab === key ? "on" : ""} onClick={() => go(key)}>{label}</button>)}
        </div>
        <form method="post" action="/accounts/logout/" className="logout">
          <input type="hidden" name="csrfmiddlewaretoken" value={document.cookie.split("; ").find((c) => c.startsWith("csrftoken="))?.split("=")[1] ?? ""} />
          <button>로그아웃</button>
        </form>
      </nav>
      {tab === "dash" ? <Dashboard /> : tab === "orders" ? <Orders /> : tab === "ledger" ? <Ledger /> : tab === "mail" ? <Mail />
        : tab === "acct" ? <Accounting /> : tab === "calc" ? <Calculator /> : tab === "ai" ? <AiStaff /> : <Logic />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
