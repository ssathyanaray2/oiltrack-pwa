import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "./useOfflineStorage";
import { offlineOrdersDB, offlineCustomersDB } from "../../lib/db";
import {
  createOrder,
  createCustomer,
  updateCustomer,
  getOrders,
  getCustomers,
} from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { setCachedOrders, setCachedCustomers } from "../../lib/cache";

/** Fired after a sync completes so list components can re-read IndexedDB. */
export const SYNC_COMPLETE_EVENT = "oiltrack-sync-complete";

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(!isOnline);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    // Only run if we just came back online
    if (!wasOffline.current) return;
    wasOffline.current = false;

    if (!isSupabaseConfigured() || isSyncing.current) return;

    const sync = async () => {
      isSyncing.current = true;
      try {
        const [pendingOrders, pendingCustomers] = await Promise.all([
          offlineOrdersDB.getAll(),
          offlineCustomersDB.getAll(),
        ]);

        const total = pendingOrders.length + pendingCustomers.length;
        if (total === 0) return;

        toast.loading(`Syncing ${total} offline ${total === 1 ? "item" : "items"}…`, { id: "offline-sync" });

        let synced = 0;
        let failed = 0;

        // Sync customers first — orders may reference them
        for (const customer of pendingCustomers) {
          try {
            if (customer.isEdit && customer.originalId) {
              await updateCustomer(customer.originalId, {
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                email: customer.email || undefined,
                maps_link: customer.maps_link || undefined,
              });
            } else {
              await createCustomer({
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                email: customer.email || undefined,
                maps_link: customer.maps_link || undefined,
              });
            }
            await offlineCustomersDB.delete(customer.id);
            synced++;
          } catch {
            failed++;
          }
        }

        // Sync orders one by one — delete each on success so a mid-run
        // failure doesn't lose already-synced items
        for (const order of pendingOrders) {
          try {
            const items = order.items
              .map((i) => ({ productId: i.productId, quantity: parseInt(i.quantity, 10) }))
              .filter((i) => !isNaN(i.quantity) && i.quantity > 0);

            if (!items.length || !order.customerId) {
              await offlineOrdersDB.delete(order.id);
              failed++;
              continue;
            }

            await createOrder({
              customerId: order.customerId,
              customerName: order.customerName,
              productId: items[0].productId,
              quantity: items[0].quantity,
              date: order.date,
              status: order.status,
              paymentStatus: order.paymentStatus,
              notes: order.notes || undefined,
              items,
            });

            await offlineOrdersDB.delete(order.id);
            synced++;
          } catch {
            failed++;
          }
        }

        // Refresh caches so lists show up-to-date data
        try {
          const [freshOrders, freshCustomers] = await Promise.all([
            getOrders(),
            getCustomers(),
          ]);
          setCachedOrders(freshOrders);
          setCachedCustomers(freshCustomers);
        } catch { /* non-critical */ }

        // Notify list components to re-read IndexedDB
        window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT));

        if (failed === 0) {
          toast.success(
            `${synced} ${synced === 1 ? "item" : "items"} synced successfully!`,
            { id: "offline-sync" }
          );
        } else {
          toast.warning(
            `${synced} synced, ${failed} failed — will retry next time you're online`,
            { id: "offline-sync", duration: 6000 }
          );
        }
      } finally {
        isSyncing.current = false;
      }
    };

    sync().catch(console.error);
  }, [isOnline]);
}
