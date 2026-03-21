/**
 * IndexedDB wrapper for offline queues.
 * Stores pending orders and customers that haven't synced yet.
 * No quota limits needed — IndexedDB uses up to 50-60% of available disk.
 */

const DB_NAME = "oiltrack-db";
const DB_VERSION = 1;

export interface OfflineOrder {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  status: "Pending" | "Delivered" | "Cancelled";
  paymentStatus: "Paid" | "Unpaid" | "Partial";
  notes: string;
  items: Array<{ productId: string; quantity: string }>;
  createdAt: string;
}

export interface OfflineCustomer {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  maps_link: string;
  createdAt: string;
  isEdit: boolean;
  originalId: string; // the real customer ID when editing an existing record
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("offline-orders")) {
        db.createObjectStore("offline-orders", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("offline-customers")) {
        db.createObjectStore("offline-customers", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const offlineOrdersDB = {
  getAll: () => getAll<OfflineOrder>("offline-orders"),
  put: (order: OfflineOrder) => put<OfflineOrder>("offline-orders", order),
  delete: (id: string) => remove("offline-orders", id),
};

export const offlineCustomersDB = {
  getAll: () => getAll<OfflineCustomer>("offline-customers"),
  put: (customer: OfflineCustomer) => put<OfflineCustomer>("offline-customers", customer),
  delete: (id: string) => remove("offline-customers", id),
};

/**
 * Request persistent storage so the browser won't evict offline data
 * under disk pressure. Should be called once on app start.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist) {
    const granted = await navigator.storage.persist();
    if (!granted) {
      console.warn("[OilTrack] Persistent storage not granted — offline data may be evicted under disk pressure.");
    }
  }
}
