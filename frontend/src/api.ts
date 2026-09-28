export type Calc = {
  policy_version: string; mode: string; cost_krw: number; competitor_lowest_krw: number | null;
  exposed_price_krw: number; list_price_krw: number; cost_rate: number; deductions_krw: number;
  profit_krw: number; pass: boolean; existing_order_ok: boolean; min_profit_krw: number; no_competitor_profit_krw: number;
};

export type Choice = { key: string; label: string; exposed: number; market_id: string };
export type Decision = { action: string; label: string; memo: string; at: string; by?: string; applied_at?: string | null; choice?: Choice | null };
export type PriceOption = { key: string; label: string; calc: Calc; ok: boolean };

export type Row = {
  id: number; ledger_row: number | null; name: string; legacy_name: string;
  channel_product_no: string | null; origin_product_no: string; store_status: string; in_store: boolean;
  store_stock: number | null; store_price: number | null; vendor: string; vendor_url: string;
  vendor_price: number | null; steam_initial: number | null; availability: string; kr_activation: string;
  first_pass: string; competitor_lowest: number | null; second_pass: string; calc: Calc | null;
  code: string; label: string; reasons: string[]; observed_at: string | null; observation_count: number;
  decision: Decision | null; last_checked_at: string | null; store_synced_at: string | null;
  store_url: string; seller_edit_url: string; steam_appid: string; steam_url: string;
  platform: string; edition: string; product_type: string; game: string; sku: string | null;
  base_stock: number; stock_zero_since: string | null; stock_recovered_at: string | null;
  zero_days: number | null; zero_stage: number | null;
  migration: string; migration_label: string; changes: Change[];
  options: PriceOption[]; market_id: string | null;
};

export type Change = { field: string; before: string | number | null; after: string | number | null; why: string; undo: string };

export type Observation = {
  observation_id: string; record_type: "offer" | "market"; observed_at: string | null; observer: string;
  availability: string; kr_activation: string; vendor_price: number | null; steam_initial: number | null;
  first_pass: string; competitor_lowest: number | null; competitor_seller: string; second_pass: string;
  quality: string; note: string; data: Record<string, unknown>;
};

export type Detail = Row & {
  observations: Observation[]; decisions: Decision[];
  legacy: { sale_price: number | null; cost: number | null; checked_on: string | null; note: string; source: string };
  identity: { sku: string | null; game: string; edition: string; product_type: string; platform: string; steam_appid: string };
};

export type Summary = {
  products: number; in_store: number; observed: number; by_code: Record<string, number>;
  by_label: Record<string, number>; decided: number; policy_version: string; observations: number;
  by_migration: Record<string, number>; migration_labels: Record<string, string>; open: number;
  with_changes: number; vendor_linked: number; user_wait: number; min_profit_krw: number;
};

export function csrf(): string {
  return document.cookie.split("; ").find((c) => c.startsWith("csrftoken="))?.split("=")[1] ?? "";
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf(), ...(init?.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    window.location.href = "/accounts/login/?next=/";
    throw new Error("로그인이 필요합니다");
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => request<Summary>("/api/summary/"),
  products: (params: Record<string, string>) => request<Row[]>(`/api/products/?${new URLSearchParams(params)}`),
  product: (id: number) => request<Detail>(`/api/products/${id}/`),
  decide: (id: number, action: string, memo: string, extra: Record<string, unknown> = {}) =>
    request<{ ok: boolean }>(`/api/products/${id}/decisions/`, { method: "POST", body: JSON.stringify({ action, memo, ...extra }) }),
  policy: () => request<{ current: Record<string, any>; history: { version: string; loaded_at: string }[] }>("/api/policy/"),
  calc: (cost: string, competitor: string) =>
    request<Calc>(`/api/calc/?${new URLSearchParams(competitor ? { cost, competitor } : { cost })}`),
  calcExposed: (cost: number, exposed: number) =>
    request<Calc>(`/api/calc/?${new URLSearchParams({ cost: String(cost), exposed: String(exposed) })}`),
  refresh: (store: boolean) => request<{ log: string[] }>("/api/refresh/", { method: "POST", body: JSON.stringify({ store }) }),
};

export const won = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("ko-KR")}원`);
export const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const day = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "—";
export const STORE_STATUS: Record<string, string> = {
  SALE: "판매중", SUSPENSION: "판매중지", OUTOFSTOCK: "품절", WAIT: "판매대기", 없음: "스토어에 없음",
};
