import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getCustomers, getOrders } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, getCachedOrders, setCachedCustomers, setCachedOrders } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineCustomersDB, type OfflineCustomer } from "../../lib/db";
import { SYNC_COMPLETE_EVENT } from "../hooks/useOfflineSync";
import type { Customer, Order } from "../../lib/types";
import { customers as mockCustomers, orders as mockOrders } from "../data/mockData";
import { deleteCustomer } from "../../lib/api";
import { toast } from "sonner";
import { User, Phone, MapPin, Mail, Plus, ShoppingBag, Clock, Trash2 } from "lucide-react";
import React from "react";
import { formatMapsLink } from "../../lib/utils";

export function Customers() {
  const isOnline = useOnlineStatus();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingCustomers, setPendingCustomers] = useState<OfflineCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = () =>
    offlineCustomersDB.getAll().then(setPendingCustomers).catch(console.error);

  useEffect(() => {
    loadPending();
    window.addEventListener(SYNC_COMPLETE_EVENT, loadPending);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, loadPending);
  }, []);

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [customersData, ordersData] = await Promise.all([getCustomers(), getOrders()]);
          setCustomers(customersData);
          setOrders(ordersData);
          setCachedCustomers(customersData);
          setCachedOrders(ordersData);
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          const co = getCachedOrders() as Order[] | null;
          setCustomers(cc?.length ? cc : mockCustomers);
          setOrders(co?.length ? co : mockOrders);
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        const co = getCachedOrders() as Order[] | null;
        setCustomers(cc?.length ? cc : mockCustomers);
        setOrders(co?.length ? co : mockOrders);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const getCustomerOrderCount = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId).length;
  const getCustomerPendingOrders = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId && o.status === "Pending").length;

  const getMapsUrl = (customer: Customer): string | null => {
    if (customer.maps_link?.trim()) return customer.maps_link.trim();
    if (customer.address?.trim()) return formatMapsLink(customer.address);
    return null;
  };

  const handleDelete = async (e: React.MouseEvent, customerId: string, customerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${customerName}? This cannot be undone.`)) return;
    try {
      await deleteCustomer(customerId);
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
      toast.success(`${customerName} deleted`);
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] pb-32 animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="h-6 w-24 bg-[#e2e7ff] rounded-full" />
          <div className="h-9 w-9 bg-[#e2e7ff] rounded-xl" />
        </div>
        <div className="px-5 pt-4 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
              {/* Avatar + name row */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-[#e2e7ff] flex-shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-[#e2e7ff] rounded-full" />
                  <div className="h-3 w-24 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
              {/* Contact rows */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                  <div className="h-3.5 w-32 bg-[#e2e7ff] rounded-full" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                  <div className="h-3.5 w-48 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <h1 className="text-xl font-bold text-[#131b2e]">Customers</h1>
        <Link
          to="/customers/new"
          className="flex items-center gap-1.5 bg-[#004ac6] hover:bg-[#003ea8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Pending sync banner */}
        {pendingCustomers.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-700">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold">
                {pendingCustomers.length} customer{pendingCustomers.length > 1 ? "s" : ""} pending sync
              </span>
            </div>
            {pendingCustomers.map((customer) => (
              <div
                key={customer.id}
                className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="bg-amber-100 p-2 rounded-lg flex-shrink-0">
                  <User className="h-4 w-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#131b2e] text-sm truncate">{customer.name}</p>
                  <p className="text-xs text-[#737686] truncate">{customer.phone}</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg whitespace-nowrap flex items-center gap-1 flex-shrink-0">
                  <Clock className="h-3 w-3" />
                  {customer.isEdit ? "Edit pending" : "New — pending sync"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Customer list */}
        {customers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_16px_rgba(0,74,198,0.06)] text-center">
            <div className="bg-[#eaedff] w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-7 w-7 text-[#004ac6]" />
            </div>
            <p className="font-semibold text-[#131b2e] mb-1">No customers yet</p>
            <p className="text-sm text-[#737686]">Add your first customer to get started</p>
          </div>
        ) : (
          customers.map((customer) => {
            const totalOrders = getCustomerOrderCount(customer.id);
            const pendingOrders = getCustomerPendingOrders(customer.id);
            const initials = customer.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <Link
                key={customer.id}
                to={`/customers/${customer.id}`}
                className="block bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] active:scale-[0.99] transition-transform"
              >
                {/* Top row: avatar + name + badges */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-[#eaedff] w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-[#004ac6] font-bold text-sm">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#131b2e] truncate">{customer.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-[#737686]">
                        <ShoppingBag className="h-3.5 w-3.5" />
                        {totalOrders} {totalOrders === 1 ? "order" : "orders"}
                      </span>
                      {pendingOrders > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-medium">
                          {pendingOrders} pending
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, customer.id, customer.name)}
                    className="p-2 rounded-xl text-[#b0b3c6] hover:text-red-500 hover:bg-red-50 transition-colors active:scale-95 flex-shrink-0"
                    aria-label="Delete customer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Contact details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-[#434655]">
                    <Phone className="h-4 w-4 flex-shrink-0 text-[#737686]" />
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-sm text-[#2563eb] font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customer.phone}
                    </a>
                  </div>
                  {customer.address && (
                    <div className="flex items-start gap-3 text-[#434655]">
                      <MapPin className="h-4 w-4 flex-shrink-0 text-[#737686] mt-0.5" />
                      <a
                        href={getMapsUrl(customer) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#2563eb] hover:underline leading-snug"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {customer.address}
                      </a>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-3 text-[#434655]">
                      <Mail className="h-4 w-4 flex-shrink-0 text-[#737686]" />
                      <a
                        href={`mailto:${customer.email}`}
                        className="text-sm text-[#2563eb] hover:underline break-all min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {customer.email}
                      </a>
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
