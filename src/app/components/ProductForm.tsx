import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createProduct } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, setCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product } from "../../lib/types";

export function ProductForm() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [formData, setFormData] = useState({
    name: "",
    unit: "Litres",
    stock: "",
    pricePerLiter: "",
    costPrice: "",
    lowStockThreshold: "",
    unitSize: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = formData.name.trim();
    const stock = parseFloat(formData.stock);
    const pricePerLiter = parseFloat(formData.pricePerLiter);
    const costPrice = formData.costPrice ? parseFloat(formData.costPrice) : 0;
    const lowStockThreshold = parseFloat(formData.lowStockThreshold);
    const unitSize = formData.unitSize ? parseFloat(formData.unitSize) : 1;

    if (!name) { toast.error("Product name is required"); return; }
    if (isNaN(stock) || stock < 0) { toast.error("Enter a valid initial stock"); return; }
    if (isNaN(pricePerLiter) || pricePerLiter <= 0) { toast.error("Enter a valid selling price"); return; }
    if (isNaN(lowStockThreshold) || lowStockThreshold < 0) { toast.error("Enter a valid reorder threshold"); return; }

    if (!isSupabaseConfigured() || !isOnline) {
      toast.error("Adding products requires an internet connection");
      return;
    }

    setSaving(true);
    try {
      const created = await createProduct({
        name,
        unit: formData.unit,
        stock,
        pricePerLiter,
        costPrice,
        lowStockThreshold,
        unitSize,
      });
      const cached = getCachedProducts() as Product[] | null;
      setCachedProducts([...(cached ?? []), created]);
      toast.success(`"${name}" added to inventory`);
      navigate("/inventory");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] pb-32 animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="w-9 h-9 rounded-xl bg-[#e2e7ff]" />
          <div className="h-5 w-28 bg-[#e2e7ff] rounded-full" />
          <div className="w-9" />
        </div>
        {/* Form card */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] mx-5 mt-4 space-y-5">
          {/* Name */}
          <div>
            <div className="h-3.5 w-28 bg-[#e2e7ff] rounded-full mb-2" />
            <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
          </div>
          {/* Unit */}
          <div>
            <div className="h-3.5 w-12 bg-[#e2e7ff] rounded-full mb-2" />
            <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
          </div>
          {/* Initial Stock */}
          <div>
            <div className="h-3.5 w-24 bg-[#e2e7ff] rounded-full mb-2" />
            <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
          </div>
          {/* Selling + Cost Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="h-3.5 w-24 bg-[#e2e7ff] rounded-full mb-2" />
              <div className="h-12 bg-[#e2e7ff] rounded-xl" />
            </div>
            <div>
              <div className="h-3.5 w-20 bg-[#e2e7ff] rounded-full mb-2" />
              <div className="h-12 bg-[#e2e7ff] rounded-xl" />
            </div>
          </div>
          {/* Reorder + Container Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="h-3.5 w-20 bg-[#e2e7ff] rounded-full mb-2" />
              <div className="h-12 bg-[#e2e7ff] rounded-xl" />
            </div>
            <div>
              <div className="h-3.5 w-28 bg-[#e2e7ff] rounded-full mb-2" />
              <div className="h-12 bg-[#e2e7ff] rounded-xl" />
            </div>
          </div>
          {/* Submit button */}
          <div className="h-14 w-full bg-[#e2e7ff] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <button
          onClick={() => navigate("/inventory")}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f3ff] text-[#434655] hover:bg-[#eaedff] transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-[#131b2e]">New Product</h1>
        <div className="w-9" />
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] mx-5 mt-4">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
              placeholder="e.g. Groundnut Oil"
              required
            />
          </div>

          {/* Unit */}
          <div>
            <label htmlFor="unit" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Unit <span className="text-red-500">*</span>
            </label>
            <select
              id="unit"
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e]"
            >
              <option value="Litres">Litres</option>
              <option value="Kg">Kg</option>
              <option value="Barrels">Barrels</option>
              <option value="Units">Units</option>
            </select>
          </div>

          {/* Initial Stock */}
          <div>
            <label htmlFor="stock" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Initial Stock <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="stock"
              name="stock"
              min="0"
              value={formData.stock}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
              placeholder="0"
              required
            />
          </div>

          {/* Selling Price + Cost Price side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pricePerLiter" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                Selling Price (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="pricePerLiter"
                name="pricePerLiter"
                min="0"
                step="0.01"
                value={formData.pricePerLiter}
                onChange={handleChange}
                className="w-full px-4 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label htmlFor="costPrice" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                Cost Price (₹)
              </label>
              <input
                type="number"
                id="costPrice"
                name="costPrice"
                min="0"
                step="0.01"
                value={formData.costPrice}
                onChange={handleChange}
                className="w-full px-4 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Reorder Threshold + Container Size side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lowStockThreshold" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                Reorder At <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="lowStockThreshold"
                name="lowStockThreshold"
                min="0"
                value={formData.lowStockThreshold}
                onChange={handleChange}
                className="w-full px-4 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
                placeholder="e.g. 50"
                required
              />
              <p className="text-xs text-[#737686] mt-1">Alert below this level</p>
            </div>
            <div>
              <label htmlFor="unitSize" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                Container Size (L)
              </label>
              <input
                type="number"
                id="unitSize"
                name="unitSize"
                min="0"
                step="0.1"
                value={formData.unitSize}
                onChange={handleChange}
                className="w-full px-4 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
                placeholder="e.g. 15"
              />
              <p className="text-xs text-[#737686] mt-1">Litres per container</p>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-2xl py-4 font-semibold text-base transition-colors active:scale-[0.98] disabled:opacity-60 mt-2 flex items-center justify-center gap-2"
          >
            {saving && (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            )}
            {saving ? "Adding…" : "Add Product"}
          </button>
        </form>
      </div>
    </div>
  );
}
