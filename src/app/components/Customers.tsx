import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { ConfirmModal } from "./ConfirmModal";
import { Link } from "react-router";
import { getCustomers, getOrderCountsByCustomer } from "../../lib/api";
import { getCachedCustomers, setCachedCustomers } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineCustomersDB, type OfflineCustomer } from "../../lib/db";
import { SYNC_COMPLETE_EVENT } from "../hooks/useOfflineSync";
import type { Customer } from "../../lib/types";
import { deleteCustomer } from "../../lib/api";
import { toast } from "sonner";
import { User, Phone, MapPin, Mail, Plus, ShoppingBag, Clock, Trash2, Search, Table2, List } from "lucide-react";
import React from "react";
import { formatMapsLink } from "../../lib/utils";

type ViewMode = "list" | "table";

export function Customers() {
  const isOnline = useOnlineStatus();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, { total: number; pending: number }>>({});
  const [pendingCustomers, setPendingCustomers] = useState<OfflineCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth >= 1024 ? "table" : "list"
  );

  const loadPending = () =>
    offlineCustomersDB.getAll().then(setPendingCustomers).catch(console.error);

  useEffect(() => {
    loadPending();
    window.addEventListener(SYNC_COMPLETE_EVENT, loadPending);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, loadPending);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (isOnline) {
        try {
          const [customersData, countsData] = await Promise.all([getCustomers(), getOrderCountsByCustomer()]);
          setCustomers(customersData);
          setOrderCounts(countsData);
          setCachedCustomers(customersData);
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          setCustomers(cc ?? []);
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        setCustomers(cc ?? []);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const getCustomerOrderCount = (customerId: string) => orderCounts[customerId]?.total ?? 0;
  const getCustomerPendingOrders = (customerId: string) => orderCounts[customerId]?.pending ?? 0;


  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = (e: React.MouseEvent, customerId: string, customerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ id: customerId, name: customerName });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      toast.success(`${name} deleted`);
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  const customerFuse = useMemo(() => new Fuse(customers, { keys: ["name", "phone"], threshold: 0.3 }), [customers]);
  const filteredCustomers = searchQuery ? customerFuse.search(searchQuery).map((r) => r.item) : customers;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] pb-32 animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="h-6 w-24 bg-[#e2e7ff] rounded-full" />
          {/* Desktop search */}
          <div className="hidden lg:block h-9 w-64 bg-[#e2e7ff] rounded-xl flex-1 mx-6" />
          <div className="h-9 w-9 lg:w-32 bg-[#e2e7ff] rounded-xl ml-auto" />
        </div>
        <div className="px-5 lg:px-8 pt-4 space-y-4">
          {/* Mobile search bar */}
          <div className="h-11 w-full bg-[#e2e7ff] rounded-xl lg:hidden" />
          {/* Toolbar: view toggle */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-28 bg-[#e2e7ff] rounded-xl" />
          </div>
        </div>
        <div className="px-5 lg:px-8 pt-3 grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-4">
          {[...Array(6)].map((_, i) => (
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
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center gap-3 px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <h1 className="text-xl font-bold text-[#131b2e] flex-shrink-0">Customers</h1>
        <div className="hidden lg:flex relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-[#c3c6d7] text-[#131b2e] placeholder-[#737686] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
          />
        </div>
        <Link
          to="/customers/new"
          className="flex items-center gap-1.5 bg-[#004ac6] hover:bg-[#003ea8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95 ml-auto flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">Add Customer</span>
        </Link>
      </div>

      <div className="px-5 lg:px-8 pt-4 space-y-4 max-w-2xl mx-auto lg:max-w-none">
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

        {/* Search bar — mobile only (desktop search is in the header) */}
        <div className="relative lg:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#e2e7ff] text-[#131b2e] placeholder-[#737686] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] border border-transparent"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-[#c3c6d7] rounded-xl p-0.5 flex-shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "list" ? "bg-[#eaedff] text-[#004ac6]" : "text-[#737686] hover:text-[#434655]"}`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "table" ? "bg-[#eaedff] text-[#004ac6]" : "text-[#737686] hover:text-[#434655]"}`}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>

        {/* Customer list */}
        {customers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_16px_rgba(0,74,198,0.06)] text-center">
            <div className="bg-[#eaedff] w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-7 w-7 text-[#004ac6]" />
            </div>
            <p className="font-semibold text-[#131b2e] mb-1">No customers yet</p>
            <p className="text-sm text-[#737686]">Add your first customer to get started</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_16px_rgba(0,74,198,0.06)] text-center">
            <p className="font-semibold text-[#131b2e] mb-1">No customers found</p>
            <p className="text-sm text-[#737686]">Try a different name or phone number</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white rounded-2xl border border-[#eaedff] shadow-[0_4px_16px_rgba(0,74,198,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f2f3ff] text-[11px] uppercase tracking-wider font-bold text-[#737686] border-b border-[#c3c6d7]">
                    <th className="text-left px-5 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Phone</th>
                    <th className="text-left px-4 py-3">Address</th>
                    <th className="text-right px-4 py-3">Orders</th>
                    <th className="text-right px-4 py-3">Pending</th>
                    <th className="text-right px-5 py-3 w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaedff]">
                  {filteredCustomers.map((customer) => {
                    const totalOrders = getCustomerOrderCount(customer.id);
                    const pendingCount = getCustomerPendingOrders(customer.id);
                    const initials = customer.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <tr key={customer.id} className="group hover:bg-[#f2f3ff]/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#eaedff] flex items-center justify-center font-bold text-[11px] text-[#004ac6] flex-shrink-0">
                              {initials}
                            </div>
                            <Link to={`/customers/${customer.id}`} className="font-bold text-[#131b2e] hover:text-[#004ac6] hover:underline">
                              {customer.name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <a href={`tel:${customer.phone}`} className="text-[#2563eb] font-medium hover:underline tabular-nums">{customer.phone}</a>
                        </td>
                        <td className="px-4 py-3 text-[#434655] truncate max-w-[220px]">{customer.address ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#131b2e] tabular-nums">{totalOrders}</td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${pendingCount > 0 ? "text-orange-600" : "text-[#737686]"}`}>{pendingCount}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              to={`/customers/${customer.id}`}
                              className="p-1.5 rounded-lg text-[#737686] hover:text-[#004ac6] hover:bg-[#eaedff] transition-colors"
                              title="View"
                            >
                              <User className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={(e) => handleDelete(e, customer.id, customer.name)}
                              className="p-1.5 rounded-lg text-[#737686] hover:text-[#ba1a1a] hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[#eaedff] text-xs text-[#737686] bg-[#f2f3ff]/50">
              Showing <strong className="text-[#131b2e]">{filteredCustomers.length}</strong> of <strong className="text-[#131b2e]">{customers.length}</strong> customers
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-4">
          {filteredCustomers.map((customer) => {
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
                        href={formatMapsLink(customer.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#2563eb] hover:underline leading-snug"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {customer.address}
                      </a>
                    </div>
                  )}
                  {customer.maps_link && (
                    <div className="flex items-center gap-3 text-[#434655]">
                      <MapPin className="h-4 w-4 flex-shrink-0 text-[#737686]" />
                      <a
                        href={customer.maps_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#2563eb] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open in Maps
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
          })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Customer"
        message={`Delete ${deleteConfirm?.name}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
