import { useEffect, useMemo, useRef, useState } from "react";
import { api, Calc, day, Detail, Row, STORE_STATUS, Summary, when, won } from "./api";

/* ───────── 분류·표시 이름 ───────── */

const STATUS: { key: string; label: string; tone: string; hint: string }[] = [
  { key: "REUSE_READY", label: "판매 가능", tone: "good", hint: "스토어 상품 · 순이익 하한 이상" },
  { key: "REWRITE_REQUIRED", label: "판매 가능·수정 필요", tone: "good", hint: "상품명 등 수정 뒤 판매" },
  { key: "NEW_LISTING", label: "등록 후보", tone: "info", hint: "스토어에 없음 · 등록하면 수익" },
  { key: "USER_WAIT", label: "사용자 대기", tone: "info", hint: "가격·매입을 사용자가 정함" },
  { key: "HOLD_MARGIN", label: "마진 보류", tone: "warn", hint: "순이익 하한 미만 · 재고 0" },
  { key: "HOLD_IDENTITY_OR_DATA", label: "매입처 품절·확인 필요", tone: "bad", hint: "재입고·자료 대기" },
  { key: "DELETE_CANDIDATE", label: "삭제 후보", tone: "muted", hint: "사용자 승인 뒤 삭제" },
  { key: "UNJUDGED", label: "미판정", tone: "muted", hint: "관측 대기" },
];
const STATUS_OF = Object.fromEntries(STATUS.map((s) => [s.key, s]));

