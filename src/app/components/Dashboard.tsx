import React, { useState, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { monthlySales as mockMonthlySales, inventoryLevels as mockInventoryLevels } from "../data/mockData";
import { getProducts, getOrders } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, getCachedOrders, getCachedDashboard, setCachedProducts, setCachedOrders, setCachedDashboard } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product, Order } from "../../lib/types";
import { TrendingUp, DollarSign, ShoppingCart, AlertTriangle } from "lucide-react";
import { Link } from "react-router";

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

export function Dashboard() {
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [monthlySales, setMonthlySales] = useState<{ month: string; sales: number }[]>(mockMonthlySales);
  const [inventoryLevels, setInventoryLevels] = useState(mockInventoryLevels);
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
          setInventoryLevels(mockInventoryLevels);
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
          if (cachedDash?.inventoryLevels?.length) setInventoryLevels(cachedDash.inventoryLevels as { month: string; level: number }[]);
        } finally {
          setLoading(false);
        }
      } else {
        const cachedProducts = getCachedProducts() as Product[] | null;
        const cachedOrders = getCachedOrders() as Order[] | null;
        const cachedDash = getCachedDashboard();
        if (cachedProducts?.length) setProducts(cachedProducts);
        else setProducts([]);
        if (cachedOrders?.length) setOrders(cachedOrders);
        else setOrders([]);
        if (cachedDash?.monthlySales?.length) setMonthlySales(cachedDash.monthlySales as { month: string; sales: number }[]);
        else setMonthlySales(mockMonthlySales);
        if (cachedDash?.inventoryLevels?.length) setInventoryLevels(cachedDash.inventoryLevels as { month: string; level: number }[]);
        else setInventoryLevels(mockInventoryLevels);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const annualSales = monthlySales.reduce((sum, month) => sum + month.sales, 0);
  const pendingOrders = orders.filter((o) => o.status === "Pending");
  const pendingOrdersCount = pendingOrders.length;
  const lowStockItems = products.filter((p) => p.stock <= p.lowStockThreshold);
  const totalRevenue = orders
    .filter((o) => o.status !== "Cancelled")
    .reduce((sum, order) => {
      const product = products.find((p) => p.id === order.productId);
      return sum + (product ? product.pricePerLiter * order.quantity : 0);
    }, 0);

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Your business overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/orders"
          className="bg-card rounded-2xl p-5 shadow-md border-2 border-border hover:border-primary transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-5 w-5 text-accent-foreground" />
            <h3 className="text-sm text-muted-foreground">Pending Orders</h3>
          </div>
          <p className="text-3xl text-accent-foreground">{pendingOrdersCount}</p>
        </Link>

        <Link
          to="/inventory"
          className="bg-card rounded-2xl p-5 shadow-md border-2 border-border hover:border-primary transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-sm text-muted-foreground">Low Stock Items</h3>
          </div>
          <p className="text-3xl text-destructive">{lowStockItems.length}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-3 rounded-xl">
              <DollarSign className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-muted-foreground">Total Revenue (Current Orders)</h3>
          </div>
          <p className="text-3xl mt-3">${totalRevenue.toFixed(2)}</p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-accent/30 p-3 rounded-xl">
              <TrendingUp className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-muted-foreground">Annual Sales (Projected)</h3>
          </div>
          <p className="text-3xl mt-3">${annualSales.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
        <h3 className="mb-6">Monthly Sales</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#D4A574" opacity={0.3} />
            <XAxis dataKey="month" stroke="#6B5444" style={{ fontSize: "14px" }} />
            <YAxis stroke="#6B5444" style={{ fontSize: "14px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "2px solid #D4A574",
                borderRadius: "12px",
                fontSize: "16px",
              }}
              formatter={(value: number) => `$${value.toLocaleString()}`}
            />
            <Bar dataKey="sales" fill="#C87D3A" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
        <h3 className="mb-6">Inventory Levels</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={inventoryLevels}>
            <CartesianGrid strokeDasharray="3 3" stroke="#D4A574" opacity={0.3} />
            <XAxis dataKey="month" stroke="#6B5444" style={{ fontSize: "14px" }} />
            <YAxis stroke="#6B5444" style={{ fontSize: "14px" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "2px solid #D4A574",
                borderRadius: "12px",
                fontSize: "16px",
              }}
              formatter={(value: number) => `${value.toLocaleString()} L`}
            />
            <Line
              type="monotone"
              dataKey="level"
              stroke="#C87D3A"
              strokeWidth={3}
              dot={{ fill: "#C87D3A", r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
