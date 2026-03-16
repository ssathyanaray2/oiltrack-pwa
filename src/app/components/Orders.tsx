import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getOrders, getProducts } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedOrders, getCachedProducts, setCachedOrders, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Order, Product } from "../../lib/types";
import { orders as mockOrders, products as mockProducts } from "../data/mockData";
import { Plus, Calendar, User, Package as PackageIcon, LayoutGrid, List, ArrowUpDown, Search, DollarSign } from "lucide-react";

type ViewMode = "card" | "list";
type SortOrder = "recent" | "oldest";
type StatusFilter = "All" | "Pending" | "Delivered" | "Cancelled";

export function Orders() {
  const isOnline = useOnlineStatus();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");

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
        return "bg-accent text-accent-foreground";
      case "Delivered":
        return "bg-primary/20 text-primary";
      case "Cancelled":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-primary/20 text-primary";
      case "Unpaid":
        return "bg-destructive/20 text-destructive";
      case "Partial":
        return "bg-accent/30 text-accent-foreground";
      default:
        return "bg-muted text-muted-foreground";
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
      return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
    });

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading orders…</p>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl text-foreground mb-2">Orders</h1>
        <p className="text-muted-foreground">View and manage orders</p>
      </div>

      <Link
        to="/orders/new"
        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl py-5 px-6 flex items-center justify-center gap-3 mb-6 shadow-md transition-all active:scale-[0.98] w-full"
      >
        <Plus className="h-7 w-7" />
        <span className="text-xl">New Order</span>
      </Link>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-6 py-4 rounded-xl border-2 border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div className="flex gap-3">
          <button
            onClick={() => setViewMode("card")}
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              viewMode === "card"
                ? "bg-primary text-primary-foreground"
                : "bg-card border-2 border-border text-foreground"
            }`}
          >
            <LayoutGrid className="h-5 w-5" />
            <span>Card View</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "bg-card border-2 border-border text-foreground"
            }`}
          >
            <List className="h-5 w-5" />
            <span>List View</span>
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setSortOrder(sortOrder === "recent" ? "oldest" : "recent")}
            className="flex-1 py-3 px-4 rounded-xl bg-card border-2 border-border text-foreground flex items-center justify-center gap-2 transition-colors hover:border-primary"
          >
            <ArrowUpDown className="h-5 w-5" />
            <span>{sortOrder === "recent" ? "Recent First" : "Oldest First"}</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["All", "Pending", "Delivered", "Cancelled"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`py-2 px-4 rounded-xl whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border-2 border-border text-foreground"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "card" ? (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const total = calculateOrderTotal(order.productId, order.quantity);
            return (
              <Link
                key={order.id}
                to={`/orders/edit/${order.id}`}
                className="block bg-card rounded-2xl p-6 shadow-md border-2 border-border hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex gap-2">
                    <span
                      className={`${getStatusColor(order.status)} px-4 py-2 rounded-xl inline-block`}
                    >
                      {order.status}
                    </span>
                    <span
                      className={`${getPaymentStatusColor(order.paymentStatus)} px-4 py-2 rounded-xl inline-block`}
                    >
                      {order.paymentStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-5 w-5" />
                    <span>{formatDate(order.date)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <User className="h-6 w-6 text-primary" />
                  <h3>{order.customerName}</h3>
                </div>

                <div className="flex items-center gap-3 text-muted-foreground mb-3">
                  <PackageIcon className="h-6 w-6" />
                  <span>
                    {getProductName(order.productId)} - {order.quantity} liters
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <DollarSign className="h-6 w-6 text-primary" />
                  <span className="text-xl text-foreground font-medium">${total.toFixed(2)}</span>
                </div>

                {order.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-muted-foreground italic">{order.notes}</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const total = calculateOrderTotal(order.productId, order.quantity);
            return (
              <Link
                key={order.id}
                to={`/orders/edit/${order.id}`}
                className="block bg-card rounded-xl p-4 shadow border-2 border-border hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="font-medium truncate">{order.customerName}</h3>
                  <div className="flex gap-2">
                    <span
                      className={`${getStatusColor(order.status)} px-3 py-1 rounded-lg text-sm whitespace-nowrap`}
                    >
                      {order.status}
                    </span>
                    <span
                      className={`${getPaymentStatusColor(order.paymentStatus)} px-3 py-1 rounded-lg text-sm whitespace-nowrap`}
                    >
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span className="truncate">
                    {getProductName(order.productId)} ({order.quantity}L)
                  </span>
                  <span className="whitespace-nowrap font-medium text-foreground">
                    ${total.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDate(order.date)}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">No orders found</p>
          <p className="text-muted-foreground mt-2">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