const PLATFORM: Record<string, string> = {
  STEAM: "Steam", EA_APP: "EA", EA: "EA", "EA App": "EA", UBISOFT_CONNECT: "Ubisoft", UBISOFT: "Ubisoft", GOG: "GOG", MYTRAINZ: "MyTrainz",
};
const KIND: Record<string, string> = { BASE_GAME: "본편", BASE: "본편", DLC: "DLC", EDITION: "에디션", BUNDLE: "번들" };
const platformOf = (r: Row) => PLATFORM[r.platform] ?? (r.platform || "미확인");
const kindOf = (r: Row) => KIND[r.product_type] ?? (r.product_type || "미확인");
const vendorOf = (r: Row) => (r.vendor ? "매입처" : "없음");
const storeOf = (r: Row) => (r.in_store ? STORE_STATUS[r.store_status] ?? r.store_status : "미등록");
const stockBucket = (r: Row) => (!r.in_store ? "미등록" : r.store_stock == null ? "모름" : r.store_stock === 0 ? "0" : r.store_stock >= 10 ? "10 이상" : "1~9");
const krOf = (r: Row) => (r.kr_activation === "OK" ? "가능" : r.kr_activation === "CANNOT_ACTIVATE_KR" ? "불가" : "모름");
const vendorStockOf = (r: Row) => (r.availability === "IN_STOCK" ? "재고 있음" : r.availability === "SOLD_OUT" ? "품절" : "모름");
const compOf = (r: Row) => (r.competitor_lowest != null ? "있음" : r.second_pass === "NO_COMPETITOR" ? "없음" : "미확인");
const decisionOf = (r: Row) => (!r.decision ? "없음" : r.decision.action === "choose_price" ? "가격 정함" : r.decision.label);
const zeroOf = (r: Row) => (r.zero_days == null ? "해당 없음" : r.zero_days >= 31 ? "31일 이상" : r.zero_days >= 7 ? "7~30일" : "7일 미만");
const checkedOf = (r: Row) => {
  if (!r.last_checked_at) return "확인 없음";
  const h = (Date.now() - new Date(r.last_checked_at).getTime()) / 36e5;
  return h <= 24 ? "24시간 이내" : h <= 24 * 7 ? "7일 이내" : "7일 넘음";
};
const listPrice = (r: Row) => r.calc?.list_price_krw ?? null;
const profit = (r: Row) => r.calc?.profit_krw ?? null;
const buyRate = (r: Row) => (r.vendor_price != null && r.steam_initial ? r.vendor_price / r.steam_initial : null);
const profitRate = (r: Row) => (r.calc && r.calc.exposed_price_krw ? r.calc.profit_krw / r.calc.exposed_price_krw : null);
const englishName = (r: Row) => r.game || (r.name.match(/[A-Za-z][A-Za-z0-9 :'&.\-]+/)?.[0] ?? "");
const metaOf = (r: Row) => [platformOf(r), kindOf(r), r.edition].filter((x) => x && x !== "미확인" && x !== "Standard").join(" · ");

/* 속성 필터(여러 개 고르기) — 목록 순서가 화면 순서. 상태는 위 탭으로 고른다 */
type Facet = { key: string; label: string; get: (r: Row) => string; order?: string[] };
const FACETS: Facet[] = [
  { key: "status", label: "상태", get: (r) => r.migration, order: STATUS.map((s) => s.key) },
  { key: "store", label: "스토어 상태", get: storeOf, order: ["판매중", "판매중지", "품절", "판매대기", "미등록"] },
  { key: "stock", label: "스토어 재고", get: stockBucket, order: ["0", "1~9", "10 이상", "모름", "미등록"] },
  { key: "vendor", label: "매입처", get: vendorOf },
  { key: "vstock", label: "매입처 재고", get: vendorStockOf, order: ["재고 있음", "품절", "모름"] },
  { key: "kr", label: "한국 활성화", get: krOf, order: ["가능", "불가", "모름"] },
  { key: "platform", label: "플랫폼", get: platformOf },
  { key: "kind", label: "상품 종류", get: kindOf, order: ["본편", "DLC", "에디션", "번들", "미확인"] },
  { key: "comp", label: "네이버 경쟁", get: compOf, order: ["있음", "없음", "미확인"] },
  { key: "decision", label: "결정", get: decisionOf },
  { key: "zero", label: "재고 0 경과", get: zeroOf, order: ["7일 미만", "7~30일", "31일 이상", "해당 없음"] },
  { key: "checked", label: "최종 확인", get: checkedOf, order: ["24시간 이내", "7일 이내", "7일 넘음", "확인 없음"] },
];
const facetText = (key: string, v: string) => (key === "status" ? STATUS_OF[v]?.label ?? v : v);

/* 범위 필터 */
type Range = { key: string; label: string; get: (r: Row) => number | null; unit: string; scale?: number };
const RANGES: Range[] = [
  { key: "profit", label: "예상 순이익", get: profit, unit: "원" },
  { key: "vprice", label: "매입가", get: (r) => r.vendor_price, unit: "원" },
  { key: "lprice", label: "등록가", get: listPrice, unit: "원" },
  { key: "brate", label: "매입가율(Steam 정가 대비)", get: buyRate, unit: "%", scale: 100 },
];

/* 표 열 — sort: 정렬 값(문자면 가나다/ABC, 숫자면 크기) */
type Col = { key: string; label: string; r?: boolean; sort: (r: Row) => string | number | null; cell: (r: Row) => React.ReactNode; on: boolean };
const COLUMNS: Col[] = [
  { key: "name", label: "상품", sort: (r) => r.name, on: true,
    cell: (r) => (
      <div className="pname">
        <span className="t" title={r.name}>{r.name}</span>
        <small>{r.channel_product_no ? <Ext href={r.store_url} mono quiet>{r.channel_product_no}</Ext> : "미등록"}{metaOf(r) && <> · {metaOf(r)}</>}</small>
      </div>) },
  { key: "no", label: "상품번호", sort: (r) => (r.channel_product_no ? Number(r.channel_product_no) : null), on: false,
    cell: (r) => (r.channel_product_no ? <Ext href={r.store_url} mono>{r.channel_product_no}</Ext> : <span className="muted">—</span>) },
  { key: "en", label: "영문명", sort: englishName, on: false, cell: (r) => <span className="small">{englishName(r) || "—"}</span> },
  { key: "status", label: "상태", sort: (r) => STATUS.findIndex((s) => s.key === r.migration), on: true,
    cell: (r) => <Status k={r.migration} fallback={r.migration_label} title={r.reasons[0]} /> },
  { key: "store", label: "스토어", sort: storeOf, on: true,
    cell: (r) => (
      <div className="two">
        <span className={`st ${r.in_store ? r.store_status : "NONE"}`}>{storeOf(r)}</span>
        {r.in_store && <small>재고 {r.store_stock ?? "—"}/{r.base_stock}{r.zero_stage !== null && <b className="zero" title={`재고 0 확인 ${day(r.stock_zero_since)}`}> · 0재고 {r.zero_stage}일째</b>}</small>}
      </div>) },
  { key: "stock", label: "재고", r: true, sort: (r) => (r.in_store ? r.store_stock : null), on: false,
    cell: (r) => (r.in_store ? <>{r.store_stock ?? "—"}<span className="muted">/{r.base_stock}</span></> : <span className="muted">—</span>) },
  { key: "vendor", label: "매입처", sort: vendorOf, on: true,
    cell: (r) => <div className="two"><span>{vendorOf(r)}</span><small><VendorState r={r} /></small></div> },
  { key: "vstock", label: "매입처 재고", sort: vendorStockOf, on: false, cell: (r) => <VendorState r={r} /> },
  { key: "vprice", label: "매입가", r: true, sort: (r) => r.vendor_price, on: true, cell: (r) => won(r.vendor_price) },
  { key: "steam", label: "Steam 정가", r: true, sort: (r) => r.steam_initial, on: true,
    cell: (r) => (r.steam_url ? <Ext href={r.steam_url} quiet>{won(r.steam_initial)}</Ext> : won(r.steam_initial)) },
  { key: "brate", label: "매입가율", r: true, sort: buyRate, on: false,
    cell: (r) => { const v = buyRate(r); return v == null ? "—" : `${Math.round(v * 100)}%`; } },
  { key: "comp", label: "경쟁 최저가", r: true, sort: (r) => r.competitor_lowest, on: true,
    cell: (r) => (r.competitor_lowest != null ? won(r.competitor_lowest) : r.second_pass === "NO_COMPETITOR" ? <span className="muted">경쟁 없음</span> : <span className="muted">—</span>) },
  { key: "lprice", label: "등록가", r: true, sort: listPrice, on: true,
    cell: (r) => (r.calc ? <div className="two r"><span>{won(r.calc.list_price_krw)}</span><small>노출 {won(r.calc.exposed_price_krw)}</small></div> : <span className="muted">—</span>) },
  { key: "profit", label: "예상 순이익", r: true, sort: profit, on: true,
    cell: (r) => (r.calc ? <b className={r.calc.pass ? "good-t" : "bad-t"}>{won(r.calc.profit_krw)}</b> : <span className="muted">—</span>) },
  { key: "prate", label: "순이익률", r: true, sort: profitRate, on: false,
    cell: (r) => { const v = profitRate(r); return v == null ? "—" : `${(v * 100).toFixed(1)}%`; } },
  { key: "sprice", label: "현재 판매가", r: true, sort: (r) => r.store_price, on: false, cell: (r) => won(r.store_price) },
  { key: "decision", label: "결정", sort: decisionOf, on: false, cell: (r) => (r.decision ? <span className="pill done">{decisionOf(r)}</span> : <span className="muted">—</span>) },
  { key: "zero", label: "재고 0 경과", r: true, sort: (r) => r.zero_days, on: false, cell: (r) => (r.zero_days == null ? "—" : `${r.zero_days}일`) },
  { key: "checked", label: "최종 확인", sort: (r) => (r.last_checked_at ? new Date(r.last_checked_at).getTime() : null), on: false,
    cell: (r) => <span className="muted">{when(r.last_checked_at)}</span> },
];

const SORT_PRESETS: { label: string; col: string; dir: 1 | -1 }[] = [
  { label: "상태순", col: "status", dir: 1 },
  { label: "상품명 가나다순", col: "name", dir: 1 },
  { label: "상품명 역순", col: "name", dir: -1 },
  { label: "영문명 ABC순", col: "en", dir: 1 },
  { label: "예상 순이익 높은 순", col: "profit", dir: -1 },
  { label: "예상 순이익 낮은 순", col: "profit", dir: 1 },
  { label: "매입가율 낮은 순", col: "brate", dir: 1 },
  { label: "매입가 낮은 순", col: "vprice", dir: 1 },
  { label: "등록가 높은 순", col: "lprice", dir: -1 },
  { label: "최근 확인 순", col: "checked", dir: -1 },
  { label: "상품번호 순", col: "no", dir: 1 },
];

/* ───────── 작은 부품 ───────── */

function Ext({ href, children, mono, quiet }: { href: string; children: React.ReactNode; mono?: boolean; quiet?: boolean }) {
  if (!href) return <span className="muted">{children}</span>;
  return <a className={[mono && "mono", quiet && "quiet"].filter(Boolean).join(" ") || undefined} href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{children}</a>;
}

function Status({ k, fallback, title }: { k: string; fallback?: string; title?: string }) {
  const s = STATUS_OF[k];
  return <span className={`status ${s?.tone ?? ""}`} title={title}><i />{s?.label ?? fallback ?? k}</span>;
}

function VendorState({ r }: { r: Row }) {
  if (r.kr_activation === "CANNOT_ACTIVATE_KR") return <span className="dot bad">한국 불가</span>;
  if (r.availability === "SOLD_OUT") return <span className="dot warn">품절</span>;
  if (r.availability === "IN_STOCK") return <span className="dot good">재고 있음</span>;
  return <span className="muted">확인 전</span>;
}

/* 바깥을 누르면 닫히는 작은 창 */
function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } };

type Filters = { q: string; sel: Record<string, string[]>; range: Record<string, [string, string]> };
const EMPTY: Filters = { q: "", sel: {}, range: {} };

function matches(r: Row, f: Filters, skipFacet?: string) {
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    const hay = [r.name, r.game, r.channel_product_no, r.origin_product_no, r.vendor, r.steam_appid, r.edition].join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  for (const fc of FACETS) {
    if (fc.key === skipFacet) continue;
    const pick = f.sel[fc.key];
    if (pick?.length && !pick.includes(fc.get(r))) return false;
  }
  for (const rg of RANGES) {
    const [lo, hi] = f.range[rg.key] ?? ["", ""];
    if (lo === "" && hi === "") continue;
    const raw = rg.get(r);
    if (raw == null) return false;
    const v = raw * (rg.scale ?? 1);
    if (lo !== "" && v < Number(lo)) return false;
    if (hi !== "" && v > Number(hi)) return false;
  }
  return true;
}

function compare(a: string | number | null, b: string | number | null, dir: 1 | -1) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // 빈 값은 항상 뒤
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b), "ko", { numeric: true, sensitivity: "base" }) * dir;
}

