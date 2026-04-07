import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
  getProduct,
  getBatchesForProduct,
  createBatch,
  updateBatch,
  deleteBatch,
} from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedProducts, getCachedBatches, setCachedBatches } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Product, ProductBatch } from "../../lib/types";
import { products as mockProducts, batches as mockBatches } from "../data/mockData";
import {
  ArrowLeft,
  Package,
  Plus,
  Calendar,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";
import { toast } from "sonner";
import React from "react";

// ── Expiry badge ──────────────────────────────────────────────────────────────
function getExpiryBadge(expiryDate: string | null): { label: string; className: string } | null {
  if (!expiryDate) return null;
  const days = Math.ceil(
    (new Date(expiryDate + "T00:00:00").getTime() - Date.now()) / 86_400_000
  );
  if (days < 0) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (days <= 30) return { label: `${days}d left`, className: "bg-orange-100 text-orange-700" };
  return { label: `${days}d left`, className: "bg-green-100 text-green-700" };
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Batch form state ──────────────────────────────────────────────────────────
interface BatchFormData {
  numberOfBottles: string;
  unitPrice: string;
  costPrice: string;
  manufactureDate: string;
  expiryDate: string;
  notes: string;
}

const emptyForm = (): BatchFormData => ({
  numberOfBottles: "",
  unitPrice: "",
  costPrice: "",
  manufactureDate: "",
  expiryDate: "",
  notes: "",
});

// ── Component ─────────────────────────────────────────────────────────────────
export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Batch form modal
  const [showForm, setShowForm] = useState(false);
  const [editingBatch, setEditingBatch] = useState<ProductBatch | null>(null);
  const [form, setForm] = useState<BatchFormData>(emptyForm());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deletingBatch, setDeletingBatch] = useState<ProductBatch | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = async (silent = false) => {
    if (!id) { setLoading(false); return; }
    if (!silent) setLoading(true);
    const useSupabase = isSupabaseConfigured() && isOnline;
    if (useSupabase) {
      try {
        const [prod, batchList] = await Promise.all([
          getProduct(id),
          getBatchesForProduct(id),
        ]);
        setProduct(prod ?? null);
        setBatches(batchList);
        if (batchList.length) setCachedBatches(id, batchList);
      } catch (e) {
        console.error(e);
        const cp = getCachedProducts() as Product[] | null;
        const cb = getCachedBatches(id) as ProductBatch[] | null;
        setProduct((cp ?? mockProducts).find((p) => p.id === id) ?? null);
        setBatches(cb ?? mockBatches.filter((b) => b.productId === id));
      }
    } else {
      const cp = getCachedProducts() as Product[] | null;
      const cb = getCachedBatches(id) as ProductBatch[] | null;
      setProduct((cp ?? mockProducts).find((p) => p.id === id) ?? null);
      setBatches(cb ?? mockBatches.filter((b) => b.productId === id));
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => { loadData(); }, [id, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open form for new or edit ───────────────────────────────────────────────
  const openNewForm = () => {
    setEditingBatch(null);
    setForm(emptyForm());
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (batch: ProductBatch) => {
    setEditingBatch(batch);
    setForm({
      numberOfBottles: String(batch.numberOfBottles),
      unitPrice: String(batch.unitPrice),
      costPrice: String(batch.costPrice),
      manufactureDate: batch.manufactureDate ?? "",
      expiryDate: batch.expiryDate ?? "",
      notes: batch.notes ?? "",
    });
    setFormError("");
    setShowForm(true);
  };

  // ── Validate & submit ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError("");
    const bottles = parseInt(form.numberOfBottles, 10);
    const unitPrice = parseFloat(form.unitPrice);
    const costPrice = form.costPrice ? parseFloat(form.costPrice) : 0;
    const bottleSizeLitres = product?.unitSize ?? 1;
    if (!Number.isInteger(bottles) || bottles <= 0) {
      setFormError("Number of bottles must be a positive whole number.");
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      setFormError("Selling price must be a valid number.");
      return;
    }
    if (form.manufactureDate && form.expiryDate && form.expiryDate < form.manufactureDate) {
      setFormError("Expiry date must be on or after the manufacture date.");
      return;
    }
    if (!id) return;
    setSubmitting(true);
    try {
      if (editingBatch) {
        await updateBatch(editingBatch.id, {
          numberOfBottles: bottles,
          bottleSizeLitres,
          unitPrice,
          costPrice,
          manufactureDate: form.manufactureDate || null,
          expiryDate: form.expiryDate || null,
          notes: form.notes || undefined,
        });
        toast.success("Batch updated");
      } else {
        await createBatch({
          productId: id,
          numberOfBottles: bottles,
          bottleSizeLitres,
          unitPrice,
          costPrice,
          manufactureDate: form.manufactureDate || null,
          expiryDate: form.expiryDate || null,
          notes: form.notes || undefined,
        });
        toast.success("Batch added");
      }
      setShowForm(false);
      await loadData(true);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save batch. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingBatch) return;
    try {
      await deleteBatch(deletingBatch.id);
      toast.success("Batch deleted");
      setDeletingBatch(null);
      await loadData(true);
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete batch.");
    }
  };

  // ── Stock status color ──────────────────────────────────────────────────────
  const getStockBadge = () => {
    if (!product) return null;
    if (product.stock === 0) return { label: "Out of Stock", className: "bg-red-100 text-red-700" };
    if (product.stock < product.lowStockThreshold) return { label: "Low Stock", className: "bg-orange-100 text-orange-700" };
    return { label: "In Stock", className: "bg-green-100 text-green-700" };
  };

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/inventory")} className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-bold text-[#131b2e]">Product</span>
        </div>
        <div className="p-4 pb-24 max-w-2xl mx-auto">
          <p className="text-[#737686] text-sm mt-6">Loading…</p>
        </div>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (!product) {
    return (
      <div className="min-h-screen bg-[#faf8ff]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/inventory")} className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-bold text-[#131b2e]">Product</span>
        </div>
        <div className="p-4 pb-24 max-w-2xl mx-auto flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-[#eaedff] rounded-full p-4 mb-3">
            <Package className="h-8 w-8 text-[#004ac6]" />
          </div>
          <p className="text-[#131b2e] font-semibold mb-1">Product not found</p>
          <button onClick={() => navigate("/inventory")} className="mt-3 text-sm text-[#2563eb] font-semibold hover:underline">
            Back to Inventory
          </button>
        </div>
      </div>
    );
  }

  const stockBadge = getStockBadge();

  return (
    <div className="min-h-screen bg-[#faf8ff]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] shadow-[0_1px_0_#c3c6d7] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/inventory")}
          className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-bold text-[#131b2e] flex-1 truncate">{product.name}</span>
        <button
          onClick={openNewForm}
          className="flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#004ac6] text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors active:scale-[0.97] flex-shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Batch
        </button>
      </div>

      <div className="p-4 pb-24 max-w-2xl mx-auto space-y-4">
        {/* Product Summary Card */}
        <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#eaedff] flex items-center justify-center flex-shrink-0">
              <Package className="h-6 w-6 text-[#004ac6]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-[#131b2e] truncate">{product.name}</h2>
              <p className="text-xs text-[#737686] mt-0.5">{product.unit} · {product.unitSize} L/bottle</p>
            </div>
            {stockBadge && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${stockBadge.className}`}>
                {stockBadge.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#f8f9ff] rounded-xl p-3">
              <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Total Stock</p>
              <p className="text-xl font-extrabold text-[#131b2e]">{product.stock.toLocaleString()}</p>
              <p className="text-xs text-[#737686]">{product.unit}</p>
            </div>
            <div className="bg-[#f8f9ff] rounded-xl p-3">
              <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Container</p>
              <p className="text-xl font-extrabold text-[#131b2e]">{product.unitSize}</p>
              <p className="text-xs text-[#737686]">L / bottle</p>
            </div>
            <div className="bg-[#f8f9ff] rounded-xl p-3">
              <p className="text-[10px] text-[#737686] uppercase tracking-wider mb-1">Reorder At</p>
              <p className="text-xl font-extrabold text-[#131b2e]">{product.lowStockThreshold.toLocaleString()}</p>
              <p className="text-xs text-[#737686]">{product.unit}</p>
            </div>
          </div>
          {product.stock < product.lowStockThreshold && (
            <div className="mt-3 flex items-center gap-2 text-orange-700 bg-orange-50 rounded-xl px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs font-semibold">Reorder at {product.lowStockThreshold} {product.unit} — stock is low</span>
            </div>
          )}
        </div>

        {/* Batch List */}
        <div>
          <h3 className="text-base font-bold text-[#131b2e] mb-3">Batches ({batches.length})</h3>

          {batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
              <div className="bg-[#eaedff] rounded-full p-4 mb-3">
                <Package className="h-7 w-7 text-[#004ac6]" />
              </div>
              <p className="text-[#131b2e] font-semibold text-sm">No batches yet</p>
              <p className="text-[#737686] text-xs mt-1 mb-4">Add the first batch for this product</p>
              <button
                onClick={openNewForm}
                className="flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#004ac6] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Batch
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => {
                const expiryBadge = getExpiryBadge(batch.expiryDate);
                const totalLitres = batch.numberOfBottles * batch.bottleSizeLitres;
                const isExpired = expiryBadge?.label === "Expired";
                return (
                  <div
                    key={batch.id}
                    className="bg-white rounded-xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden"
                    style={{ borderLeft: `3px solid ${isExpired ? "#ba1a1a" : "#004ac6"}` }}
                  >
                    <div className="px-4 py-3">
                      {/* Batch number + expiry badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-sm font-bold text-[#131b2e]">{batch.batchNumber}</span>
                        {expiryBadge && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${expiryBadge.className}`}>
                            {expiryBadge.label}
                          </span>
                        )}
                      </div>

                      {/* Bottles — primary stock info */}
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl font-extrabold text-[#131b2e]">{batch.numberOfBottles}</span>
                        <span className="text-sm font-medium text-[#434655]">bottles</span>
                        <span className="text-xs text-[#737686] ml-1">· {totalLitres.toLocaleString()} L total</span>
                      </div>

                      {/* Prices */}
                      <div className="flex items-center gap-4 mb-2">
                        <div>
                          <p className="text-[10px] text-[#737686] uppercase tracking-wider">Selling</p>
                          <p className="text-sm font-bold text-[#131b2e]">₹{batch.unitPrice}/bottle</p>
                        </div>
                        {batch.costPrice > 0 && (
                          <div>
                            <p className="text-[10px] text-[#737686] uppercase tracking-wider">Cost</p>
                            <p className="text-sm font-bold text-[#131b2e]">₹{batch.costPrice}/bottle</p>
                          </div>
                        )}
                        {batch.unitPrice > 0 && batch.costPrice > 0 && (
                          <div className="ml-auto">
                            <p className="text-[10px] text-[#737686] uppercase tracking-wider">Margin</p>
                            <p className="text-sm font-bold text-green-700">
                              ₹{(batch.unitPrice - batch.costPrice).toFixed(2)}/bottle
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                        {batch.manufactureDate && (
                          <div className="flex items-center gap-1 text-[#737686]">
                            <Calendar className="h-3.5 w-3.5" />
                            <span className="text-xs">Mfg: {formatDate(batch.manufactureDate)}</span>
                          </div>
                        )}
                        {batch.expiryDate && (
                          <div className="flex items-center gap-1 text-[#737686]">
                            <Calendar className="h-3.5 w-3.5" />
                            <span className="text-xs">Exp: {formatDate(batch.expiryDate)}</span>
                          </div>
                        )}
                      </div>

                      {batch.notes && (
                        <p className="text-xs text-[#737686] italic mb-3">{batch.notes}</p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditForm(batch)}
                          className="flex items-center gap-1.5 text-xs text-[#434655] hover:text-[#2563eb] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-[#f2f3ff] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingBatch(batch)}
                          className="flex items-center gap-1.5 text-xs text-[#737686] hover:text-[#ba1a1a] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-[#ffdad6] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Batch Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[60]" onClick={() => setShowForm(false)}>
          <div
            className="bg-white rounded-t-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#c3c6d7] shrink-0 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#131b2e]">
                {editingBatch ? "Edit Batch" : "Add New Batch"}
              </h2>
              {editingBatch && (
                <span className="font-mono text-xs text-[#737686] bg-[#f2f3ff] px-2 py-1 rounded-lg">
                  {editingBatch.batchNumber}
                </span>
              )}
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Number of bottles */}
              <div>
                <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                  Number of Bottles *
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.numberOfBottles}
                  onChange={(e) => setForm((f) => ({ ...f, numberOfBottles: e.target.value }))}
                  placeholder="e.g. 50"
                  className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] placeholder:text-[#c3c6d7] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all"
                />
              </div>

              {/* Bottle size — derived from product, shown read-only */}
              <div className="bg-[#f8f9ff] rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-[#737686]">Bottle size (from product)</span>
                <span className="text-sm font-semibold text-[#131b2e]">{product?.unitSize} L</span>
              </div>

              {/* Selling price + Cost price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                    Selling Price (₹/bottle) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                    placeholder="e.g. 120"
                    className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] placeholder:text-[#c3c6d7] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                    Cost Price (₹/bottle)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                    placeholder="e.g. 95"
                    className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] placeholder:text-[#c3c6d7] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all"
                  />
                </div>
              </div>

              {/* Manufacture date */}
              <div>
                <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                  Manufacture Date
                </label>
                <input
                  type="date"
                  value={form.manufactureDate}
                  onChange={(e) => setForm((f) => ({ ...f, manufactureDate: e.target.value }))}
                  className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all"
                />
              </div>

              {/* Expiry date */}
              <div>
                <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  min={form.manufactureDate || undefined}
                  className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Near expiry — use first"
                  rows={2}
                  className="w-full border border-[#c3c6d7] rounded-xl px-4 py-3 text-[#131b2e] placeholder:text-[#c3c6d7] outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-all resize-none"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600 font-medium">{formError}</p>
              )}
            </div>

            <div className="p-5 border-t border-[#c3c6d7] shrink-0 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border border-[#c3c6d7] text-[#434655] font-semibold text-sm hover:bg-[#f2f3ff] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {submitting ? "Saving…" : editingBatch ? "Update Batch" : "Add Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deletingBatch}
        title="Delete Batch"
        message={deletingBatch ? `Delete batch ${deletingBatch.batchNumber}? This will update the product's total stock.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingBatch(null)}
      />
    </div>
  );
}
