import React, { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { monthlySales as mockMonthlySales, inventoryLevels as mockInventoryLevels } from "../data/mockData";
import { getProducts, getOrders } from "../../lib/api";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, getCachedOrders, getCachedDashboard, setCachedProducts, setCachedOrders, setCachedDashboard } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product, Order } from "../../lib/types";
import { TrendingUp, ShoppingCart, AlertTriangle, Package, IndianRupee, KeyRound, LogOut, ChevronDown, ChevronLeft, ChevronRight, UserX } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PIE_COLORS = ["#2563eb", "#004ac6", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#9333ea"];

type ChartMode = "sales" | "profit" | "customers";

function buildMonthlyData(orders: Order[], products: Product[], mode: ChartMode, year: number): { month: string; value: number }[] {
  if (mode === "customers") {
    const byMonth: Record<string, Set<string>> = {};
    MONTHS.forEach((m) => (byMonth[m] = new Set()));
    orders.forEach((order) => {
      if (order.status !== "Packed" && order.status !== "Delivered") return;
      if (new Date(order.date).getFullYear() !== year) return;
      const monthKey = new Date(order.date).toLocaleString("en-US", { month: "short" });
      if (order.customerId) byMonth[monthKey].add(order.customerId);
    });
    return MONTHS.map((month) => ({ month, value: byMonth[month].size }));
  }

  const byMonth: Record<string, number> = {};
  MONTHS.forEach((m) => (byMonth[m] = 0));
  orders.forEach((order) => {
    if (order.status !== "Packed" && order.status !== "Delivered") return;
    if (new Date(order.date).getFullYear() !== year) return;
    const monthKey = new Date(order.date).toLocaleString("en-US", { month: "short" });
    const items = order.items?.length
      ? order.items
      : [{ productId: order.productId, quantity: order.quantity }];
    items.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      const unitPrice = item.unitPrice || product?.pricePerLiter || 0;
      const costPrice = item.costPrice || product?.costPrice || 0;
      const perUnit = mode === "profit"
        ? Math.max(0, unitPrice - costPrice)
        : unitPrice;
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + perUnit * item.quantity;
    });
  });
  return MONTHS.map((month) => ({ month, value: Math.round(byMonth[month] ?? 0) }));
}

