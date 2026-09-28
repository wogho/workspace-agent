import { csrf, request } from "./api";

export type MonthRow = {
  month: string; ordered: number; shipped: number; decided: number; settled: number; canceled: number; refunded: number; in_progress: number;
  sales_amount: number; settle_amount: number; commission: number; commission_basis: number; cash_in: number; sales_basis: number;
  vat: Record<string, number>; card_purchases: number; card_purchase_krw: number; card_unmatched: number;
  invoices: number; invoice_total: number; purchase_count: number | null; purchase_diff: number | null; card_diff: number | null;
  bank_in: number; bank_unmatched: number; deposit: { covered: boolean; settled: number; missing: number; missing_amount: number };
  check_status: string; check_memo: string; checked_at: string | null; purchase_from: string;
};
export type Overview = {
  year: number; years: number[]; months: MonthRow[]; total: Record<string, number>; vat: Record<string, number>; flags: string[]; last_sync: string | null;
};
export type Order = {
  product_order_id: string; order_id: string; paid_at: string | null; product_id: string; product_name: string; quantity: number;
  unit_price: number | null; total_payment: number | null; seller_discount: number | null; commission: number; expected_settlement: number | null;
  status: string; status_label: string; claim_type: string; claim_status: string; sent_at: string | null; decided_at: string | null;
  tax_type: string; inflow_path: string; settled: { date: string; amount: number } | null;
};
export type Invoice = {
  id: number; issue_id: string; issue_date: string; purpose: string; supplier_name: string; supplier_regno: string; buyer_name: string;
  buyer_regno: string; supply_amount: number; tax_amount: number; total_amount: number; remark: string; document_id: number | null;
  month_commission: number; items: { date: string; name: string; spec: string; qty: string; supply: number; tax: number; note: string }[];
};
export type Card = {
  id: number; card: string; used_on: string; merchant: string; amount_krw: number; foreign_amount: string | null; currency: string;
  approval: string; kind: string; kind_label: string; vendor: string; status: string; status_label: string; matched_ref: string; memo: string;
};
export type Doc = {
  id: number; kind: string; kind_label: string; period: string; title: string; filename: string; size: number; status: string;
  status_label: string; summary: Record<string, unknown>; note: string; added_by: string; added_at: string;
};
export type BankRow = {
  id: number; occurred_at: string; account: string; kind: string; memo: string; withdraw: number; deposit: number; balance: number | null;
  status: string; status_label: string; note: string; sale_year: number | null; settlements: { basis_start: string; basis_end: string; complete_date: string; amount: number }[];
};
export type SettleDay = {
  basis_start: string; basis_end: string; expect_date: string | null; complete_date: string | null; settle_amount: number; pay_amount: number;
  commission: number; benefit: number; deduction: number; method: string; bank: string;
};

const qs = (p: Record<string, string | undefined>) => new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();

export const acct = {
  overview: (year?: number) => request<Overview>(`/api/acct/overview/?${qs({ year: year ? String(year) : undefined })}`),
  orders: (p: { month?: string; status?: string; q?: string }) => request<{ rows: Order[]; statuses: Record<string, string> }>(`/api/acct/orders/?${qs(p)}`),
  settlements: (month?: string) => request<SettleDay[]>(`/api/acct/settlements/?${qs({ month })}`),
  invoices: () => request<Invoice[]>("/api/acct/invoices/"),
  cards: (month?: string) => request<{ rows: Card[]; statuses: Record<string, string>; kinds: Record<string, string> }>(`/api/acct/cards/?${qs({ month })}`),
  card: (id: number, data: Partial<Card>) => request<Card>(`/api/acct/cards/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  documents: () => request<{ rows: Doc[]; kinds: Record<string, string>; statuses: Record<string, string> }>("/api/acct/documents/"),
  document: (id: number, data: Partial<Doc>) => request<Doc>(`/api/acct/documents/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  upload: async (form: FormData) => {
    const res = await fetch("/api/acct/documents/", { method: "POST", body: form, credentials: "same-origin", headers: { "X-CSRFToken": csrf() } });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `${res.status}`);
    return body as { created: boolean; document: Doc };
  },
  month: (month: string, data: { purchase_count?: number | ""; memo?: string; status?: string }) =>
    request<MonthRow>(`/api/acct/months/${month}/`, { method: "POST", body: JSON.stringify(data) }),
  bank: (month?: string, year?: number) => request<{ rows: BankRow[]; unpaid: { basis_start: string; basis_end: string; complete_date: string; amount: number }[]; coverage_from: string | null }>(`/api/acct/bank/?${qs({ month, year: year ? String(year) : undefined })}`),
  sync: (days = 40) => request<{ log: string[] }>("/api/acct/sync/", { method: "POST", body: JSON.stringify({ days }) }),
};

export const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("ko-KR"));
export const CHECK: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "대조 전", tone: "muted" }, OK: { label: "일치", tone: "good" }, MISMATCH: { label: "확인 필요", tone: "bad" }, CLOSED: { label: "마감", tone: "info" },
};
