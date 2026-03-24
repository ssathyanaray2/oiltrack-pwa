import { useState, useEffect, useRef } from "react";
import { Plus, Minus, Package, AlertTriangle, Pencil, ImageUp, TrendingUp, TrendingDown, Minus as MinusIcon, ChevronDown, Search, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useFeatureFlags } from "../../lib/featureFlags";
import { toast } from "sonner";
import { getProducts, updateProductStock, updateProductUnitPrice, updateProductCostPrice, updateProductUnitSize, updateProductReorderThreshold, deleteProduct } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { extractPricesFromImage, type PriceChange } from "../../lib/priceAnalysis";
import type { Product } from "../../lib/types";
import { products as mockProducts } from "../data/mockData";
import React from "react";

type FilterOption = "all" | "low" | "in" | "out";

export function Inventory() {
  const isOnline = useOnlineStatus();
  const { ai_price_update } = useFeatureFlags();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    productId: string;
    productName: string;
    unit: string;
    action: "add" | "remove" | "pricePerLiter" | "costPrice" | "unitSize" | "reorderThreshold";
  } | null>(null);
  const [inputAmount, setInputAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");

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
    action: "add" | "remove" | "pricePerLiter" | "costPrice" | "reorderThreshold",
    initialValue = ""
  ) => {
    setModalData({ productId, productName, unit, action });
    setInputAmount(initialValue);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
    setInputAmount("");
    setConfirming(false);
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`Delete "${productName}"? This cannot be undone.`)) return;
    try {
      if (isSupabaseConfigured() && isOnline) {
        await deleteProduct(productId);
      }
      const next = products.filter((p) => p.id !== productId);
      setProducts(next);
      setCachedProducts(next);
      toast.success(`"${productName}" deleted`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete product");
    }
  };

  const handleConfirm = async () => {
    if (!modalData || confirming) return;
    setConfirming(true);
    try {
      if (modalData.action === "pricePerLiter") {
        const newPrice = parseFloat(inputAmount);
        if (isNaN(newPrice) || newPrice <= 0) { toast.error("Please enter a valid price"); return; }
        if (isSupabaseConfigured() && isOnline) {
          try {
            const updated = await updateProductUnitPrice(modalData.productId, newPrice);
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setCachedProducts(products.map((p) => p.id === modalData.productId ? { ...p, pricePerLiter: newPrice } : p));
            toast.success(`Price updated to ₹${newPrice} for ${modalData.productName}`);
          } catch (e) { toast.error("Failed to update price"); console.error(e); }
        } else {
          const next = products.map((p) => p.id === modalData.productId ? { ...p, pricePerLiter: newPrice } : p);
          setProducts(next); setCachedProducts(next);
          toast.success(`Price updated to ₹${newPrice} (saved locally)`);
        }
        closeModal(); return;
      }

      if (modalData.action === "costPrice") {
        const newPrice = parseFloat(inputAmount);
        if (isNaN(newPrice) || newPrice <= 0) { toast.error("Please enter a valid price"); return; }
        if (isSupabaseConfigured() && isOnline) {
          try {
            const updated = await updateProductCostPrice(modalData.productId, newPrice);
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setCachedProducts(products.map((p) => p.id === modalData.productId ? { ...p, costPrice: newPrice } : p));
            toast.success(`Cost price updated to ₹${newPrice} for ${modalData.productName}`);
          } catch (e) { toast.error("Failed to update cost price"); console.error(e); }
        } else {
          const next = products.map((p) => p.id === modalData.productId ? { ...p, costPrice: newPrice } : p);
          setProducts(next); setCachedProducts(next);
          toast.success(`Cost price updated to ₹${newPrice} (saved locally)`);
        }
        closeModal(); return;
      }

      if (modalData.action === "unitSize") {
        const newSize = parseFloat(inputAmount);
        if (isNaN(newSize) || newSize <= 0) { toast.error("Please enter a valid container size"); return; }
        if (isSupabaseConfigured() && isOnline) {
          try {
            const updated = await updateProductUnitSize(modalData.productId, newSize);
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setCachedProducts(products.map((p) => p.id === modalData.productId ? { ...p, unitSize: newSize } : p));
            toast.success(`Container size updated to ${newSize}L for ${modalData.productName}`);
          } catch (e) { toast.error("Failed to update container size"); console.error(e); }
        } else {
          const next = products.map((p) => p.id === modalData.productId ? { ...p, unitSize: newSize } : p);
          setProducts(next); setCachedProducts(next);
          toast.success(`Container size updated to ${newSize}L (saved locally)`);
        }
        closeModal(); return;
      }

      if (modalData.action === "reorderThreshold") {
        const newThreshold = parseFloat(inputAmount);
        if (isNaN(newThreshold) || newThreshold < 0) { toast.error("Please enter a valid threshold"); return; }
        if (isSupabaseConfigured() && isOnline) {
          try {
            const updated = await updateProductReorderThreshold(modalData.productId, newThreshold);
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setCachedProducts(products.map((p) => p.id === modalData.productId ? { ...p, lowStockThreshold: newThreshold } : p));
            toast.success(`Reorder threshold updated to ${newThreshold} for ${modalData.productName}`);
          } catch (e) { toast.error("Failed to update reorder threshold"); console.error(e); }
        } else {
          const next = products.map((p) => p.id === modalData.productId ? { ...p, lowStockThreshold: newThreshold } : p);
          setProducts(next); setCachedProducts(next);
          toast.success(`Reorder threshold updated to ${newThreshold} (saved locally)`);
        }
        closeModal(); return;
      }

      const amount = parseInt(inputAmount);
      if (isNaN(amount) || amount <= 0) { toast.error("Please enter a valid amount"); return; }
      const change = modalData.action === "add" ? amount : -amount;
      const product = products.find((p) => p.id === modalData.productId);
      const newStock = product ? Math.max(0, product.stock + change) : 0;

      if (isSupabaseConfigured() && isOnline) {
        try {
          const updated = await updateProductStock(modalData.productId, change);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setCachedProducts(products.map((p) => p.id === modalData.productId ? { ...p, stock: newStock } : p));
          const action = change > 0 ? "added to" : "removed from";
          toast.success(`${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName}`);
        } catch (e) { toast.error("Failed to update stock"); console.error(e); }
      } else {
        const next = products.map((p) => p.id === modalData.productId ? { ...p, stock: newStock } : p);
        setProducts(next); setCachedProducts(next);
        const action = change > 0 ? "added to" : "removed from";
        toast.success(`${Math.abs(change)} ${product?.unit.toLowerCase() ?? ""} ${action} ${modalData.productName} (saved locally)`);
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
    if (!supported.includes(file.type)) { toast.error("Please upload a JPG, PNG, WebP, or GIF image"); return; }
    setAnalyzing(true);
    toast.loading("Reading price list…", { id: "price-analysis" });
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const result = reader.result as string; resolve(result.split(",")[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const changes = await extractPricesFromImage(base64, file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", products);
      toast.dismiss("price-analysis");
      if (changes.length === 0) { toast.info("No matching products or price changes found in the image"); return; }
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
      const changedOnly = priceChanges.filter((c) => !c.isNew && c.newPrice !== c.currentPrice);
      for (const change of changedOnly) {
        if (isSupabaseConfigured() && isOnline) {
          const updated = await updateProductUnitPrice(change.productId, change.newPrice);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else {
          setProducts((prev) => prev.map((p) => (p.id === change.productId ? { ...p, pricePerLiter: change.newPrice } : p)));
        }
      }
      const next = products.map((p) => { const change = changedOnly.find((c) => c.productId === p.id); return change ? { ...p, pricePerLiter: change.newPrice } : p; });
      setCachedProducts(next);
      toast.success(`Updated prices for ${changedOnly.length} product${changedOnly.length > 1 ? "s" : ""}`);
      setShowPriceModal(false); setPriceChanges([]);
    } catch (err) {
      console.error(err); toast.error("Failed to apply some price updates");
    } finally {
      setApplyingPrices(false);
    }
  };

  const getStockStatus = (stock: number, threshold: number) => {
    if (stock === 0) return { level: "critical" as const };
    if (stock <= threshold) return { level: "low" as const };
    return { level: "normal" as const };
  };

  const lowStockProducts = products.filter((p) => p.stock <= p.lowStockThreshold);
  const maxStock = Math.max(...products.map((p) => p.stock), 1);

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    const status = getStockStatus(p.stock, p.lowStockThreshold);
    if (filter === "low") return status.level === "low" || status.level === "critical";
    if (filter === "in") return status.level === "normal";
    if (filter === "out") return p.stock === 0;
    return true;
  });

  const filterOptions: { label: string; value: FilterOption }[] = [
    { label: "All", value: "all" },
    { label: "Low Stock", value: "low" },
    { label: "In Stock", value: "in" },
    { label: "Out of Stock", value: "out" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center">
        <p className="text-[#434655] font-medium">Loading inventory…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <h1 className="text-xl font-bold text-[#131b2e] tracking-tight">Inventory</h1>
        <div className="flex items-center gap-2">
          {ai_price_update && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors active:scale-95 disabled:opacity-60"
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
          )}
          <Link
            to="/inventory/new"
            className="flex items-center justify-center bg-[#004ac6] hover:bg-[#003ea8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </Link>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleImageUpload} />
      </header>

      <div className="px-5 max-w-2xl mx-auto">
        {/* Search Bar */}
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#e2e7ff] border-none rounded-xl py-3 pl-11 pr-4 text-[#131b2e] placeholder:text-[#737686] outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
            placeholder="Search product name..."
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                filter === opt.value
                  ? "bg-[#004ac6] text-white"
                  : "bg-white text-[#434655] hover:bg-[#f2f3ff] border border-[#c3c6d7]"
              }`}
            >
              {opt.label}
              {opt.value === "low" && lowStockProducts.length > 0 && (
                <span className={`ml-1.5 w-1.5 h-1.5 rounded-full inline-block ${filter === "low" ? "bg-orange-300" : "bg-[#ba1a1a]"}`} />
              )}
            </button>
          ))}
        </div>

        {/* Low Stock Alert Banner */}
        {lowStockProducts.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl mt-4 overflow-hidden">
            <button
              onClick={() => setAlertExpanded((prev) => !prev)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-orange-100/50 transition-colors"
            >
              <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
              <span className="flex-1 font-semibold text-orange-800 text-sm">
                {lowStockProducts.length} {lowStockProducts.length === 1 ? "product needs" : "products need"} restocking
              </span>
              <ChevronDown className={`h-4 w-4 text-orange-600 transition-transform duration-200 ${alertExpanded ? "rotate-180" : ""}`} />
            </button>
            {alertExpanded && (
              <ul className="px-5 pb-4 space-y-1 border-t border-orange-200 pt-3">
                {lowStockProducts.map((p) => (
                  <li key={p.id} className="text-sm text-orange-800">
                    • {p.name}: <span className="font-semibold">{p.stock} {p.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Product Cards */}
        <div className="mt-5 space-y-4 mb-8">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-[#434655]">
              <Package className="h-10 w-10 mx-auto mb-3 text-[#c3c6d7]" />
              <p className="font-medium">No products found</p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const status = getStockStatus(product.stock, product.lowStockThreshold);
              const barPercent = Math.min(100, Math.round((product.stock / maxStock) * 100));
              const borderColor = status.level === "critical" ? "#ba1a1a" : status.level === "low" ? "#943700" : "#004ac6";
              const iconBg = status.level === "critical" ? "bg-[#ffdad6]" : status.level === "low" ? "bg-[#ffdbcd]" : "bg-[#eaedff]";
              const iconColor = status.level === "critical" ? "text-[#ba1a1a]" : status.level === "low" ? "text-[#943700]" : "text-[#004ac6]";
              const barColor = status.level === "critical" ? "#ba1a1a" : status.level === "low" ? "#943700" : "#004ac6";
              const badgeBg = status.level === "critical" ? "bg-[#ffdad6] text-[#93000a]" : status.level === "low" ? "bg-[#ffdbcd] text-[#7d2d00]" : "bg-[#acbfff] text-[#394c84]";
              const badgeLabel = status.level === "critical" ? "Critical" : status.level === "low" ? "Low Stock" : "In Stock";

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.05)] border-l-4"
                  style={{ borderLeftColor: borderColor }}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
                        <Package className={`h-5 w-5 ${iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-[#131b2e] text-base leading-tight">{product.name}</h3>
                        <p className="text-xs text-[#737686] mt-0.5">{product.unit} · {product.unitSize}L/unit</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-tight ${badgeBg}`}>
                        {badgeLabel}
                      </span>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        className="p-1.5 rounded-lg text-[#737686] hover:text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors"
                        title="Delete product"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Stock + Reorder Threshold */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Current Stock</p>
                      <p className="text-2xl font-extrabold text-[#131b2e]">
                        {product.stock.toLocaleString()} <span className="text-sm font-medium text-[#434655]">{product.unit}</span>
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => openModal(product.id, product.name, product.unit, "remove")}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#c3c6d7] text-[#737686] hover:border-[#ba1a1a] hover:text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors active:scale-95"
                          title="Remove stock"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openModal(product.id, product.name, product.unit, "add")}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#004ac6] text-[#004ac6] hover:bg-[#004ac6] hover:text-white transition-colors active:scale-95"
                          title="Add stock"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Reorder At</p>
                      <button
                        onClick={() => openModal(product.id, product.name, product.unit, "reorderThreshold", String(product.lowStockThreshold))}
                        className="flex items-center gap-1.5 group"
                        title="Edit reorder threshold"
                      >
                        <p className="text-2xl font-extrabold text-[#131b2e]">
                          {product.lowStockThreshold.toLocaleString()} <span className="text-sm font-medium text-[#434655]">{product.unit}</span>
                        </p>
                        <Pencil className="h-3.5 w-3.5 text-[#737686] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* Price Row */}
                  <div className="grid grid-cols-2 gap-4 mb-1">
                    <div>
                      <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Selling Price</p>
                      <button
                        onClick={() => openModal(product.id, product.name, product.unit, "pricePerLiter")}
                        className="flex items-center gap-1.5 group"
                        title="Edit selling price"
                      >
                        <span className="text-base font-semibold text-[#131b2e]">₹{product.pricePerLiter}</span>
                        <span className="text-xs text-[#737686]">/ {product.unit.toLowerCase()}</span>
                        <Pencil className="h-3 w-3 text-[#737686] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Cost Price</p>
                      <button
                        onClick={() => openModal(product.id, product.name, product.unit, "costPrice")}
                        className="flex items-center gap-1.5 group"
                        title="Edit cost price"
                      >
                        <span className="text-base font-semibold text-[#131b2e]">₹{product.costPrice}</span>
                        <Pencil className="h-3 w-3 text-[#737686] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Stock Update Modal */}
      {showModal && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold text-[#131b2e] mb-1">
              {modalData.action === "add" ? "Add Stock"
                : modalData.action === "remove" ? "Remove Stock"
                : modalData.action === "costPrice" ? "Update Cost Price"
                : modalData.action === "unitSize" ? "Update Container Size"
                : modalData.action === "reorderThreshold" ? "Update Reorder Threshold"
                : "Update Selling Price"}
            </h2>
            <p className="text-[#434655] text-sm mb-6">{modalData.productName}</p>
            <label htmlFor="amount-input" className="block mb-2 text-sm font-semibold text-[#131b2e]">
              {modalData.action === "pricePerLiter" ? `New selling price per ${modalData.unit.toLowerCase()} (₹):`
                : modalData.action === "costPrice" ? `New cost price per ${modalData.unit.toLowerCase()} (₹):`
                : modalData.action === "unitSize" ? "Container size in litres:"
                : modalData.action === "reorderThreshold" ? `Reorder when stock falls below (${modalData.unit.toLowerCase()}):`
                : `Enter amount (${modalData.unit.toLowerCase()}):`}
            </label>
            <input
              id="amount-input"
              type="number"
              inputMode="numeric"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="w-full px-5 py-4 text-2xl rounded-xl border-2 border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 mb-6"
              placeholder={modalData.action === "pricePerLiter" || modalData.action === "costPrice" ? "0.00" : "0"}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={closeModal} disabled={confirming} className="flex-1 bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] rounded-xl py-4 font-semibold transition-colors active:scale-95 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={confirming} className="flex-1 bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-xl py-4 font-semibold transition-colors active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2">
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

      {/* Price Update Confirmation Modal */}
      {showPriceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-6 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-6">
            <div className="p-6 border-b border-[#c3c6d7]">
              <h2 className="text-lg font-bold text-[#131b2e]">Price Changes Detected</h2>
              <p className="text-sm text-[#434655] mt-1">Review before applying</p>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {priceChanges.map((change, idx) => {
                if (change.isNew) {
                  return (
                    <div key={`new-${idx}`} className="rounded-xl p-4 border border-orange-200 bg-orange-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-[#131b2e] truncate">{change.extractedName}</p>
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg whitespace-nowrap">Not in inventory</span>
                          </div>
                          <p className="text-xs text-[#434655] mt-0.5">Found in image — not matched</p>
                        </div>
                        <span className="text-[#131b2e] font-semibold shrink-0">₹{change.newPrice}</span>
                      </div>
                    </div>
                  );
                }
                const diff = change.newPrice - change.currentPrice;
                const pct = change.currentPrice > 0 ? ((diff / change.currentPrice) * 100).toFixed(1) : "—";
                const unchanged = diff === 0;
                return (
                  <div key={change.productId} className={`rounded-xl p-4 border ${unchanged ? "border-[#c3c6d7] bg-[#f2f3ff]" : diff > 0 ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#131b2e] truncate">{change.productName}</p>
                        <p className="text-xs text-[#434655] mt-0.5">Found as: "{change.extractedName}"</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[#434655] line-through text-sm">₹{change.currentPrice}</span>
                          <span className="text-[#131b2e] font-bold">₹{change.newPrice}</span>
                        </div>
                        {!unchanged && (
                          <div className={`flex items-center gap-1 justify-end text-xs mt-1 ${diff > 0 ? "text-[#ba1a1a]" : "text-[#004ac6]"}`}>
                            {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{diff > 0 ? "+" : ""}{diff.toFixed(2)} ({pct}%)</span>
                          </div>
                        )}
                        {unchanged && (
                          <div className="flex items-center gap-1 justify-end text-xs mt-1 text-[#434655]">
                            <MinusIcon className="h-3 w-3" /> No change
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-[#c3c6d7] text-xs text-[#434655]">
              {priceChanges.filter((c) => !c.isNew && c.newPrice !== c.currentPrice).length} of {priceChanges.filter((c) => !c.isNew).length} inventory prices will change
              {priceChanges.filter((c) => c.isNew).length > 0 && (
                <span className="ml-2 text-orange-700">· {priceChanges.filter((c) => c.isNew).length} not in inventory</span>
              )}
            </div>
            <div className="p-4 flex gap-3">
              <button onClick={() => { setShowPriceModal(false); setPriceChanges([]); }} disabled={applyingPrices} className="flex-1 bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] rounded-xl py-4 font-semibold transition-colors active:scale-95 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleApplyPrices} disabled={applyingPrices || priceChanges.every((c) => c.isNew || c.newPrice === c.currentPrice)} className="flex-1 bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 transition-colors active:scale-95 disabled:opacity-60">
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