function buildProductVolume(orders: Order[], products: Product[], year: number): { name: string; value: number }[] {
  const byProduct: Record<string, number> = {};
  orders.forEach((order) => {
    if (order.status !== "Packed" && order.status !== "Delivered") return;
    if (new Date(order.date).getFullYear() !== year) return;
    const items = order.items?.length
      ? order.items
      : [{ productId: order.productId, quantity: order.quantity }];
    items.forEach((item) => {
      byProduct[item.productId] = (byProduct[item.productId] ?? 0) + item.quantity;
    });
  });
  return products
    .map((p) => ({ name: p.name, value: Math.round(byProduct[p.id] ?? 0) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
}

function getLostCustomers(orders: Order[]): { customerId: string; customerName: string; lastOrderDate: Date; monthsAgo: number }[] {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const lastOrder = new Map<string, { date: Date; customerName: string }>();
  orders.forEach((order) => {
    if (order.status === "Cancelled" || !order.customerId) return;
    const existing = lastOrder.get(order.customerId);
    const d = new Date(order.date);
    if (!existing || d > existing.date) {
      lastOrder.set(order.customerId, { date: d, customerName: order.customerName });
    }
  });
  const lost: { customerId: string; customerName: string; lastOrderDate: Date; monthsAgo: number }[] = [];
  lastOrder.forEach(({ date, customerName }, customerId) => {
    if (date < sixMonthsAgo) {
      const monthsAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30));
      lost.push({ customerId, customerName, lastOrderDate: date, monthsAgo });
    }
  });
  return lost.sort((a, b) => a.lastOrderDate.getTime() - b.lastOrderDate.getTime());
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
  const [chartMode, setChartMode] = useState<ChartMode>("sales");
  const [showChartDropdown, setShowChartDropdown] = useState(false);
  const [showInactiveCustomers, setShowInactiveCustomers] = useState(false);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [pieYear, setPieYear] = useState(new Date().getFullYear());
  const availableYears = useMemo(() => {
    const years = new Set(orders.map((o) => new Date(o.date).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [orders]);
  const profileRef = useRef<HTMLDivElement>(null);
  const chartDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? "";
      setUserName(email.split("@")[0]);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setShowProfileMenu(false);
      if (chartDropdownRef.current && !chartDropdownRef.current.contains(e.target as Node))
        setShowChartDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    if (isSupabaseConfigured() && supabase) await supabase.auth.signOut();
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
          const sales = buildMonthlyData(ordersData, productsData, "sales", new Date().getFullYear()).map((d) => ({ month: d.month, sales: d.value }));
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
  const lowStockItems = products.filter((p) => p.stock === 0 || p.stock < p.lowStockThreshold);
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const totalRevenue = orders
    .filter((o) => {
      if (o.status !== "Packed" && o.status !== "Delivered") return false;
      return new Date(o.date).getFullYear() === thisYear;
    })
    .reduce((sum, order) => {
      const items = order.items?.length
        ? order.items
        : [{ productId: order.productId, quantity: order.quantity }];
      return sum + items.reduce((s, item) => {
        const unitPrice = item.unitPrice ?? products.find((p) => p.id === item.productId)?.pricePerLiter ?? 0;
        return s + unitPrice * item.quantity;
      }, 0);
    }, 0);


  const monthName = now.toLocaleString("en-US", { month: "long" });
  const monthlyOrders = orders.filter((o) => {
    if (o.status !== "Packed" && o.status !== "Delivered") return false;
    const d = new Date(o.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const monthlyRevenue = monthlyOrders.reduce((sum, order) => {
    const items = order.items?.length
      ? order.items
      : [{ productId: order.productId, quantity: order.quantity }];
    return sum + items.reduce((s, item) => {
      const unitPrice = item.unitPrice ?? products.find((p) => p.id === item.productId)?.pricePerLiter ?? 0;
      return s + unitPrice * item.quantity;
    }, 0);
  }, 0);
  const monthlyPendingOrders = orders.filter((o) => {
    if (o.status !== "Pending") return false;
    const d = new Date(o.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const monthlyLiters = monthlyOrders.reduce((sum, order) => {
    const items = order.items?.length
      ? order.items
      : [{ productId: order.productId, quantity: order.quantity }];
    return sum + items.reduce((s, item) => s + item.quantity, 0);
  }, 0);


  const recentOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateB - dateA;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return createdB - createdA;
  }).slice(0, 3);

  const chartData = buildMonthlyData(orders, products, chartMode, chartYear);
  const productVolume = buildProductVolume(orders, products, pieYear);
  const lostCustomers = getLostCustomers(orders);

  const chartLabels: Record<ChartMode, string> = {
    sales: "Monthly Sales",
    profit: "Monthly Profit",
    customers: "Active Customers",
  };
  const chartColors: Record<ChartMode, string> = {
    sales: "#2563eb",
    profit: "#059669",
    customers: "#7c3aed",
  };
  const chartFormatter = (value: number) => {
    if (chartMode === "customers") return [`${value} customers`, "Active Customers"];
    return [`₹${value.toLocaleString("en-IN")}`, chartMode === "profit" ? "Profit" : "Sales"];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] pb-28 animate-pulse">
        <div className="sticky top-0 z-50 bg-[#faf8ff] px-5 py-4 flex items-center justify-between shadow-[0_1px_0_#c3c6d7]">
          <div className="h-6 w-24 bg-[#e2e7ff] rounded-full" />
          <div className="w-9 h-9 rounded-full bg-[#e2e7ff]" />
        </div>
        <div className="px-5 pt-5 space-y-6 max-w-2xl mx-auto">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-[#e2e7ff] rounded-full" />
            <div className="h-4 w-64 bg-[#e2e7ff] rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 min-h-[110px] flex flex-col justify-between shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
                <div className="h-3 w-20 bg-[#e2e7ff] rounded-full" />
                <div className="space-y-2">
                  <div className="h-8 w-24 bg-[#e2e7ff] rounded-full" />
                  <div className="h-3 w-16 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] space-y-4">
            <div className="h-4 w-32 bg-[#e2e7ff] rounded-full" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-28 bg-[#e2e7ff] rounded-full" />
                <div className="h-2.5 w-full bg-[#e2e7ff] rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-4 w-28 bg-[#e2e7ff] rounded-full" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 flex items-center justify-between shadow-[0_2px_8px_rgba(0,74,198,0.04)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#e2e7ff]" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-28 bg-[#e2e7ff] rounded-full" />
                    <div className="h-3 w-20 bg-[#e2e7ff] rounded-full" />
                  </div>
                </div>
                <div className="space-y-1.5 items-end flex flex-col">
                  <div className="h-3.5 w-16 bg-[#e2e7ff] rounded-full" />
                  <div className="h-5 w-14 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <div className="h-4 w-32 bg-[#e2e7ff] rounded-full mb-5" />
            <div className="h-[220px] w-full bg-[#e2e7ff] rounded-xl" />
          </div>
        </div>
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
              <div className="px-4 py-3 border-b border-[#f2f3ff]">
                <p className="text-xs text-[#737686] font-medium">Signed in as</p>
                <p className="text-sm font-bold text-[#131b2e] truncate">{userName}</p>
              </div>
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
          <div className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">{thisYear} Revenue</span>
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

          <Link
            to="/orders"
            className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] hover:shadow-[0_6px_20px_rgba(0,74,198,0.1)] transition-shadow"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">{monthName} Orders</span>
              <ShoppingCart className="h-5 w-5 text-[#004ac6]" />
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-[#131b2e]">{monthlyOrders.length}</div>
              <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                {monthlyPendingOrders.length} PENDING
              </div>
            </div>
          </Link>

          {/* Monthly Revenue */}
          <div className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">{monthName} Revenue</span>
              <IndianRupee className="h-5 w-5 text-[#059669] flex-shrink-0" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[#059669] truncate">
                ₹{monthlyRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-[#737686] mt-1">{monthlyOrders.length} orders this month</p>
            </div>
          </div>

          {/* Monthly Liters Sold */}
          <div className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)] flex flex-col justify-between min-h-[110px] overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#434655]">{monthName} Volume</span>
              <Package className="h-5 w-5 text-[#7c3aed] flex-shrink-0" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[#7c3aed] truncate">
                {monthlyLiters.toLocaleString("en-IN")} <span className="text-sm font-normal text-[#434655]">L</span>
              </div>
              <p className="text-[10px] text-[#737686] mt-1">Litres sold this month</p>
            </div>
          </div>

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
                    : order.status === "Packed"
                    ? { border: "#2563eb", bg: "bg-blue-100", text: "text-blue-700" }
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

        {/* Monthly Chart with dropdown */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-[#131b2e] tracking-tight">{chartLabels[chartMode]}</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-xl px-1 py-1">
                <button
                  onClick={() => setChartYear((y) => y - 1)}
                  className="p-1 rounded-lg hover:bg-[#e2e7ff] transition-colors active:scale-95"
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-[#434655]" />
                </button>
                <span className="text-xs font-bold text-[#131b2e] w-9 text-center">{chartYear}</span>
                <button
                  onClick={() => setChartYear((y) => y + 1)}
                  disabled={chartYear >= new Date().getFullYear()}
                  className="p-1 rounded-lg hover:bg-[#e2e7ff] transition-colors active:scale-95 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-[#434655]" />
                </button>
              </div>
              <div className="relative" ref={chartDropdownRef}>
                <button
                  onClick={() => setShowChartDropdown((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#434655] hover:bg-[#eaedff] rounded-xl px-3 py-1.5 transition-colors"
                >
                  {chartLabels[chartMode]}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showChartDropdown ? "rotate-180" : ""}`} />
                </button>
                {showChartDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-[0_8px_24px_rgba(0,74,198,0.12)] border border-[#e2e7ff] z-10 overflow-hidden">
                    {(["sales", "profit", "customers"] as ChartMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => { setChartMode(mode); setShowChartDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          chartMode === mode
                            ? "bg-[#eaedff] text-[#004ac6] font-semibold"
                            : "text-[#434655] hover:bg-[#f2f3ff]"
                        }`}
                      >
                        {chartLabels[mode]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {chartData.every((d) => d.value === 0) ? (
            <div className="h-[220px] flex items-center justify-center">
              <p className="text-sm text-[#737686]">No data available for {chartYear}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
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
                  formatter={chartFormatter}
                />
                <Bar dataKey="value" fill={chartColors[chartMode]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-[#737686] text-center mt-2">
            {chartYear} · {chartMode === "customers" ? "Unique customers with orders" : "Packed & delivered orders only"}
          </p>
        </section>

        {/* Product Volume Pie Chart */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-base font-bold text-[#131b2e] tracking-tight">Product Volume Sold</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPieYear((y) => y - 1)}
                className="p-1 rounded-lg hover:bg-[#f2f3ff] transition-colors active:scale-95"
              >
                <ChevronLeft className="h-4 w-4 text-[#434655]" />
              </button>
              <span className="text-xs font-bold text-[#131b2e] w-10 text-center">{pieYear}</span>
              <button
                onClick={() => setPieYear((y) => y + 1)}
                disabled={pieYear >= new Date().getFullYear()}
                className="p-1 rounded-lg hover:bg-[#f2f3ff] transition-colors active:scale-95 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4 text-[#434655]" />
              </button>
            </div>
          </div>
          <p className="text-xs text-[#737686] mb-4">Total litres sold per product</p>
          {productVolume.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-sm text-[#737686]">No data available for {pieYear}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={productVolume}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {productVolume.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #c3c6d7",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                  }}
                  formatter={(value: number, name: string) => [`${value.toLocaleString("en-IN")} L`, name]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ fontSize: "11px", color: "#434655" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Lost Customers */}
        {lostCustomers.length > 0 && (
          <section className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden">
            <button
              onClick={() => setShowInactiveCustomers((v) => !v)}
              className="w-full flex items-center gap-2 px-5 py-4 hover:bg-[#f2f3ff] transition-colors"
            >
              <UserX className="h-4 w-4 text-[#ba1a1a] flex-shrink-0" />
              <h2 className="text-base font-bold text-[#131b2e] tracking-tight">Inactive Customers</h2>
              <span className="text-xs font-semibold text-[#ba1a1a] bg-red-50 px-2 py-0.5 rounded-full">
                {lostCustomers.length}
              </span>
              <ChevronDown className={`h-4 w-4 text-[#737686] ml-auto transition-transform duration-200 ${showInactiveCustomers ? "rotate-180" : ""}`} />
            </button>

            {showInactiveCustomers && (
              <>
                <p className="text-xs text-[#737686] px-5 pb-3">No orders in the last 6 months</p>
                <div className="border-t border-[#f2f3ff]">
                  {lostCustomers.map((c, i) => (
                    <Link
                      key={c.customerId}
                      to={`/customers/${c.customerId}`}
                      className={`flex items-center justify-between px-4 py-3.5 hover:bg-[#f2f3ff] transition-colors ${
                        i < lostCustomers.length - 1 ? "border-b border-[#f2f3ff]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#ba1a1a]">
                            {c.customerName[0]?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#131b2e] truncate">{c.customerName}</p>
                          <p className="text-xs text-[#737686]">
                            Last order: {c.lastOrderDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#ba1a1a] bg-red-50 px-2 py-1 rounded-full flex-shrink-0 ml-2">
                        {c.monthsAgo}mo ago
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