function toCsv(rows: Row[], cols: Col[]) {
  const text = (r: Row, c: Col) => {
    const v = c.sort(r);
    if (c.key === "brate" || c.key === "prate") return v == null ? "" : ((v as number) * 100).toFixed(1);
    if (c.key === "checked") return r.last_checked_at ?? "";
    if (c.key === "status") return STATUS_OF[r.migration]?.label ?? r.migration_label;
    return v == null ? "" : String(v);
  };
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const out = cols.some((c) => c.key === "name") ? [COLUMNS.find((c) => c.key === "no")!, ...cols] : cols;
  return "﻿" + [out.map((c) => c.label), ...rows.map((r) => out.map((c) => text(r, c)))].map((l) => l.map(esc).join(",")).join("\n");
}

/* ───────── 화면 ───────── */

export default function Ledger() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [f, setF] = useState<Filters>(() => load("ledger.filters", EMPTY));
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>(() => load("ledger.sort", { col: "status", dir: 1 as 1 | -1 }));
  const [shown, setShown] = useState<string[]>(() => load("ledger.cols.v2", COLUMNS.filter((c) => c.on).map((c) => c.key)));
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [colMenu, setColMenu] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const colRef = useOutside<HTMLDivElement>(colMenu, () => setColMenu(false));

  useEffect(() => save("ledger.filters", f), [f]);
  useEffect(() => save("ledger.sort", sort), [sort]);
  useEffect(() => save("ledger.cols.v2", shown), [shown]);

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, r] = await Promise.all([api.summary(), api.products({})]);
      setSummary(s);
      setRows(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const refresh = async (store: boolean) => {
    setLoading(true);
    try {
      setLog((await api.refresh(store)).log.slice(-2).join(" · "));
      await fetchAll();
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };

  const cols = COLUMNS.filter((c) => shown.includes(c.key));
  const view = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.col) ?? COLUMNS[0];
    return rows.filter((r) => matches(r, f)).sort((a, b) => compare(col.sort(a), col.sort(b), sort.dir) || compare(a.name, b.name, 1));
  }, [rows, f, sort]);

  /* 상태 탭 개수: 상태 말고 다른 조건은 반영 */
  const statusCount = useMemo(() => {
    const out: Record<string, number> = { ALL: 0 };
    for (const r of rows) if (matches(r, f, "status")) { out[r.migration] = (out[r.migration] ?? 0) + 1; out.ALL++; }
    return out;
  }, [rows, f]);
  const hasStatus = (k: string) => rows.some((r) => r.migration === k);

  const toggle = (facet: string, value: string) => setF((p) => {
    const cur = p.sel[facet] ?? [];
    return { ...p, sel: { ...p.sel, [facet]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } };
  });
  const setStatus = (key: string | null) => setF((p) => ({ ...p, sel: { ...p.sel, status: key ? [key] : [] } }));
  const statusSel = f.sel.status ?? [];
  const clickHeader = (key: string) => setSort((s) => (s.col === key ? { col: key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { col: key, dir: 1 }));
  /* 탭으로 고른 상태 하나는 칩으로 다시 보여 주지 않는다 */
  const chips = [
    ...FACETS.flatMap((fc) => (f.sel[fc.key] ?? [])
      .filter(() => !(fc.key === "status" && statusSel.length === 1))
      .map((v) => ({ k: `${fc.key}:${v}`, text: `${fc.label}: ${facetText(fc.key, v)}`, clear: () => toggle(fc.key, v) }))),
    ...RANGES.flatMap((rg) => {
      const [lo, hi] = f.range[rg.key] ?? ["", ""];
      return lo === "" && hi === "" ? [] : [{ k: rg.key, text: `${rg.label}: ${lo || "…"} ~ ${hi || "…"}${rg.unit}`, clear: () => setF((p) => ({ ...p, range: { ...p.range, [rg.key]: ["", ""] } })) }];
    }),
  ];
  const filterCount = chips.length;
  const anyFilter = filterCount > 0 || statusSel.length > 0 || f.q.trim() !== "";

  const exportCsv = () => {
    const blob = new Blob([toCsv(view, cols)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `상품장부-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="ledger-page">
      <header className="lp-head">
        <div className="lp-title">
          <h1>상품 장부</h1>
          <span className="muted">
            {summary ? <>상품 {summary.products} · 스토어 {summary.in_store} · 판매 하한 {won(summary.min_profit_krw)} · {summary.policy_version}</> : "불러오는 중…"}
          </span>
        </div>
        <div className="lp-actions">
          {log && <span className="muted small log" title={log}>{log}</span>}
          <button className="btn ghost" disabled={loading} onClick={() => refresh(false)} title="영업 관측 기록을 다시 가져옵니다">관측 가져오기</button>
          <button className="btn ghost" disabled={loading} onClick={() => refresh(true)} title="커머스 API로 스토어 상태·재고·가격을 다시 읽습니다">스토어 동기화</button>
        </div>
      </header>

      <nav className="status-tabs" aria-label="상태">
        <button className={statusSel.length === 0 ? "on" : ""} onClick={() => setStatus(null)}>전체<em>{statusCount.ALL}</em></button>
        {STATUS.filter((s) => hasStatus(s.key)).map((s) => (
          <button key={s.key} className={`${s.tone} ${statusSel.length === 1 && statusSel[0] === s.key ? "on" : ""}`} onClick={() => setStatus(s.key)} title={s.hint}>
            <i />{s.label}<em>{statusCount[s.key] ?? 0}</em>
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <div className="searchbox">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3a5.5 5.5 0 1 0 3.4 9.8l3.6 3.7 1.1-1.1-3.7-3.6A5.5 5.5 0 0 0 8.5 3Zm0 1.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z" /></svg>
          <input value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="상품명·영문명·상품번호·AppID 검색" />
          {f.q && <button className="clear" onClick={() => setF((p) => ({ ...p, q: "" }))} aria-label="검색 지우기">×</button>}
        </div>
        <button className={`btn ghost filter-btn ${filterCount ? "has" : ""}`} onClick={() => setFiltersOpen(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14v1.6H3zm3 4.2h8v1.6H6zm2.5 4.2h3V15h-3z" /></svg>필터{filterCount > 0 && <em>{filterCount}</em>}
        </button>
        <div className="chips">
          {chips.map((a) => <button key={a.k} className="chip" onClick={a.clear} title="이 조건 빼기">{a.text}<span>×</span></button>)}
          {anyFilter && <button className="linkish" onClick={() => setF(EMPTY)}>초기화</button>}
        </div>
        <div className="tool-right">
          <span className="count"><b>{view.length}</b> / {rows.length}개</span>
          <label className="sortsel">
            <span>정렬</span>
            <select value={`${sort.col}:${sort.dir}`} onChange={(e) => { const [col, dir] = e.target.value.split(":"); setSort({ col, dir: Number(dir) as 1 | -1 }); }}>
              {!SORT_PRESETS.some((p) => p.col === sort.col && p.dir === sort.dir) &&
                <option value={`${sort.col}:${sort.dir}`}>{COLUMNS.find((c) => c.key === sort.col)?.label} {sort.dir === 1 ? "오름차순" : "내림차순"}</option>}
              {SORT_PRESETS.map((p) => <option key={p.label} value={`${p.col}:${p.dir}`}>{p.label}</option>)}
            </select>
          </label>
          <div className="colmenu" ref={colRef}>
            <button className="btn ghost" onClick={() => setColMenu((v) => !v)} aria-expanded={colMenu}>열</button>
            {colMenu && (
              <div className="menu">
                <div className="menu-head">보이는 열</div>
                {COLUMNS.map((c) => (
                  <label key={c.key}><input type="checkbox" checked={shown.includes(c.key)} disabled={c.key === "name"}
                    onChange={() => setShown((s) => (s.includes(c.key) ? s.filter((k) => k !== c.key) : COLUMNS.map((x) => x.key).filter((k) => s.includes(k) || k === c.key)))} /> {c.label}</label>
                ))}
                <button className="linkish" onClick={() => setShown(COLUMNS.filter((c) => c.on).map((c) => c.key))}>기본 열로</button>
              </div>
            )}
          </div>
          <button className="btn ghost" onClick={exportCsv} disabled={!view.length} title="지금 보이는 목록을 CSV로 받기">CSV</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`${c.r ? "r" : ""} c-${c.key} ${sort.col === c.key ? "sorted" : ""}`} onClick={() => clickHeader(c.key)}
                  aria-sort={sort.col === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  {c.label}<span className="arrow">{sort.col === c.key ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={selected === r.id ? "sel" : ""} onClick={() => setSelected(r.id)}>
                {cols.map((c) => <td key={c.key} className={`${c.r ? "r" : ""} c-${c.key}`}>{c.cell(r)}</td>)}
              </tr>
            ))}
            {!view.length && !loading && <tr><td colSpan={cols.length} className="empty">조건에 맞는 상품이 없습니다. <button className="linkish" onClick={() => setF(EMPTY)}>조건 초기화</button></td></tr>}
            {!rows.length && loading && <tr><td colSpan={cols.length} className="empty">불러오는 중…</td></tr>}
          </tbody>
        </table>
      </div>

      <ul className="cards">
        {view.map((r) => (
          <li key={r.id} className={selected === r.id ? "sel" : ""} onClick={() => setSelected(r.id)}>
            <div className="c-top"><Status k={r.migration} fallback={r.migration_label} /><span className={`st ${r.in_store ? r.store_status : "NONE"}`}>{storeOf(r)}{r.in_store && ` · 재고 ${r.store_stock ?? "—"}/${r.base_stock}`}</span></div>
            <div className="c-name">{r.name}</div>
            <div className="c-meta">{r.channel_product_no || "미등록"}{metaOf(r) && ` · ${metaOf(r)}`} · {vendorOf(r)} <VendorState r={r} /></div>
            <dl className="c-nums">
              <div><dt>매입가</dt><dd>{won(r.vendor_price)}</dd></div>
              <div><dt>경쟁 최저가</dt><dd>{r.competitor_lowest != null ? won(r.competitor_lowest) : r.second_pass === "NO_COMPETITOR" ? "없음" : "—"}</dd></div>
              <div><dt>등록가</dt><dd>{won(r.calc?.list_price_krw)}</dd></div>
              <div><dt>순이익</dt><dd className={r.calc ? (r.calc.pass ? "good-t" : "bad-t") : ""}>{won(r.calc?.profit_krw)}</dd></div>
            </dl>
          </li>
        ))}
        {!view.length && !loading && <li className="empty">조건에 맞는 상품이 없습니다.</li>}
      </ul>

      {filtersOpen && <FilterDrawer rows={rows} f={f} setF={setF} toggle={toggle} total={view.length} onClose={() => setFiltersOpen(false)} />}
      {selected !== null && <DetailPanel id={selected} onClose={() => setSelected(null)} onDecided={fetchAll} />}
    </div>
  );
}

/* ───────── 필터 창(기본은 닫힘) ───────── */

function FilterDrawer({ rows, f, setF, toggle, total, onClose }: {
  rows: Row[]; f: Filters; setF: React.Dispatch<React.SetStateAction<Filters>>; toggle: (facet: string, v: string) => void; total: number; onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="필터">
        <header>
          <h2>필터</h2>
          <button className="linkish" onClick={() => setF((p) => ({ ...p, sel: {}, range: {} }))}>모두 해제</button>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="drawer-body">
          {FACETS.map((fc) => {
            const counts: Record<string, number> = {};
            for (const r of rows) counts[fc.get(r)] = 0;
            for (const r of rows) if (matches(r, f, fc.key)) counts[fc.get(r)]++;
            const values = Object.keys(counts).sort((a, b) => {
              const o = fc.order ?? [];
              const ia = o.indexOf(a), ib = o.indexOf(b);
              if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
              return counts[b] - counts[a] || a.localeCompare(b, "ko");
            });
            const pick = f.sel[fc.key] ?? [];
            return (
              <section key={fc.key} className="fgroup">
                <div className="fgroup-head">
                  <h3>{fc.label}</h3>
                  {pick.length > 0 && <button className="linkish" onClick={() => setF((p) => ({ ...p, sel: { ...p.sel, [fc.key]: [] } }))}>해제</button>}
                </div>
                <div className="fchips">
                  {values.map((v) => (
                    <button key={v} className={`fchip ${pick.includes(v) ? "on" : ""}`} disabled={counts[v] === 0 && !pick.includes(v)}
                      onClick={() => toggle(fc.key, v)} aria-pressed={pick.includes(v)}>
                      {facetText(fc.key, v)}<em>{counts[v]}</em>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          <section className="fgroup">
            <div className="fgroup-head"><h3>금액·비율 범위</h3></div>
            {RANGES.map((rg) => {
              const [lo, hi] = f.range[rg.key] ?? ["", ""];
              const set = (i: 0 | 1, v: string) => setF((p) => {
                const cur: [string, string] = [...(p.range[rg.key] ?? ["", ""])] as [string, string];
                cur[i] = v.replace(/[^0-9.\-]/g, "");
                return { ...p, range: { ...p.range, [rg.key]: cur } };
              });
              return (
                <div key={rg.key} className="range">
                  <span>{rg.label}</span>
                  <div><input value={lo} onChange={(e) => set(0, e.target.value)} placeholder="최소" inputMode="numeric" /><i>~</i>
                    <input value={hi} onChange={(e) => set(1, e.target.value)} placeholder="최대" inputMode="numeric" /><small>{rg.unit}</small></div>
                </div>
              );
            })}
          </section>
        </div>
        <footer><button className="btn wide" onClick={onClose}>{total}개 상품 보기</button></footer>
      </aside>
    </>
  );
}

/* ───────── 상세 ───────── */

const ACTIONS: { action: string; label: string }[] = [
  { action: "approve", label: "제안 승인" },
  { action: "hold", label: "보류" },
  { action: "stock_ten", label: "재고 10" },
  { action: "stock_zero", label: "재고 0" },
  { action: "rename", label: "상품명 수정 후보" },
  { action: "delete_candidate", label: "삭제 후보" },
];

function DetailPanel({ id, onClose, onDecided }: { id: number; onClose: () => void; onDecided: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reload = () => api.product(id).then(setD);
  useEffect(() => { setD(null); reload(); }, [id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const decide = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setErr("");
    try {
      await api.decide(id, action, memo, extra);
      setMemo("");
      await reload();
      onDecided();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  const st = d ? STATUS_OF[d.migration] : undefined;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label="상품 상세">
        <header>
          <div>
            <div className="muted small">{d?.channel_product_no ? `상품번호 ${d.channel_product_no}` : "스토어 미등록"}{d?.origin_product_no && ` · 원상품번호 ${d.origin_product_no}`}</div>
            <h2>{d?.name ?? "불러오는 중…"}</h2>
            {d && <div className="badges">
              <Status k={d.migration} fallback={d.migration_label} />
              <span className={`st ${d.store_status}`}>{storeOf(d)}</span>
              <span className="muted small">{[platformOf(d), kindOf(d), d.edition].filter((x) => x && x !== "미확인").join(" · ")}</span>
            </div>}
          </div>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </header>
        {d && (
          <div className="panel-body">
            <section className={`verdict ${st?.tone ?? ""}`}>
              <div className="big">{d.label}</div>
              <ul>{d.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>

            <section className="pricebox">
              <div><span>매입가</span><b>{won(d.vendor_price)}</b></div>
              <div><span>Steam 정가</span><b>{won(d.steam_initial)}</b></div>
              <div><span>경쟁 최저가</span><b>{d.competitor_lowest != null ? won(d.competitor_lowest) : d.second_pass === "NO_COMPETITOR" ? "없음" : "—"}</b></div>
              <div><span>노출가</span><b>{won(d.calc?.exposed_price_krw)}</b></div>
              <div><span>등록가</span><b>{won(d.calc?.list_price_krw)}</b></div>
              <div><span>예상 순이익</span><b className={d.calc ? (d.calc.pass ? "good-t" : "warn-t") : ""}>{won(d.calc?.profit_krw)}</b></div>
            </section>

            {["user_wait", "stock_ten", "register_no_competitor", "user_priced"].includes(d.code) &&
              <PriceChoice d={d} busy={busy} onChoose={(key, exposed) => decide("choose_price", { key, exposed })} />}

            <nav className="links">
              {d.store_url && <a href={d.store_url} target="_blank" rel="noreferrer">스토어 페이지 ↗</a>}
              {d.seller_edit_url && <a href={d.seller_edit_url} target="_blank" rel="noreferrer">판매자센터 수정 ↗</a>}
              {d.steam_url && <a href={d.steam_url} target="_blank" rel="noreferrer">Steam {d.steam_appid} ↗</a>}
            </nav>

            <h3>변경 제안</h3>
            {d.changes.length ? (
              <ul className="changes">
                {d.changes.map((c, i) => {
                  const fmt = (v: string | number | null) => (typeof v === "number" && c.field.includes("가") ? won(v) : String(v ?? "—"));
                  return (
                    <li key={i}>
                      <div className="ch-field">{c.field}</div>
                      <div className="ch-move"><span className="before">{fmt(c.before)}</span><span className="arrow">→</span><b>{fmt(c.after)}</b></div>
                      <div className="ch-why">{c.why}</div>
                      <div className="ch-undo">되돌리기: {c.undo}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted small">변경 제안 없음.</p>}

            <h3>상품 정보</h3>
            <dl className="facts">
              <dt>스토어</dt><dd>{storeOf(d)} · 재고 {d.store_stock ?? "—"}/기본 {d.base_stock} · 판매가 {won(d.store_price)} · 동기화 {when(d.store_synced_at)}</dd>
              <dt>재고 0</dt><dd>{d.stock_zero_since ? <>{day(d.stock_zero_since)}부터 · {d.zero_days}일{d.zero_stage !== null && <> · <b>{d.zero_stage}일째 회복되지 않았습니다</b></>}</> : d.stock_recovered_at ? `회복 ${day(d.stock_recovered_at)}` : "—"}</dd>
              <dt>매입처</dt><dd>{vendorOf(d)} · <VendorState r={d} /></dd>
              <dt>게임</dt><dd>{[d.identity.game, d.identity.edition, kindOf(d), platformOf(d)].filter(Boolean).join(" · ") || "—"}{d.identity.steam_appid && <> · AppID {d.identity.steam_appid}</>}</dd>
              <dt>최종 확인</dt><dd>{when(d.last_checked_at)}</dd>
            </dl>

            <h3>결정</h3>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(선택)" rows={2} />
            <div className="decide">
              {ACTIONS.map((a) => <button key={a.action} className={`btn small-btn ${a.action === "approve" ? "" : "ghost"}`} disabled={busy} onClick={() => decide(a.action)}>{a.label}</button>)}
            </div>
            {err && <div className="error">{err}</div>}
            <p className="muted small">결정은 기록만 합니다. 스토어 반영은 플랫폼 담당이 따로 합니다.</p>
            {d.decisions.length > 0 && (
              <ul className="timeline">
                {d.decisions.map((x, i) => <li key={i}><b>{x.label}</b>{x.choice && <> — {x.choice.label} 노출가 {won(x.choice.exposed)}</>} · {when(x.at)} · {x.by}{x.memo && <div className="muted">{x.memo}</div>}</li>)}
              </ul>
            )}

            <h3>관측 이력 <span className="muted small">{d.observations.length}건</span></h3>
            <ul className="timeline">
              {d.observations.map((o) => (
                <li key={o.observation_id} className={o.quality === "FAILED" ? "failed" : ""}>
                  <div><b>{o.record_type === "offer" ? "매입처·Steam" : "네이버 경쟁가"}</b> · {when(o.observed_at)} · 관측 기록{o.quality && o.quality !== "OK" && ` · ${o.quality}`}</div>
                  {o.record_type === "offer" ? (
                    <div>매입가 {won(o.vendor_price)} · Steam 정가 {won(o.steam_initial)} · {o.availability || "—"} · {o.kr_activation || "—"}</div>
                  ) : (
                    <div>경쟁 최저가 {won(o.competitor_lowest)}</div>
                  )}
                  {o.note && <div className="muted small">{o.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </>
  );
}

function PriceChoice({ d, busy, onChoose }: { d: Detail; busy: boolean; onChoose: (key: string, exposed: number) => void }) {
  const [custom, setCustom] = useState("");
  const [customCalc, setCustomCalc] = useState<Calc | null>(null);
  const check = async () => {
    const v = parseInt(custom.replace(/[^0-9]/g, ""), 10);
    if (!v || v <= 500 || d.vendor_price === null) return;
    setCustomCalc(await api.calcExposed(d.vendor_price, v - 500));
  };
  const wait = d.code === "user_wait";
  const minProfit = d.calc?.min_profit_krw ?? d.options[0]?.calc.min_profit_krw;
  const steamRule = (l: number) => !wait || (d.steam_initial !== null && l < d.steam_initial);
  return (
    <section className={`choice ${wait ? "" : "quiet"}`}>
      <h3>{wait ? <>판매가 선택 <span className="pill info">사용자 대기</span></> : "판매가 직접 정하기"}</h3>
      <p className="muted small">{wait
        ? <>경쟁가를 그대로 쓸 수 없어 직접 고릅니다. 조건: 등록가가 Steam 정가 {won(d.steam_initial)}보다 싸고, 예상 순이익 {won(minProfit)} 이상.</>
        : <>제안 등록가 {won(d.calc?.list_price_krw)} (경쟁 최저가 {won(d.competitor_lowest)} − 50원 + 쿠폰 500원). 더 낮추려면 등록가를 입력하세요. 예상 순이익 {won(minProfit)} 이상만 가능합니다.</>}</p>
      <div className="options">
        {d.options.map((o) => (
          <div key={o.key} className={`option ${o.ok ? "" : "no"}`}>
            <div className="k">{o.label}</div>
            <div>등록가 <b>{won(o.calc.list_price_krw)}</b> · 노출가 {won(o.calc.exposed_price_krw)}</div>
            <div className={o.calc.pass ? "good-t" : "warn-t"}>예상 순이익 {won(o.calc.profit_krw)}</div>
            <button className="btn small-btn" disabled={busy || !o.ok} onClick={() => onChoose(o.key, o.calc.exposed_price_krw)}>이 가격 선택</button>
          </div>
        ))}
        <div className="option">
          <div className="k">직접 입력(등록가)</div>
          <div className="row-input">
            <input value={custom} onChange={(e) => { setCustom(e.target.value); setCustomCalc(null); }} placeholder="예: 4990" inputMode="numeric" />
            <button className="btn ghost small-btn" onClick={check}>계산</button>
          </div>
          {customCalc && <>
            <div>노출가 {won(customCalc.exposed_price_krw)}</div>
            <div className={customCalc.pass ? "good-t" : "warn-t"}>예상 순이익 {won(customCalc.profit_krw)}</div>
            {!steamRule(customCalc.list_price_krw) && <div className="warn-t">Steam 정가보다 싸지 않음</div>}
            <button className="btn small-btn" disabled={busy || !customCalc.pass || !steamRule(customCalc.list_price_krw)}
              onClick={() => onChoose("custom", customCalc.exposed_price_krw)}>이 가격 선택</button>
          </>}
        </div>
      </div>
    </section>
  );
}
