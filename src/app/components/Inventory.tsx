import { useState, useEffect, useRef } from "react";
import { Plus, Minus, Package, AlertTriangle, Pencil, ImageUp, TrendingUp, TrendingDown, Minus as MinusIcon } from "lucide-react";
import { toast } from "sonner";
import { getProducts, updateProductStock, updateProductUnitPrice, updateProductCostPrice } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { extractPricesFromImage, type PriceChange } from "../../lib/priceAnalysis";
import type { Product } from "../../lib/types";
import { products as mockProducts } from "../data/mockData";
import React from "react";

export function Inventory() {
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    productId: string;
    productName: string;
    unit: string;
    action: "add" | "remove" | "pricePerLiter" | "costPrice";
  } | null>(null);
  const [inputAmount, setInputAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Price-update-from-image state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [applyingPrices, setApplyingPrices] = useState(false);

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

  const openModal = (
    productId: string,
    productName: string,
    unit: string,
    action: "add" | "remove" | "pricePerLiter" | "costPrice"
  ) => {
    setModalData({ productId, productName, unit, action });
    setInputAmount("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
    setInputAmount("");
    setConfirming(false);
  };

  // ── CONFIRM HANDLER ───────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!modalData || confirming) return;
    setConfirming(true);
    try {

    // ── PRICE PER LITER UPDATE ──────────────────────────────────────
    if (modalData.action === "pricePerLiter") {
      const newPrice = parseFloat(inputAmount);
      if (isNaN(newPrice) || newPrice <= 0) {
        toast.error("Please enter a valid price");
        return;
      }

      if (isSupabaseConfigured() && isOnline) {
        try {
          const updated = await updateProductUnitPrice(modalData.productId, newPrice);
          setProducts((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
          );
          setCachedProducts(
            products.map((p) =>
              p.id === modalData.productId ? { ...p, pricePerLiter: newPrice } : p
            )
          );
          toast.success(`Price updated to ₹${newPrice} for ${modalData.productName}`);
        } catch (e) {
          toast.error("Failed to update price");
          console.error(e);
        }
      } else {
        // Offline: update locally
        const next = products.map((p) =>
          p.id === modalData.productId ? { ...p, pricePerLiter: newPrice } : p
        );
        setProducts(next);
        setCachedProducts(next);
        toast.success(`Price updated to ₹${newPrice} (saved locally)`);
      }

      closeModal();
      return;
    }

    // ── COST PRICE UPDATE ───────────────────────────────────────────
    if (modalData.action === "costPrice") {
      const newPrice = parseFloat(inputAmount);
      if (isNaN(newPrice) || newPrice <= 0) {
        toast.error("Please enter a valid price");
        return;
      }
      if (isSupabaseConfigured() && isOnline) {
        try {
          const updated = await updateProductCostPrice(modalData.productId, newPrice);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setCachedProducts(
            products.map((p) =>
              p.id === modalData.productId ? { ...p, costPrice: newPrice } : p
            )
          );
          toast.success(`Cost price updated to ₹${newPrice} for ${modalData.productName}`);
        } catch (e) {
          toast.error("Failed to update cost price");
          console.error(e);
        }
      } else {
        const next = products.map((p) =>
          p.id === modalData.productId ? { ...p, costPrice: newPrice } : p
        );
        setProducts(next);
        setCachedProducts(next);
        toast.success(`Cost price updated to ₹${newPrice} (saved locally)`);
      }
      closeModal();
      return;
    }

    // ── STOCK ADD / REMOVE ──────────────────────────────────────────
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
        setCachedProducts(
          products.map((p) =>
            p.id === modalData.productId ? { ...p, stock: newStock } : p
          )
        );
        const action = change > 0 ? "added to" : "removed from";
        toast.success(
          `${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName}`
        );
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
      toast.success(
        `${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName} (saved locally)`
      );
    }
    closeModal();
    } finally {
      setConfirming(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;

    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supported.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, WebP, or GIF image");
      return;
    }

    setAnalyzing(true);
    toast.loading("Reading price list…", { id: "price-analysis" });

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip the data:image/...;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const changes = await extractPricesFromImage(
        base64,
        file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        products
      );

      toast.dismiss("price-analysis");

      if (changes.length === 0) {
        toast.info("No matching products or price changes found in the image");
        return;
      }

      setPriceChanges(changes);
      setShowPriceModal(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to analyse image — check your API key and try again", { id: "price-analysis" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyPrices = async () => {
    setApplyingPrices(true);
    try {
      const changedOnly = priceChanges.filter((c) => c.newPrice !== c.currentPrice);
      for (const change of changedOnly) {
        if (isSupabaseConfigured() && isOnline) {
          const updated = await updateProductUnitPrice(change.productId, change.newPrice);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else {
          setProducts((prev) =>
            prev.map((p) => (p.id === change.productId ? { ...p, pricePerLiter: change.newPrice } : p))
          );
        }
      }
      const next = products.map((p) => {
        const change = changedOnly.find((c) => c.productId === p.id);
        return change ? { ...p, pricePerLiter: change.newPrice } : p;
      });
      setCachedProducts(next);
      toast.success(`Updated prices for ${changedOnly.length} product${changedOnly.length > 1 ? "s" : ""}`);
      setShowPriceModal(false);
      setPriceChanges([]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to apply some price updates");
    } finally {
      setApplyingPrices(false);
    }
  };

  const getStockStatus = (stock: number, threshold: number) => {
    if (stock <= threshold * 0.5) {
      return {
        level: "critical",
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        borderColor: "border-destructive",
      };
    } else if (stock <= threshold) {
      return {
        level: "low",
        color: "text-accent-foreground",
        bgColor: "bg-accent/20",
        borderColor: "border-accent",
      };
    }
    return {
      level: "normal",
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-border",
    };
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl text-foreground mb-2">Inventory</h1>
            <p className="text-muted-foreground">Manage your stock levels</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl px-4 py-3 text-sm font-medium transition-colors active:scale-95 disabled:opacity-60 shrink-0"
            title="Upload a price list image to auto-update selling prices"
          >
            {analyzing ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            ) : (
              <ImageUp className="h-4 w-4" />
            )}
            {analyzing ? "Analysing…" : "Update Prices"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-accent/20 border-2 border-accent rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-7 w-7 text-accent-foreground flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-accent-foreground mb-2">Low Stock Alert</h3>
              <p className="text-foreground">
                {lowStockProducts.length}{" "}
                {lowStockProducts.length === 1 ? "product needs" : "products need"} restocking:
              </p>
              <ul className="mt-2 space-y-1">
                {lowStockProducts.map((product) => (
                  <li key={product.id} className="text-foreground">
                    • {product.name}:{" "}
                    <span className="font-medium">
                      {product.stock} {product.unit}
                    </span>
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
              className={`relative bg-card rounded-2xl p-6 shadow-md border-2 ${stockStatus.borderColor}`}
            >
              {/* Cost price — top-right corner */}
              <button
                onClick={() => openModal(product.id, product.name, product.unit, "costPrice")}
                className="absolute top-4 right-4 flex items-center gap-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-2.5 py-1 text-sm font-medium transition-colors group"
                title="Tap to edit cost price"
              >
                <span>CP: ₹{product.costPrice}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <div className="flex items-start gap-4">
                <div className={`${stockStatus.bgColor} p-4 rounded-xl`}>
                  <Package className={`h-8 w-8 ${stockStatus.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3>{product.name}</h3>
                    {stockStatus.level !== "normal" && (
                      <AlertTriangle className={`h-5 w-5 ${stockStatus.color} flex-shrink-0 mt-6`} />
                    )}
                  </div>

                  {/* Stock */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className={`text-2xl ${stockStatus.color}`}>{product.stock}</p>
                    <p className="text-muted-foreground">{product.unit}</p>
                  </div>

                  {/* Price per liter — tap to edit ✏️ */}
                  <button
                    onClick={() =>
                      openModal(product.id, product.name, product.unit, "pricePerLiter")
                    }
                    className="flex items-center gap-2 group mt-1 hover:opacity-80 transition-opacity"
                    title="Tap to edit price"
                  >
                    <p className={`text-2xl ${stockStatus.color}`}>
                      ₹{product.pricePerLiter}
                    </p>
                    <p className="text-muted-foreground">per {product.unit.toLowerCase()}</p>
                    <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  {stockStatus.level !== "normal" && (
                    <p className={`text-sm mt-2 ${stockStatus.color}`}>
                      {stockStatus.level === "critical"
                        ? "Critical: Restock immediately"
                        : "Low stock: Restock soon"}
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

      {/* ── MODAL ──────────────────────────────────────────────────── */}
      {showModal && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl border-2 border-border">
            <h2 className="text-2xl mb-2">
              {modalData.action === "add"
                ? "Add Stock"
                : modalData.action === "remove"
                ? "Remove Stock"
                : modalData.action === "costPrice"
                ? "Update Cost Price"
                : "Update Selling Price"}
            </h2>
            <p className="text-muted-foreground mb-6">{modalData.productName}</p>

            <label htmlFor="amount-input" className="block mb-3 text-foreground">
              {modalData.action === "pricePerLiter"
                ? `New cost price per ${modalData.unit.toLowerCase()} (₹):`
                : modalData.action === "costPrice"
                ? `New cost price per ${modalData.unit.toLowerCase()} (₹):`
                : `Enter amount (${modalData.unit.toLowerCase()}):`}
            </label>
            <input
              id="amount-input"
              type="number"
              inputMode="numeric"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="w-full px-6 py-4 text-2xl rounded-xl border-2 border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-6"
              placeholder={modalData.action === "pricePerLiter" || modalData.action === "costPrice" ? "0.00" : "0"}
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={confirming}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 px-6 transition-colors active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 px-6 transition-colors active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {confirming && (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                )}
                {confirming ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRICE UPDATE CONFIRMATION MODAL ──────────────────────── */}
      {showPriceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-6 z-50 overflow-y-auto">
          <div className="bg-card rounded-2xl w-full max-w-lg shadow-xl border-2 border-border my-6">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-foreground">Price Changes Detected</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review the changes extracted from the image before applying
              </p>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {priceChanges.map((change) => {
                const diff = change.newPrice - change.currentPrice;
                const pct = change.currentPrice > 0
                  ? ((diff / change.currentPrice) * 100).toFixed(1)
                  : "—";
                const unchanged = diff === 0;
                return (
                  <div
                    key={change.productId}
                    className={`rounded-xl p-4 border-2 ${
                      unchanged
                        ? "border-border bg-muted/30"
                        : diff > 0
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{change.productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Found as: "{change.extractedName}"
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-muted-foreground line-through text-sm">
                            ₹{change.currentPrice}
                          </span>
                          <span className="text-foreground font-semibold">
                            ₹{change.newPrice}
                          </span>
                        </div>
                        {!unchanged && (
                          <div className={`flex items-center gap-1 justify-end text-xs mt-1 ${diff > 0 ? "text-destructive" : "text-primary"}`}>
                            {diff > 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />}
                            <span>{diff > 0 ? "+" : ""}{diff.toFixed(2)} ({pct}%)</span>
                          </div>
                        )}
                        {unchanged && (
                          <div className="flex items-center gap-1 justify-end text-xs mt-1 text-muted-foreground">
                            <MinusIcon className="h-3 w-3" /> No change
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-border text-sm text-muted-foreground">
              {priceChanges.filter((c) => c.newPrice !== c.currentPrice).length} of {priceChanges.length} prices will change
            </div>

            <div className="p-4 flex gap-3">
              <button
                onClick={() => { setShowPriceModal(false); setPriceChanges([]); }}
                disabled={applyingPrices}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 transition-colors active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyPrices}
                disabled={applyingPrices || priceChanges.every((c) => c.newPrice === c.currentPrice)}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 flex items-center justify-center gap-2 transition-colors active:scale-95 disabled:opacity-60"
              >
                {applyingPrices && (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                )}
                {applyingPrices ? "Applying…" : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}