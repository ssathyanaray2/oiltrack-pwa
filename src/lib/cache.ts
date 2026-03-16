const CACHE_KEYS = {
  products: "supabase_cache_products",
  customers: "supabase_cache_customers",
  orders: "supabase_cache_orders",
  dashboard: "supabase_cache_dashboard",
} as const;

const CACHE_VERSION = 1;
const CACHE_PREFIX = "v";

function versionedKey(key: string) {
  return `${CACHE_PREFIX}${CACHE_VERSION}_${key}`;
}

export function getCachedProducts(): unknown[] | null {
  try {
    const raw = localStorage.getItem(versionedKey(CACHE_KEYS.products));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedProducts(data: unknown[]): void {
  try {
    localStorage.setItem(versionedKey(CACHE_KEYS.products), JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache products", e);
  }
}

export function getCachedCustomers(): unknown[] | null {
  try {
    const raw = localStorage.getItem(versionedKey(CACHE_KEYS.customers));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedCustomers(data: unknown[]): void {
  try {
    localStorage.setItem(versionedKey(CACHE_KEYS.customers), JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache customers", e);
  }
}

export function getCachedOrders(): unknown[] | null {
  try {
    const raw = localStorage.getItem(versionedKey(CACHE_KEYS.orders));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedOrders(data: unknown[]): void {
  try {
    localStorage.setItem(versionedKey(CACHE_KEYS.orders), JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache orders", e);
  }
}

export function getCachedDashboard(): { monthlySales: unknown[]; inventoryLevels: unknown[] } | null {
  try {
    const raw = localStorage.getItem(versionedKey(CACHE_KEYS.dashboard));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedDashboard(data: { monthlySales: unknown[]; inventoryLevels: unknown[] }): void {
  try {
    localStorage.setItem(versionedKey(CACHE_KEYS.dashboard), JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache dashboard", e);
  }
}
