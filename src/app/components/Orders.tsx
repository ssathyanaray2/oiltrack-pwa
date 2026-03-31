import React,{ useState, useEffect } from "react";
import { Link } from "react-router";
import { getOrders, getProducts, updateOrder } from "../../lib/api";
import { toast } from "sonner";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedOrders, getCachedProducts, setCachedOrders, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineOrdersDB, type OfflineOrder } from "../../lib/db";
import { SYNC_COMPLETE_EVENT } from "../hooks/useOfflineSync";
import type { Order, Product } from "../../lib/types";
import { orders as mockOrders, products as mockProducts } from "../data/mockData";
import { Plus, Calendar, User, Package as PackageIcon, LayoutGrid, List, ArrowUpDown, Search, IndianRupee, Clock, ChevronDown } from "lucide-react";

type ViewMode = "card" | "list";
type SortOrder = "recent" | "oldest";
type StatusFilter = "All" | "Pending" | "Packed" | "Delivered" | "Cancelled";

export function Orders() {
  const isOnline = useOnlineStatus();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState<OfflineOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = () =>
    offlineOrdersDB.getAll().then(setPendingOrders).catch(console.error);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const toggleExpand = (orderId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const handleStatusChange = async (orderId: string, currentStatus: Order["status"], newStatus: Order["status"]) => {
    if (currentStatus === newStatus) return;
    if (currentStatus === "Cancelled" && (newStatus === "Packed" || newStatus === "Delivered")) return;
    if (currentStatus === "Cancelled") {
      if (!confirm("Reactivate this cancelled order? It will be moved back to Pending.")) return;
    }
    setSavingOrderId(orderId);
    // Optimistic update
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    try {
      await updateOrder(orderId, { status: newStatus });
      setCachedOrders(orders.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: currentStatus } : o));
    } finally {
      setSavingOrderId(null);
    }
  };

  const handlePaymentStatusChange = async (orderId: string, currentPayment: Order["paymentStatus"], newPayment: Order["paymentStatus"]) => {
    if (currentPayment === newPayment) return;
    setSavingOrderId(orderId);
    const clearedMethod = newPayment === "Unpaid" ? null : undefined;
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paymentStatus: newPayment, ...(newPayment === "Unpaid" ? { paymentMethod: undefined } : {}) } : o));
    try {
      await updateOrder(orderId, { paymentStatus: newPayment, ...(clearedMethod !== undefined ? { paymentMethod: clearedMethod } : {}) });
      setCachedOrders(orders.map((o) => o.id === orderId ? { ...o, paymentStatus: newPayment } : o));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment status");
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paymentStatus: currentPayment } : o));
    } finally {
      setSavingOrderId(null);
    }
  };

  const handlePaymentMethodChange = async (orderId: string, newMethod: Order["paymentMethod"]) => {
    setSavingOrderId(orderId);
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paymentMethod: newMethod } : o));
    try {
      await updateOrder(orderId, { paymentMethod: newMethod });
      setCachedOrders(orders.map((o) => o.id === orderId ? { ...o, paymentMethod: newMethod } : o));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment method");
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paymentMethod: undefined } : o));
    } finally {
      setSavingOrderId(null);
    }
  };

  // Load pending IDB orders on mount and after each sync
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
          const [ordersData, productsData] = await Promise.all([getOrders(), getProducts()]);
          setOrders(ordersData);
          setProducts(productsData);
          setCachedOrders(ordersData);
          setCachedProducts(productsData);
        } catch (e) {
          console.error(e);
          const co = getCachedOrders() as Order[] | null;
          const cp = getCachedProducts() as Product[] | null;
          setOrders(co?.length ? co : mockOrders);
          setProducts(cp?.length ? cp : mockProducts);
        } finally {
          setLoading(false);
        }
      } else {
        const co = getCachedOrders() as Order[] | null;
        const cp = getCachedProducts() as Product[] | null;
        setOrders(co?.length ? co : mockOrders);
        setProducts(cp?.length ? cp : mockProducts);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const getProductName = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product?.name || "Unknown Product";
  };

  const getProductPrice = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product?.pricePerLiter || 0;
  };

  const calculateOrderTotal = (productId: string, quantity: number) => {
    const pricePerLiter = getProductPrice(productId);
    return pricePerLiter * quantity;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pending":
        return "bg-orange-100 text-orange-700";
      case "Packed":
        return "bg-blue-100 text-blue-700";
      case "Delivered":
        return "bg-green-100 text-green-700";
      case "Cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case "Pending":
        return "#943700";
      case "Packed":
        return "#2563eb";
      case "Delivered":
        return "#22c55e";
      case "Cancelled":
        return "#ba1a1a";
      default:
        return "#c3c6d7";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-700";
      case "Unpaid":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getPaymentMethodColor = (method: string | undefined) => {
    switch (method) {
      case "Cash":
        return "bg-purple-100 text-purple-700";
      case "UPI":
        return "bg-teal-100 text-teal-700";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const filteredOrders = orders
    .filter((order) => {
      const matchesStatus = statusFilter === "All" || order.status === statusFilter;
      const matchesSearch = order.customerName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === "recent" ? createdB - createdA : createdA - createdB;
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="h-6 w-16 bg-[#e2e7ff] rounded-full" />
          <div className="h-9 w-9 bg-[#e2e7ff] rounded-xl" />
        </div>
        <div className="px-5 pt-4 pb-24 space-y-4">
          {/* Search bar */}
          <div className="h-10 w-full bg-[#e2e7ff] rounded-xl" />
          {/* Filter chips row */}
          <div className="flex gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-7 w-16 bg-[#e2e7ff] rounded-full" />
            ))}
          </div>
          {/* Order cards */}
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                    <div className="h-4 w-32 bg-[#e2e7ff] rounded-full" />
                  </div>
                  <div className="h-4 w-16 bg-[#e2e7ff] rounded-full" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                  <div className="h-3.5 w-40 bg-[#e2e7ff] rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="h-5 w-16 bg-[#e2e7ff] rounded-full" />
                    <div className="h-5 w-14 bg-[#e2e7ff] rounded-full" />
                  </div>
                  <div className="h-3.5 w-20 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <h1 className="text-xl font-bold text-[#131b2e]">Orders</h1>
        <Link
          to="/orders/new"
          className="flex items-center gap-1.5 bg-[#004ac6] hover:bg-[#003ea8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>

      <div className="px-5 pt-4 pb-24 space-y-4">
        {/* Pending sync banner */}
        {pendingOrders.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="flex items-center gap-2 text-orange-700 mb-2">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold">
                {pendingOrders.length} order{pendingOrders.length > 1 ? "s" : ""} pending sync
              </span>
            </div>
            <div className="space-y-2">
              {pendingOrders.map((order) => {
                const firstItem = order.items[0];
                const product = products.find((p) => p.id === firstItem?.productId);
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-lg px-3 py-2 border border-orange-100 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium text-[#131b2e] truncate">{order.customerName}</span>
                    <span className="text-xs text-orange-600 whitespace-nowrap">
                      {order.items.length === 1
                        ? `${product?.name ?? "Unknown"} — ${firstItem?.quantity} L`
                        : `${order.items.length} items`}
                      {" · "}{order.date}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#e2e7ff] text-[#131b2e] placeholder-[#737686] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] border border-transparent"
          />
        </div>

        {/* Filter chips + sort + view toggle row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <div className="flex gap-1.5 flex-shrink-0">
            {(["All", "Pending", "Packed", "Delivered", "Cancelled"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`py-1.5 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                  statusFilter === status
                    ? "bg-[#004ac6] text-white border-[#004ac6]"
                    : "bg-white text-[#434655] border-[#c3c6d7] hover:border-[#004ac6]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <button
              onClick={() => setSortOrder(sortOrder === "recent" ? "oldest" : "recent")}
              className="flex items-center gap-1 text-xs font-medium text-[#434655] bg-white border border-[#c3c6d7] rounded-full px-2.5 py-1.5 hover:border-[#004ac6] transition-colors whitespace-nowrap"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortOrder === "recent" ? "Recent" : "Oldest"}
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded-lg border transition-colors ${
                viewMode === "card"
                  ? "bg-[#004ac6] text-white border-[#004ac6]"
                  : "bg-white text-[#737686] border-[#c3c6d7]"
              }`}
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg border transition-colors ${
                viewMode === "list"
                  ? "bg-[#004ac6] text-white border-[#004ac6]"
                  : "bg-white text-[#737686] border-[#c3c6d7]"
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Orders */}
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-[#eaedff] rounded-full p-4 mb-3">
              <PackageIcon className="h-8 w-8 text-[#004ac6]" />
            </div>
            <p className="text-[#131b2e] font-semibold mb-1">No orders found</p>
            <p className="text-[#737686] text-sm">Try adjusting your filters or search query</p>
          </div>
        ) : viewMode === "card" ? (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const total = calculateOrderTotal(order.productId, order.quantity);
              const formattedTotal = total.toLocaleString("en-IN", { maximumFractionDigits: 0 });
              const isSaving = savingOrderId === order.id;
              return (
                <Link
                  key={order.id}
                  to={`/orders/edit/${order.id}`}
                  className={`block bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden active:scale-[0.99] transition-all ${isSaving ? "opacity-60" : ""}`}
                  style={{ borderLeft: `4px solid ${getStatusBorderColor(order.status)}` }}
                >
                  <div className="p-4">
                    {/* Customer name + total */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-[#737686] flex-shrink-0" />
                        <span className="font-bold text-[#131b2e] truncate">{order.customerName}</span>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
                        <IndianRupee className="h-3.5 w-3.5 text-[#004ac6]" />
                        <span className="font-bold text-[#004ac6] text-sm">{formattedTotal}</span>
                      </div>
                    </div>

                    {/* Product + quantity */}
                    <div className="mb-3">
                      {order.items && order.items.length > 1 ? (
                        <>
                          <button
                            onClick={(e) => toggleExpand(order.id, e)}
                            className="flex items-center gap-2 text-sm text-[#434655] w-full text-left"
                          >
                            <PackageIcon className="h-4 w-4 text-[#737686] flex-shrink-0" />
                            <span>{order.items.length} items</span>
                            <ChevronDown className={`h-3.5 w-3.5 text-[#737686] transition-transform ${expandedOrders.has(order.id) ? "rotate-180" : ""}`} />
                          </button>
                          {expandedOrders.has(order.id) && (
                            <div className="mt-2 ml-6 space-y-1">
                              {order.items.map((item, i) => (
                                <div key={i} className="text-xs text-[#434655]">
                                  {getProductName(item.productId)} · {item.quantity} L
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <PackageIcon className="h-4 w-4 text-[#737686] flex-shrink-0" />
                          <span className="text-sm text-[#434655]">
                            {getProductName(order.productId)} · {order.quantity} L
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inline status selects + date */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1.5" onClick={(e) => e.preventDefault()}>
                        <select
                          value={order.status}
                          disabled={isSaving}
                          onChange={(e) => handleStatusChange(order.id, order.status, e.target.value as Order["status"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getStatusColor(order.status)}`}
                        >
                          <option value="Pending">Pending</option>
                          {order.status !== "Cancelled" && <option value="Packed">Packed</option>}
                          {order.status !== "Cancelled" && <option value="Delivered">Delivered</option>}
                          <option value="Cancelled">Cancelled</option>
                        </select>
                        <select
                          value={order.paymentStatus}
                          disabled={isSaving}
                          onChange={(e) => handlePaymentStatusChange(order.id, order.paymentStatus, e.target.value as Order["paymentStatus"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentStatusColor(order.paymentStatus)}`}
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Paid">Paid</option>
                        </select>
                        {order.paymentStatus === "Paid" && (
                          <select
                            value={order.paymentMethod ?? ""}
                            disabled={isSaving}
                            onChange={(e) => handlePaymentMethodChange(order.id, e.target.value as Order["paymentMethod"])}
                            onClick={(e) => e.preventDefault()}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentMethodColor(order.paymentMethod)}`}
                          >
                            <option value="">Method?</option>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                          </select>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[#737686]">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-xs">{formatDate(order.date)}</span>
                      </div>
                    </div>

                    {order.notes && (
                      <p className="text-xs text-[#737686] italic mt-2 pt-2 border-t border-[#f2f3ff]">
                        {order.notes}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const total = calculateOrderTotal(order.productId, order.quantity);
              const formattedTotalList = total.toLocaleString("en-IN", { maximumFractionDigits: 0 });
              const isSaving = savingOrderId === order.id;
              return (
                <Link
                  key={order.id}
                  to={`/orders/edit/${order.id}`}
                  className={`block bg-white rounded-xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden active:scale-[0.99] transition-all ${isSaving ? "opacity-60" : ""}`}
                  style={{ borderLeft: `3px solid ${getStatusBorderColor(order.status)}` }}
                >
                  <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#131b2e] truncate flex-1 min-w-0">{order.customerName}</span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={(e) => e.preventDefault()}>
                        <select
                          value={order.status}
                          disabled={isSaving}
                          onChange={(e) => handleStatusChange(order.id, order.status, e.target.value as Order["status"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getStatusColor(order.status)}`}
                        >
                          <option value="Pending">Pending</option>
                          {order.status !== "Cancelled" && <option value="Packed">Packed</option>}
                          {order.status !== "Cancelled" && <option value="Delivered">Delivered</option>}
                          <option value="Cancelled">Cancelled</option>
                        </select>
                        <select
                          value={order.paymentStatus}
                          disabled={isSaving}
                          onChange={(e) => handlePaymentStatusChange(order.id, order.paymentStatus, e.target.value as Order["paymentStatus"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentStatusColor(order.paymentStatus)}`}
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Paid">Paid</option>
                        </select>
                        {order.paymentStatus === "Paid" && (
                          <select
                            value={order.paymentMethod ?? ""}
                            disabled={isSaving}
                            onChange={(e) => handlePaymentMethodChange(order.id, e.target.value as Order["paymentMethod"])}
                            onClick={(e) => e.preventDefault()}
                            className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentMethodColor(order.paymentMethod)}`}
                          >
                            <option value="">Method?</option>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      {order.items && order.items.length > 1 ? (
                        <button
                          onClick={(e) => toggleExpand(order.id, e)}
                          className="flex items-center gap-1 text-xs text-[#434655] flex-1 min-w-0 text-left"
                        >
                          <span>{order.items.length} items</span>
                          <ChevronDown className={`h-3 w-3 text-[#737686] transition-transform flex-shrink-0 ${expandedOrders.has(order.id) ? "rotate-180" : ""}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-[#434655] truncate flex-1 min-w-0">
                          {getProductName(order.productId)} ({order.quantity}L)
                        </span>
                      )}
                      <div className="flex flex-col items-end flex-shrink-0 ml-2">
                        <span className="text-xs font-semibold text-[#004ac6]">₹{formattedTotalList}</span>
                        <span className="text-[10px] text-[#737686]">{formatDate(order.date)}</span>
                      </div>
                    </div>
                    {order.items && order.items.length > 1 && expandedOrders.has(order.id) && (
                      <div className="mt-1.5 ml-1 space-y-0.5">
                        {order.items.map((item, i) => (
                          <div key={i} className="text-xs text-[#434655]">
                            {getProductName(item.productId)} · {item.quantity} L
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
