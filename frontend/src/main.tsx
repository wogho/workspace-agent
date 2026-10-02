import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Accounting from "./Accounting";
import Calculator from "./Calculator";
import Ledger from "./Ledger";
import Mail from "./Mail";
import "./styles.css";

type Tab = "ledger" | "acct" | "calc" | "mail";
const fromHash = () =>
  (location.hash === "#acct"
    ? "acct"
    : location.hash === "#calc"
      ? "calc"
      : location.hash === "#mail"
        ? "mail"
        : "ledger") as Tab;

function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <>
      <nav className="top">
        <div className="brand">오픈게이밍월드 <span>업무 웹</span></div>
        <div className="tabs">
          <button className={tab === "ledger" ? "on" : ""} onClick={() => { setTab("ledger"); history.replaceState(null, "", "#"); }}>상품 장부</button>
          <button className={tab === "acct" ? "on" : ""} onClick={() => { setTab("acct"); history.replaceState(null, "", "#acct"); }}>회계 장부</button>
          <button className={tab === "calc" ? "on" : ""} onClick={() => { setTab("calc"); history.replaceState(null, "", "#calc"); }}>계산기 · 정책</button>
          <button className={tab === "mail" ? "on" : ""} onClick={() => { setTab("mail"); history.replaceState(null, "", "#mail"); }}>보낸 메일</button>
        </div>
        <form method="post" action="/accounts/logout/" className="logout">
          <input type="hidden" name="csrfmiddlewaretoken" value={document.cookie.split("; ").find((c) => c.startsWith("csrftoken="))?.split("=")[1] ?? ""} />
          <button>로그아웃</button>
        </form>
      </nav>
      {tab === "ledger" ? <Ledger /> : tab === "acct" ? <Accounting /> : tab === "mail" ? <Mail /> : <Calculator />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
