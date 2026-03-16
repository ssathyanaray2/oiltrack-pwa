import { useState, useEffect } from "react";
import { Plus, Minus, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getProducts, updateProductStock } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product } from "../../lib/types";
import { products as mockProducts } from "../data/mockData";

export function Inventory() {
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    productId: string;
    productName: string;
    unit: string;
    action: "add" | "remove";
  } | null>(null);
  const [inputAmount, setInputAmount] = useState("");

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const data = await getProducts();
          setProducts(data);
          setCachedProducts(data);
        } catch (e) {
          console.error(e);
          const cached = getCachedProducts() as Product[] | null;
          setProducts(cached?.length ? cached : mockProducts);
        } finally {
          setLoading(false);
        }
      } else {
        const cached = getCachedProducts() as Product[] | null;
        setProducts(cached?.length ? cached : mockProducts);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const openModal = (productId: string, productName: string, unit: string, action: "add" | "remove") => {
    setModalData({ productId, productName, unit, action });
    setInputAmount("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
    setInputAmount("");
  };

  const handleConfirm = async () => {
    if (!modalData) return;

    const amount = parseInt(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const change = modalData.action === "add" ? amount : -amount;
    const product = products.find((p) => p.id === modalData.productId);
    const newStock = product ? Math.max(0, product.stock + change) : 0;

    if (isSupabaseConfigured() && isOnline) {
      try {
        const updated = await updateProductStock(modalData.productId, change);
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setCachedProducts(products.map((p) => (p.id === modalData.productId ? { ...p, stock: newStock } : p)));
        const action = change > 0 ? "added to" : "removed from";
        toast.success(`${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName}`);
      } catch (e) {
        toast.error("Failed to update stock");
        console.error(e);
      }
    } else {
      const next = products.map((p) =>
        p.id === modalData.productId ? { ...p, stock: newStock } : p
      );
      setProducts(next);
      setCachedProducts(next);
      const action = change > 0 ? "added to" : "removed from";
      toast.success(`${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName} (saved locally)`);
    }
    closeModal();
  };

  const getStockStatus = (stock: number, threshold: number) => {
    if (stock <= threshold * 0.5) {
      return { level: "critical", color: "text-destructive", bgColor: "bg-destructive/10", borderColor: "border-destructive" };
    } else if (stock <= threshold) {
      return { level: "low", color: "text-accent-foreground", bgColor: "bg-accent/20", borderColor: "border-accent" };
    }
    return { level: "normal", color: "text-primary", bgColor: "bg-primary/10", borderColor: "border-border" };
  };

  const lowStockProducts = products.filter((p) => p.stock <= p.lowStockThreshold);

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading inventory…</p>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl text-foreground mb-2">Inventory</h1>
        <p className="text-muted-foreground">Manage your stock levels</p>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-accent/20 border-2 border-accent rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-7 w-7 text-accent-foreground flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-accent-foreground mb-2">Low Stock Alert</h3>
              <p className="text-foreground">
                {lowStockProducts.length} {lowStockProducts.length === 1 ? "product needs" : "products need"} restocking:
              </p>
              <ul className="mt-2 space-y-1">
                {lowStockProducts.map((product) => (
                  <li key={product.id} className="text-foreground">
                    • {product.name}: <span className="font-medium">{product.stock} {product.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {products.map((product) => {
          const stockStatus = getStockStatus(product.stock, product.lowStockThreshold);
          return (
            <div
              key={product.id}
              className={`bg-card rounded-2xl p-6 shadow-md border-2 ${stockStatus.borderColor}`}
            >
              <div className="flex items-start gap-4">
                <div className={`${stockStatus.bgColor} p-4 rounded-xl`}>
                  <Package className={`h-8 w-8 ${stockStatus.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3>{product.name}</h3>
                    {stockStatus.level !== "normal" && (
                      <AlertTriangle className={`h-5 w-5 ${stockStatus.color} flex-shrink-0`} />
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className={`text-2xl ${stockStatus.color}`}>{product.stock}</p>
                    <p className="text-muted-foreground">{product.unit}</p>
                  </div>
                  {stockStatus.level !== "normal" && (
                    <p className={`text-sm mt-2 ${stockStatus.color}`}>
                      {stockStatus.level === "critical" ? "Critical: Restock immediately" : "Low stock: Restock soon"}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => openModal(product.id, product.name, product.unit, "remove")}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 px-6 flex items-center justify-center gap-2 transition-colors active:scale-95"
                >
                  <Minus className="h-6 w-6" />
                  <span>Remove</span>
                </button>
                <button
                  onClick={() => openModal(product.id, product.name, product.unit, "add")}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 px-6 flex items-center justify-center gap-2 transition-colors active:scale-95"
                >
                  <Plus className="h-6 w-6" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl border-2 border-border">
            <h2 className="text-2xl mb-2">
              {modalData.action === "add" ? "Add Stock" : "Remove Stock"}
            </h2>
            <p className="text-muted-foreground mb-6">{modalData.productName}</p>

            <label htmlFor="amount-input" className="block mb-3 text-foreground">
              Enter amount ({modalData.unit.toLowerCase()}):
            </label>
            <input
              id="amount-input"
              type="number"
              inputMode="numeric"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="w-full px-6 py-4 text-2xl rounded-xl border-2 border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-6"
              placeholder="0"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 px-6 transition-colors active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 px-6 transition-colors active:scale-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
