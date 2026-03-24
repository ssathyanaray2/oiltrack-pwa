import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { monthlySales as mockMonthlySales, inventoryLevels as mockInventoryLevels } from "../data/mockData";
import { getProducts, getOrders } from "../../lib/api";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, getCachedOrders, getCachedDashboard, setCachedProducts, setCachedOrders, setCachedDashboard } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product, Order } from "../../lib/types";
import { TrendingUp, ShoppingCart, AlertTriangle, Package, IndianRupee, KeyRound, LogOut, ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonthlySalesFromOrders(orders: Order[], products: Product[]): { month: string; sales: number }[] {
  const byMonth: Record<string, number> = {};
  MONTHS.forEach((m) => (byMonth[m] = 0));
  orders.forEach((order) => {
    if (order.status !== "Cancelled") {
      const product = products.find((p) => p.id === order.productId);
      if (product) {
        const monthKey = new Date(order.date).toLocaleString("en-US", { month: "short" });
        byMonth[monthKey] = (byMonth[monthKey] ?? 0) + product.pricePerLiter * order.quantity;
      }
    }
  });
  return MONTHS.map((month) => ({ month, sales: Math.round(byMonth[month] ?? 0) }));
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userName, setUserName] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? "";
      setUserName(email.split("@")[0]);
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut();
    }
  };

  const handleChangePassword = async () => {
    if (!isSupabaseConfigured() || !supabase) return;
    setChangingPassword(true);
    try {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      if (!email) return;
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
      setShowProfileMenu(false);
    } catch (err) {
      toast.error("Failed to send reset email");
      console.error(err);
    } finally {
      setChangingPassword(false);
    }
  };
  const [monthlySales, setMonthlySales] = useState<{ month: string; sales: number }[]>(mockMonthlySales);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [productsData, ordersData] = await Promise.all([getProducts(), getOrders()]);
          setProducts(productsData);
          setOrders(ordersData);
          const sales = buildMonthlySalesFromOrders(ordersData, productsData);
          setMonthlySales(sales.length ? sales : mockMonthlySales);
          setCachedProducts(productsData);
          setCachedOrders(ordersData);
          setCachedDashboard({ monthlySales: sales, inventoryLevels: mockInventoryLevels });
        } catch (e) {
          console.error(e);
          const cachedProducts = getCachedProducts() as Product[] | null;
          const cachedOrders = getCachedOrders() as Order[] | null;
          const cachedDash = getCachedDashboard();
          if (cachedProducts?.length) setProducts(cachedProducts);
          if (cachedOrders?.length) setOrders(cachedOrders);
          if (cachedDash?.monthlySales?.length) setMonthlySales(cachedDash.monthlySales as { month: string; sales: number }[]);
        } finally {
          setLoading(false);
        }
      } else {
        const cachedProducts = getCachedProducts() as Product[] | null;
        const cachedOrders = getCachedOrders() as Order[] | null;
        const cachedDash = getCachedDashboard();
        setProducts(cachedProducts?.length ? cachedProducts : []);
        setOrders(cachedOrders?.length ? cachedOrders : []);
        setMonthlySales(
          cachedDash?.monthlySales?.length
            ? (cachedDash.monthlySales as { month: string; sales: number }[])
            : mockMonthlySales
        );
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const pendingOrders = orders.filter((o) => o.status === "Pending");
  const deliveredOrders = orders.filter((o) => o.status === "Delivered");
  const lowStockItems = products.filter((p) => p.stock <= p.lowStockThreshold);
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const totalRevenue = orders
    .filter((o) => o.status !== "Cancelled")
    .reduce((sum, order) => {
      const product = products.find((p) => p.id === order.productId);
      return sum + (product ? product.pricePerLiter * order.quantity : 0);
    }, 0);

  const maxStock = Math.max(...products.map((p) => p.stock), 1);
  const recentOrders = [...orders].reverse().slice(0, 3);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center">
        <p className="text-[#434655] font-medium">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-28">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#faf8ff] px-5 py-4 flex items-center justify-between shadow-[0_1px_0_#c3c6d7]">
        <div>
          <span className="text-xl font-bold text-[#131b2e] tracking-tight">OilTrack</span>
        </div>
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu((v) => !v)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity active:scale-95"
          >
            <div className="w-9 h-9 rounded-full bg-[#eaedff] flex items-center justify-center">
              <span className="text-sm font-bold text-[#004ac6]">
                {userName ? userName[0].toUpperCase() : "?"}
              </span>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-[#434655] transition-transform duration-200 ${showProfileMenu ? "rotate-180" : ""}`} />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,74,198,0.12)] border border-[#e2e7ff] z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-[#f2f3ff]">
                <p className="text-xs text-[#737686] font-medium">Signed in as</p>
                <p className="text-sm font-bold text-[#131b2e] truncate">{userName}</p>
              </div>

              {/* Change Password */}
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-[#131b2e] hover:bg-[#f2f3ff] transition-colors disabled:opacity-60"
              >
                <div className="w-7 h-7 rounded-lg bg-[#eaedff] flex items-center justify-center">
                  <KeyRound className="h-3.5 w-3.5 text-[#004ac6]" />
                </div>
                {changingPassword ? "Sending email…" : "Change Password"}
              </button>

              {/* Sign Out */}
              {isSupabaseConfigured() && (
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-[#ba1a1a] hover:bg-red-50 transition-colors border-t border-[#f2f3ff]"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                    <LogOut className="h-3.5 w-3.5 text-[#ba1a1a]" />
                  </div>
                  Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="px-5 pt-5 space-y-6 max-w-2xl mx-auto">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#131b2e] break-words">
            {getGreeting()}{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-sm text-[#434655] mt-0.5">Here is your business overview for today.</p>
        </div>

        {/* KPI Grid */}
        <section className="grid grid-cols-2 gap-3">
          {/* Total Revenue */}
          <div className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">Total Revenue</span>
              <IndianRupee className="h-5 w-5 text-[#2563eb] flex-shrink-0" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[#2563eb] truncate">
                ₹{totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-[10px] text-green-600 font-bold">{deliveredOrders.length} delivered</span>
              </div>
            </div>
          </div>

          {/* Orders */}
          <Link
            to="/orders"
            className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] hover:shadow-[0_6px_20px_rgba(0,74,198,0.1)] transition-shadow"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">Orders</span>
              <ShoppingCart className="h-5 w-5 text-[#004ac6]" />
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-[#131b2e]">{orders.length}</div>
              <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                {pendingOrders.length} PENDING
              </div>
            </div>
          </Link>

          {/* Total Stock */}
          <Link
            to="/inventory"
            className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] hover:shadow-[0_6px_20px_rgba(0,74,198,0.1)] transition-shadow"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">Total Stock</span>
              <Package className="h-5 w-5 text-[#495c95]" />
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-[#131b2e]">
                {totalStock.toLocaleString()} <span className="text-sm font-normal text-[#434655]">units</span>
              </div>
              <div className="h-1.5 w-full bg-[#dae2fd] rounded-full mt-2 overflow-hidden">
                <div className="bg-[#004ac6] h-full rounded-full" style={{ width: "72%" }} />
              </div>
            </div>
          </Link>

          {/* Low Stock Alerts */}
          <Link
            to="/inventory"
            className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] hover:shadow-[0_6px_20px_rgba(0,74,198,0.1)] transition-shadow"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#ba1a1a]">Alerts</span>
              <AlertTriangle className="h-5 w-5 text-[#ba1a1a]" fill="currentColor" />
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-[#131b2e]">{lowStockItems.length}</div>
              <p className="text-[10px] text-[#434655] mt-1">
                {lowStockItems.length === 0 ? "All stocked up" : "Low / critical items"}
              </p>
            </div>
          </Link>
        </section>

        {/* Stock Overview */}
        {products.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#131b2e] tracking-tight">Stock Overview</h2>
              <Link to="/inventory" className="text-xs font-bold text-[#2563eb] uppercase tracking-wide">View all</Link>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] space-y-4">
              {products.slice(0, 4).map((product) => {
                const barPercent = Math.round((product.stock / maxStock) * 100);
                const isCritical = product.stock <= product.lowStockThreshold * 0.5;
                const isLow = !isCritical && product.stock <= product.lowStockThreshold;
                const barColor = isCritical ? "#ba1a1a" : isLow ? "#943700" : "#004ac6";
                return (
                  <div key={product.id} className="space-y-1.5">
                    <div className="flex justify-between gap-2 text-xs font-semibold uppercase tracking-wide">
                      <span className={`truncate min-w-0 ${isCritical ? "text-[#ba1a1a]" : isLow ? "text-[#943700]" : "text-[#434655]"}`}>
                        {product.name}{isCritical ? " (Critical)" : isLow ? " (Low)" : ""}
                      </span>
                      <span className="text-[#131b2e] flex-shrink-0">{barPercent}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-[#dae2fd] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${barPercent}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#131b2e] tracking-tight">Recent Orders</h2>
              <Link to="/orders" className="text-xs font-bold text-[#2563eb] hover:underline">View all</Link>
            </div>
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const product = products.find((p) => p.id === order.productId);
                const statusColor =
                  order.status === "Delivered"
                    ? { border: "#22c55e", bg: "bg-green-100", text: "text-green-700" }
                    : order.status === "Cancelled"
                    ? { border: "#ba1a1a", bg: "bg-red-100", text: "text-red-700" }
                    : { border: "#943700", bg: "bg-orange-100", text: "text-orange-700" };
                const amount = product ? product.pricePerLiter * order.quantity : 0;
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl p-4 flex items-center justify-between gap-3 shadow-[0_2px_8px_rgba(0,74,198,0.04)] border-l-4"
                    style={{ borderLeftColor: statusColor.border }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#eaedff] flex items-center justify-center flex-shrink-0">
                        <ShoppingCart className="h-4 w-4 text-[#434655]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#131b2e] truncate">{order.customerName}</p>
                        <p className="text-xs text-[#434655] truncate">
                          {product?.name ?? "Product"}, {order.quantity} {product?.unit ?? "units"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm text-[#131b2e]">₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor.bg} ${statusColor.text}`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Monthly Sales Chart */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <h2 className="text-base font-bold text-[#131b2e] tracking-tight mb-5">Monthly Sales</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e7ff" />
              <XAxis dataKey="month" stroke="#434655" style={{ fontSize: "11px" }} />
              <YAxis stroke="#434655" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #c3c6d7",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontFamily: "Plus Jakarta Sans, sans-serif",
                }}
                formatter={(value: number) => [`₹${value.toLocaleString()}`, "Sales"]}
              />
              <Bar dataKey="sales" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </main>
    </div>
  );
}
