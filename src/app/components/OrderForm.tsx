import React, { useState, useEffect, useMemo, useRef } from "react";
import Fuse from "fuse.js";
import { ConfirmModal } from "./ConfirmModal";
import { useNavigate, useParams } from "react-router";
import { useFeatureFlags } from "../../lib/featureFlags";
import { ArrowLeft, Save, Trash2, Share2, WifiOff, Plus, X, Sparkles, RotateCcw, CheckCircle, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineOrdersDB } from "../../lib/db";
import {
  getOrder,
  getProducts,
  getCustomers,
  getBatchesForProduct,
  createOrder,
  updateOrder,
  deleteOrder,
  getTags,
  createTag,
  assignTagToOrder,
  removeTagFromOrder,
  getTagsForOrder,
  getNextReceiptNumber,
  uploadReceipt,
  getReceiptDownloadUrl,
  receiptExists,
} from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedOrders, getCachedProducts, getCachedCustomers, getCachedBatches, setCachedProducts, setCachedCustomers } from "../../lib/cache";
import { parseOrderText, type ParsedOrderItem } from "../../lib/orderParser";
import type { Order, Product, Customer, ProductBatch, Tag } from "../../lib/types";

interface OrderItemRow {
  productId: string;
  quantity: string;
  batchId?: string;
  unitPrice?: string;
}

export function OrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const { ai_order_fill } = useFeatureFlags();
  const isOnline = useOnlineStatus();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  const customerFuse = useMemo(() => new Fuse(customers, { keys: ["name", "phone"], threshold: 0.3 }), [customers]);
  const filteredCustomers = customerSearch
    ? customerFuse.search(customerSearch).map((r) => r.item)
    : customers;

  const [formData, setFormData] = useState({
    customerId: "",
    customerName: "",
    date: new Date().toLocaleDateString("en-CA"),
    status: "Pending" as Order["status"],
    paymentStatus: "Unpaid" as Order["paymentStatus"],
    paymentMethod: undefined as Order["paymentMethod"],
    amountPaid: "" as string,
    deliveryDate: "" as string,
    deliveryCharge: "" as string,
    notes: "",
  });
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [deliveryDetailsOpen, setDeliveryDetailsOpen] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const tagSearchRef = useRef<HTMLInputElement>(null);

  const TAG_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

  const filteredTagOptions = allTags.filter(
    (t) => !selectedTags.find((s) => s.id === t.id) && t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([{ productId: "", quantity: "" }]);
  const [saving, setSaving] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  // Batch data per product — keyed by productId, sorted FIFO (oldest first)
  const [productBatches, setProductBatches] = useState<Record<string, ProductBatch[]>>({});

  const getOldestInStock = (batches: ProductBatch[]): ProductBatch | undefined =>
    batches
      .filter((b) => b.numberOfBottles > 0)
      .sort((a, b) => {
        if (!a.manufactureDate && !b.manufactureDate) return 0;
        if (!a.manufactureDate) return 1;
        if (!b.manufactureDate) return -1;
        return new Date(a.manufactureDate).getTime() - new Date(b.manufactureDate).getTime();
      })[0];

  const loadBatchesForProduct = async (productId: string): Promise<ProductBatch[]> => {
    if (!productId) return [];
    if (productBatches[productId]) return productBatches[productId];
    let batches: ProductBatch[] = [];
    if (isSupabaseConfigured() && isOnline) {
      try {
        batches = await getBatchesForProduct(productId);
      } catch {
        batches = (getCachedBatches(productId) as ProductBatch[] | null) ?? [];
      }
    } else {
      batches = (getCachedBatches(productId) as ProductBatch[] | null) ?? [];
    }
    setProductBatches((prev) => ({ ...prev, [productId]: batches }));
    return batches;
  };

  // AI order parser modal
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiText, setAIText] = useState("");
  const [aiStep, setAIStep] = useState<"input" | "confirm">("input");
  const [aiParsing, setAIParsing] = useState(false);
  const [aiParsed, setAIParsed] = useState<ParsedOrderItem[]>([]);

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [customersData, productsData, tagsData] = await Promise.all([getCustomers(), getProducts(), getTags()]);
          setCustomers(customersData);
          setProducts(productsData);
          setAllTags(tagsData);
          setCachedCustomers(customersData);
          setCachedProducts(productsData);
          if (isEditing && id) {
            const [order, orderTags] = await Promise.all([getOrder(id), getTagsForOrder(id)]);
            setSelectedTags(orderTags);
            setExistingOrder(order ?? null);
            if (order) {
              setFormData({
                customerId: order.customerId,
                customerName: order.customerName,
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod,
                amountPaid: order.amountPaid != null ? String(order.amountPaid) : "",
                deliveryDate: order.deliveryDate ?? "",
                deliveryCharge: order.deliveryCharge != null ? String(order.deliveryCharge) : "",
                notes: order.notes ?? "",
              });
              const items = order.items && order.items.length > 0
                ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString(), batchId: i.batchId, unitPrice: i.unitPrice != null ? String(i.unitPrice) : undefined }))
                : [{ productId: order.productId, quantity: order.quantity.toString() }];
              setOrderItems(items);
            }
          }
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          const cp = getCachedProducts() as Product[] | null;
          const co = getCachedOrders() as Order[] | null;
          setCustomers(cc ?? []);
          setProducts(cp ?? []);
          if (isEditing && id) {
            const order = (co ?? []).find((o) => o.id === id) ?? null;
            setExistingOrder(order);
            if (order) {
              setFormData({
                customerId: order.customerId,
                customerName: order.customerName,
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod,
                amountPaid: order.amountPaid != null ? String(order.amountPaid) : "",
                deliveryDate: order.deliveryDate ?? "",
                deliveryCharge: order.deliveryCharge != null ? String(order.deliveryCharge) : "",
                notes: order.notes ?? "",
              });
              const items = order.items && order.items.length > 0
                ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString(), batchId: i.batchId, unitPrice: i.unitPrice != null ? String(i.unitPrice) : undefined }))
                : [{ productId: order.productId, quantity: order.quantity.toString() }];
              setOrderItems(items);
            }
          }
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        const cp = getCachedProducts() as Product[] | null;
        const co = getCachedOrders() as Order[] | null;
        setCustomers(cc ?? []);
        setProducts(cp ?? []);
        if (isEditing && id) {
          const order = (co ?? []).find((o) => o.id === id) ?? null;
          setExistingOrder(order);
          if (order) {
            setFormData({
              customerId: order.customerId,
              customerName: order.customerName,
              date: order.date,
              status: order.status,
              paymentStatus: order.paymentStatus,
              paymentMethod: order.paymentMethod,
              notes: order.notes ?? "",
            });
            const items = order.items && order.items.length > 0
              ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString() }))
              : [{ productId: order.productId, quantity: order.quantity.toString() }];
            setOrderItems(items);
          }
        }
        setLoading(false);
      }
    };
    load();
  }, [isOnline, isEditing, id]);

  useEffect(() => {
    if (!isOnline) {
      toast.info("You're offline. Orders will be saved locally.", { duration: 5000 });
    }
  }, [isOnline]);

  // Auto-load batches for any product in the current order items
  const productIdKey = orderItems.map((i) => i.productId).join(",");
  useEffect(() => {
    const productIds = [...new Set(orderItems.map((i) => i.productId).filter(Boolean))];
    productIds.forEach((pid) => {
      if (!productBatches[pid]) loadBatchesForProduct(pid);
    });
  }, [productIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setFormData({ ...formData, customerId, customerName: customer?.name ?? "" });
    setShowLastOrder(false);
    setCustomerSearch("");
    setCustomerDropdownOpen(false);
  };

  const addItem = () => {
    setOrderItems([...orderItems, { productId: "", quantity: "" }]);
  };

  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItemRow, value: string) => {
    setOrderItems(orderItems.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleProductSelect = async (index: number, productId: string) => {
    // Immediately update productId so UI responds
    setOrderItems((prev) => prev.map((item, i) => i === index ? { ...item, productId, batchId: "", unitPrice: undefined } : item));
    if (!productId) return;
    const batches = await loadBatchesForProduct(productId);
    const oldest = getOldestInStock(batches);
    if (oldest) {
      setOrderItems((prev) => prev.map((item, i) =>
        i === index && item.productId === productId
          ? { ...item, batchId: oldest.id, unitPrice: String(oldest.unitPrice) }
          : item
      ));
    }
  };

  const handleBatchSelect = (index: number, batchId: string) => {
    updateItem(index, "batchId", batchId);
    const batches = productBatches[orderItems[index].productId] ?? [];
    const batch = batches.find((b) => b.id === batchId);
    if (batch) {
      setOrderItems((prev) => prev.map((item, i) =>
        i === index ? { ...item, batchId, unitPrice: String(batch.unitPrice) } : item
      ));
    }
  };

  const getItemBatch = (item: OrderItemRow): ProductBatch | undefined => {
    const batches = productBatches[item.productId] ?? [];
    return batches.find((b) => b.id === item.batchId) ?? getOldestInStock(batches);
  };

  const getEffectiveUnitPrice = (item: OrderItemRow): number => {
    if (item.unitPrice !== undefined && item.unitPrice !== "") {
      const parsed = parseFloat(item.unitPrice);
      if (!isNaN(parsed)) return parsed;
    }
    return getItemBatch(item)?.unitPrice ?? 0;
  };

  const getOrderTotal = () => {
    return orderItems.reduce((sum, item) => {
      const qty = parseInt(item.quantity || "0", 10);
      return sum + getEffectiveUnitPrice(item) * qty;
    }, 0);
  };

  // ── REPEAT LAST ORDER ─────────────────────────────────────────────
  const [showLastOrder, setShowLastOrder] = useState(false);

  const getLastOrder = (): Order | null => {
    if (!formData.customerId) return null;
    const cached = getCachedOrders() as Order[] | null;
    return (cached ?? [])
      .filter((o) => o.customerId === formData.customerId)
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateB - dateA;
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdB - createdA;
      })[0] ?? null;
  };

  const handleRepeatLastOrder = () => {
    const last = getLastOrder();
    if (!last) return;
    const items = last.items && last.items.length > 0
      ? last.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString() }))
      : [{ productId: last.productId, quantity: last.quantity.toString() }];
    setOrderItems(items);
    setShowLastOrder(false);
    toast.success("Filled with last order items");
  };

  // ── AI ORDER PARSER ────────────────────────────────────────────────
  const handleAIParse = async () => {
    if (!aiText.trim()) return;
    setAIParsing(true);
    try {
      const items = await parseOrderText(aiText, products);
      if (items.length === 0) {
        toast.info("Couldn't match any products — try rephrasing");
        return;
      }
      setAIParsed(items);
      setAIStep("confirm");
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse order — check your connection and try again");
    } finally {
      setAIParsing(false);
    }
  };

  const handleAIConfirm = () => {
    setOrderItems(aiParsed.map((item) => ({
      productId: item.productId,
      quantity: item.quantity.toString(),
    })));
    setShowAIModal(false);
    setAIText("");
    setAIStep("input");
    setAIParsed([]);
    toast.success("Order items filled in");
  };

  const closeAIModal = () => {
    setShowAIModal(false);
    setAIText("");
    setAIStep("input");
    setAIParsed([]);
  };

  const handleShare = () => {
    if (orderItems.some((i) => !i.productId || !i.quantity)) {
      toast.error("Please fill in all order items before sharing");
      return;
    }
    const date = new Date(formData.date + "T00:00:00").toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    const itemLines = orderItems.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const price = getEffectiveUnitPrice(item);
      const qty = parseInt(item.quantity || "0", 10);
      const subtotal = price * qty;
      return `• ${product?.name ?? "Unknown"} (${product?.unitSize}L/bottle) — ${qty} bottles @ ₹${price}/bottle = ₹${subtotal.toLocaleString("en-IN")}`;
    }).join("\n");
    const total = getOrderTotal().toLocaleString("en-IN", { maximumFractionDigits: 0 });

    const message = [
      `*Order Summary*`,
      `Here are your order details.`,
      ``,
      `*Items:*`,
      itemLines,
      ``,
      `*Total: ₹${total}*`,
      `Date: ${date}`,
      ``,
      `_"Health begins in the kitchen."_`,
      `_Thank you for choosing us for your health!_`,
    ].join("\n").trim();

    const customer = customers.find((c) => c.id === formData.customerId);
    const rawPhone = customer?.phone?.replace(/\D/g, "") ?? "";
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handleDownloadReceipt = async () => {
    if (!existingOrder) return;
    setDownloadingReceipt(true);
    try {
      const filename = `Receipt_${existingOrder.date}_${existingOrder.customerName.replace(/\s+/g, "_")}.pdf`;

      // Check storage directly — most reliable source of truth
      const exists = await receiptExists(existingOrder.id);
      if (exists) {
        const signedUrl = await getReceiptDownloadUrl(existingOrder.id);
        if (signedUrl) {
          window.open(signedUrl, "_blank", "noopener,noreferrer");
          toast.success("Receipt opened");
          return;
        }
      }

      // Not in storage — generate, upload (+ save receipt number atomically), open
      const { generateReceiptPDF } = await import("../../lib/receiptGenerator");
      const receiptNum = existingOrder.receiptNumber ?? await getNextReceiptNumber(existingOrder.date);
      const pdfBlob = generateReceiptPDF(existingOrder, products, receiptNum);
      await uploadReceipt(existingOrder.id, pdfBlob, existingOrder.receiptNumber ? undefined : receiptNum);
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Receipt opened");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download receipt");
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!formData.customerName) {
        toast.error("Please select a customer");
        return;
      }
      if (orderItems.length === 0) {
        toast.error("Please add at least one item to the order");
        return;
      }
      for (let i = 0; i < orderItems.length; i++) {
        if (!orderItems[i].productId) {
          toast.error(`Please select a product for item ${i + 1}`);
          return;
        }
        const qty = parseInt(orderItems[i].quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          toast.error(`Please enter a valid quantity for item ${i + 1}`);
          return;
        }
        const batch = getItemBatch(orderItems[i]);
        if (!batch) {
          toast.error("Something went wrong. Please try again.");
          return;
        }
      }

      const parsedItems = orderItems.map((item) => ({
        productId: item.productId,
        quantity: parseInt(item.quantity, 10),
        batchId: item.batchId || undefined,
        unitPrice: getEffectiveUnitPrice(item),
      }));

      if (!isOnline && !isEditing) {
        await offlineOrdersDB.put({
          id: `offline-${Date.now()}`,
          customerId: formData.customerId,
          customerName: formData.customerName,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          notes: formData.notes,
          items: orderItems,
          createdAt: new Date().toISOString(),
        });
        toast.success("Order saved. It will sync automatically when you're back online.", { duration: 5000 });
        navigate("/orders");
        return;
      }

      if (!isSupabaseConfigured()) {
        toast.success(isEditing ? "Order updated." : "Order created.");
        navigate("/orders");
        return;
      }

      for (const item of parsedItems) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          toast.error(`Product not found for item`);
          return;
        }
        if (product.stock < item.quantity) {
          toast.error(`Insufficient stock for ${product.name} (available: ${product.stock} bottles)`);
          return;
        }
      }

      const amountPaidNum = formData.paymentStatus === "Partial" ? parseFloat(formData.amountPaid) || 0 : undefined;
      const deliveryChargeNum = formData.deliveryCharge ? parseFloat(formData.deliveryCharge) || 0 : undefined;
      const deliveryDateVal = formData.deliveryDate || null;
      let savedOrderId = id;
      if (isEditing && id) {
        await updateOrder(id, {
          customerId: formData.customerId,
          customerName: formData.customerName,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          paymentMethod: formData.paymentStatus === "Paid" ? formData.paymentMethod : null,
          amountPaid: amountPaidNum,
          deliveryDate: deliveryDateVal,
          deliveryCharge: deliveryChargeNum,
          notes: formData.notes || undefined,
          items: parsedItems,
        });
        // Sync tags: remove all then re-assign
        const existing = await getTagsForOrder(id);
        await Promise.all(existing.map((t) => removeTagFromOrder(id, t.id)));
        await Promise.all(selectedTags.map((t) => assignTagToOrder(id, t.id)));
        toast.success("Order updated successfully!");
      } else {
        const newOrder = await createOrder({
          customerId: formData.customerId,
          customerName: formData.customerName,
          productId: parsedItems[0].productId,
          quantity: parsedItems[0].quantity,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          paymentMethod: formData.paymentStatus === "Paid" ? formData.paymentMethod : undefined,
          amountPaid: amountPaidNum,
          deliveryDate: deliveryDateVal ?? undefined,
          deliveryCharge: deliveryChargeNum,
          notes: formData.notes || undefined,
          items: parsedItems,
        });
        savedOrderId = newOrder.id;
        await Promise.all(selectedTags.map((t) => assignTagToOrder(savedOrderId!, t.id)));
        toast.success("Order created successfully!");
      }

      // Regenerate receipt only if: status just changed to Delivered, OR receipt-relevant
      // fields changed (items, prices, delivery charge, date, customer). Payment-only
      // changes do not affect the receipt so skip regeneration in that case.
      const wasDelivered = existingOrder?.status === "Delivered";
      const statusChangedToDelivered = !wasDelivered && formData.status === "Delivered";
      const receiptFieldsChanged = wasDelivered && (
        existingOrder?.customerName !== formData.customerName ||
        existingOrder?.date !== formData.date ||
        (existingOrder?.deliveryCharge ?? 0) !== (deliveryChargeNum ?? 0) ||
        JSON.stringify(parsedItems.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice }))) !==
        JSON.stringify((existingOrder?.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice ?? 0 })))
      );
      if (formData.status === "Delivered" && savedOrderId && (statusChangedToDelivered || receiptFieldsChanged)) {
        const { generateReceiptPDF } = await import("../../lib/receiptGenerator");
        const savedOrder = await getOrder(savedOrderId!);
        if (savedOrder) {
          const receiptNum = savedOrder.receiptNumber ?? await getNextReceiptNumber(savedOrder.date);
          const pdfBlob = generateReceiptPDF(savedOrder, products, receiptNum);
          // upsert:true overwrites existing file; only save receipt number if new
          await uploadReceipt(savedOrderId!, pdfBlob, savedOrder.receiptNumber ? undefined : receiptNum);
        }
      }

      navigate("/orders");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState<string | null>(null);

  const handleDelete = () => setShowDeleteConfirm(true);

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (!isOnline || !isSupabaseConfigured() || !id) {
      toast.success("Order deleted");
      navigate("/orders");
      return;
    }
    try {
      await deleteOrder(id);
      toast.success("Order deleted");
      navigate("/orders");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete order");
    }
  };

  if (loading && isEditing) {
    return (
      <div className="min-h-screen bg-[#faf8ff] pb-32 animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="w-9 h-9 rounded-xl bg-[#e2e7ff]" />
          <div className="h-5 w-24 bg-[#e2e7ff] rounded-full" />
          <div className="w-9 h-9 rounded-xl bg-[#e2e7ff]" />
        </div>
        <div className="space-y-4 mt-4 max-w-2xl lg:max-w-4xl mx-auto px-5">
          {/* Customer card */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <div className="h-4 w-20 bg-[#e2e7ff] rounded-full mb-3" />
            <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
          </div>
          {/* Order items card */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <div className="flex items-center justify-between mb-4">
              <div className="h-4 w-20 bg-[#e2e7ff] rounded-full" />
              <div className="h-8 w-8 bg-[#e2e7ff] rounded-xl" />
            </div>
            <div className="space-y-3">
              <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
              <div className="h-12 w-full bg-[#e2e7ff] rounded-xl" />
            </div>
          </div>
          {/* Status / notes card */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <div className="h-3.5 w-16 bg-[#e2e7ff] rounded-full mb-2" />
                <div className="h-12 bg-[#e2e7ff] rounded-xl" />
              </div>
              <div>
                <div className="h-3.5 w-24 bg-[#e2e7ff] rounded-full mb-2" />
                <div className="h-12 bg-[#e2e7ff] rounded-xl" />
              </div>
            </div>
            <div className="h-3.5 w-12 bg-[#e2e7ff] rounded-full mb-2" />
            <div className="h-20 bg-[#e2e7ff] rounded-xl" />
          </div>
          {/* Submit button */}
          <div className="h-14 bg-[#e2e7ff] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isEditing && id && !existingOrder && !loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] flex flex-col items-center justify-center pb-32 gap-4">
        <p className="text-[#737686]">Order not found</p>
        <button onClick={() => navigate("/orders")} className="text-[#2563eb] font-semibold">
          Back to Orders
        </button>
      </div>
    );
  }

  const isLocked = isEditing && formData.status !== "Pending";

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <button
          onClick={() => navigate("/orders")}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f3ff] text-[#434655] hover:bg-[#eaedff] transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-[#131b2e]">
          {isEditing ? "Edit Order" : "New Order"}
        </h1>
        {isEditing ? (
          <div className="flex items-center gap-2">
            {(formData.status === "Delivered" || existingOrder?.status === "Delivered") && (
              <button
                type="button"
                onClick={handleDownloadReceipt}
                disabled={downloadingReceipt}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors active:scale-95 disabled:opacity-50 text-sm font-semibold"
                title="Open receipt"
              >
                {downloadingReceipt
                  ? <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  : <FileDown className="h-4 w-4" />}
                <span className="hidden lg:inline">Receipt</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f2f3ff] text-[#434655] hover:bg-[#eaedff] transition-colors active:scale-95 text-sm font-semibold"
              title="Share order"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden lg:inline">Share</span>
            </button>
          </div>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 max-w-2xl lg:max-w-4xl mx-5 lg:mx-auto">
          <WifiOff className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">You're offline</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Orders will be saved locally and synced when you're back online
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-w-2xl lg:max-w-4xl mx-auto px-5">
        {/* Customer section */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="customerId" className="text-sm font-semibold text-[#131b2e]">
              Customer <span className="text-red-500">*</span>
            </label>
            <Link
              to="/customers/new"
              className="text-[#2563eb] text-xs font-semibold hover:text-[#004ac6] transition-colors flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              
            </Link>
          </div>
          <div className="relative">
            <input
              ref={customerSearchRef}
              type="text"
              placeholder={formData.customerName || "Search customer…"}
              value={customerDropdownOpen ? customerSearch : (formData.customerName || "")}
              onFocus={() => {
                setCustomerDropdownOpen(true);
                setCustomerSearch("");
              }}
              onChange={(e) => setCustomerSearch(e.target.value)}
              onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
              className="w-full px-4 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            />
            {customerDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-[#c3c6d7] rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[#737686]">No customers found</div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={() => handleCustomerChange(customer.id)}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-[#f2f3ff] transition-colors ${formData.customerId === customer.id ? "bg-[#eaedff] font-semibold text-[#004ac6]" : "text-[#131b2e]"}`}
                    >
                      {customer.name}
                      {customer.phone && <span className="ml-2 text-xs text-[#737686]">{customer.phone}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {formData.customerId && (
            <p className="mt-2.5 text-xs text-[#737686] flex items-start gap-1.5">
              <span className="font-medium text-[#434655]">Delivery:</span>
              {customers.find((c) => c.id === formData.customerId)?.address}
            </p>
          )}
          {!isLocked && getLastOrder() && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowLastOrder((v) => !v)}
                className="w-full flex items-center justify-between gap-2 bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] rounded-xl py-3 px-4 text-sm font-semibold transition-colors active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Last Order
                </div>
                <svg
                  className={`h-4 w-4 transition-transform ${showLastOrder ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {showLastOrder && (() => {
                const last = getLastOrder()!;
                const lastItems = last.items && last.items.length > 0
                  ? last.items
                  : [{ productId: last.productId, quantity: last.quantity }];
                return (
                  <div className="mt-1 bg-[#f2f3ff] rounded-xl px-4 py-3 space-y-2">
                    <p className="text-xs text-[#737686]">
                      {new Date(last.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <div className="space-y-1.5">
                      {lastItems.map((item, i) => {
                        const product = products.find((p) => p.id === item.productId);
                        return (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-[#131b2e] font-medium">{product?.name ?? "Unknown"}</span>
                            <span className="text-[#737686]">{item.quantity} bottles{product?.unitSize ? ` · ${product.unitSize}L each` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={handleRepeatLastOrder}
                      className="w-full mt-1 bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors active:scale-95"
                    >
                      Use this order
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Order Items section */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-[#131b2e]">Oil Items <span className="text-red-500">*</span></h2>
              <p className="text-xs text-[#737686] mt-0.5">Select oil type and quantity</p>
            </div>
            <div className="flex items-center gap-2">
              {isSupabaseConfigured() && ai_order_fill && (
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => setShowAIModal(true)}
                    disabled={isLocked}
                    className="flex items-center gap-1.5 bg-[#eaedff] hover:bg-[#dae2fd] text-[#004ac6] rounded-xl px-3 py-2 text-xs font-semibold transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Fill
                  </button>
                  <div className="absolute bottom-full mb-2 right-0 bg-[#131b2e] text-white text-xs rounded-xl px-3 py-2 w-52 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    Paste a WhatsApp message or describe the order — AI will fill the items automatically
                    <div className="absolute top-full right-3 border-4 border-transparent border-t-[#131b2e]" />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={addItem}
                disabled={isLocked}
                className="flex items-center gap-1.5 bg-[#eaedff] hover:bg-[#dae2fd] text-[#004ac6] rounded-xl px-3 py-2 text-xs font-semibold transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {isLocked && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-amber-500 text-base leading-none mt-0.5">🔒</span>
              <p className="text-xs text-amber-700">
                Order items can only be edited in <span className="font-semibold">Pending</span> state. Change the status to Pending to modify items.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {orderItems.map((item, index) => {
              const selectedProduct = products.find((p) => p.id === item.productId);
              const allBatchesForProduct = productBatches[item.productId] ?? [];
              const batchesForProduct = allBatchesForProduct.filter((b) => b.numberOfBottles > 0 || b.id === item.batchId);
              const selectedBatch = batchesForProduct.find((b) => b.id === item.batchId) ?? batchesForProduct[0];
              const qty = parseInt(item.quantity || "0", 10);
              const effectivePrice = getEffectiveUnitPrice(item);
              const subtotal = effectivePrice * qty;
              const batchPrice = selectedBatch?.unitPrice;
              const isDiscounted = batchPrice != null && item.unitPrice !== undefined && item.unitPrice !== "" && parseFloat(item.unitPrice) !== batchPrice;

              return (
                <div
                  key={index}
                  className="bg-[#f2f3ff] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[#737686] uppercase tracking-wide">
                      Item {index + 1}
                    </span>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="flex items-center gap-1 text-red-500 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <select
                      value={item.productId}
                      onChange={(e) => handleProductSelect(index, e.target.value)}
                      disabled={isLocked}
                      className="w-full px-4 py-3 bg-white border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    >
                      <option value="">Select oil type</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.unitSize}L/bottle ({product.stock} bottles)
                        </option>
                      ))}
                    </select>

                    {item.productId && batchesForProduct.length > 0 && (
                      <select
                        value={item.batchId ?? ""}
                        onChange={(e) => handleBatchSelect(index, e.target.value)}
                        disabled={isLocked}
                        className="w-full px-4 py-3 bg-white border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {batchesForProduct.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.batchNumber} — ₹{batch.unitPrice}/bottle ({batch.numberOfBottles} bottles left)
                          </option>
                        ))}
                      </select>
                    )}

                    {item.productId && selectedBatch && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-[#737686] uppercase tracking-wide mb-1 block">
                            Price / bottle
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#737686] font-medium">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice ?? ""}
                              onChange={(e) => setOrderItems((prev) => prev.map((it, i) => i === index ? { ...it, unitPrice: e.target.value } : it))}
                              placeholder={String(selectedBatch.unitPrice)}
                              disabled={isLocked}
                              className={`w-full pl-7 pr-3 py-2.5 bg-white border rounded-xl text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isDiscounted ? "border-amber-400 focus:border-amber-400" : "border-[#c3c6d7] focus:border-[#2563eb]"}`}
                            />
                          </div>
                        </div>
                        {isDiscounted && batchPrice != null && (
                          <div className="text-xs text-amber-600 font-medium pt-5 flex-shrink-0">
                            -{(batchPrice - parseFloat(item.unitPrice ?? "0")).toFixed(0)} off
                          </div>
                        )}
                      </div>
                    )}
                    {item.productId && batchesForProduct.length === 0 && (
                      <p className="text-xs text-amber-600 px-1">No batches available — add stock via Inventory</p>
                    )}

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      placeholder="Number of bottles"
                      disabled={isLocked}
                      className="w-full px-4 py-3 bg-white border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-sm placeholder:text-[#737686] disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    />
                    {item.productId && item.quantity && selectedBatch && (
                      <div className="flex items-center justify-between px-1">
                        <p className="text-xs text-[#737686]">Subtotal</p>
                        <div className="text-right">
                          <p className="font-bold text-[#131b2e] text-sm">₹{subtotal.toFixed(2)}</p>
                          {isDiscounted && batchPrice != null && (
                            <p className="text-[10px] text-amber-600">was ₹{(batchPrice * qty).toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedProduct && (
                      <p className="text-xs text-[#737686]">
                        Stock available: {selectedProduct.stock} bottles
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {orderItems.some((i) => i.productId && i.quantity) && (
            <div className="mt-4 pt-4 border-t border-[#c3c6d7] flex items-center justify-between gap-3">
              <span className="font-semibold text-[#131b2e]">Order Total</span>
              <span className="text-xl font-bold text-[#004ac6] flex-shrink-0">₹{getOrderTotal().toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>

        {/* Date */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <label htmlFor="date" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            required
          />
        </div>

        {/* Order Status (edit only) */}
        {isEditing && (
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <label htmlFor="status" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Order Status
            </label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => {
                const next = e.target.value as Order["status"];
                if (existingOrder?.status === "Cancelled" && next !== "Cancelled") {
                  setShowReactivateConfirm(next);
                  return;
                }
                setFormData({ ...formData, status: next });
              }}
              className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            >
              <option value="Pending">Pending</option>
              {/* From Cancelled, only allow back to Pending — not directly to Packed/Delivered */}
              {existingOrder?.status !== "Cancelled" && <option value="Packed">Packed</option>}
              {existingOrder?.status !== "Cancelled" && <option value="Delivered">Delivered</option>}
              <option value="Cancelled">Cancelled</option>
            </select>
            {existingOrder?.status === "Cancelled" && (
              <p className="text-xs text-amber-600 mt-1.5">
                Cancelled orders can only be reactivated to Pending first.
              </p>
            )}
          </div>
        )}

        {/* Payment Status (edit only) */}
        {isEditing && (
          <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
            <div className="p-5">
              <label htmlFor="paymentStatus" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                Payment Status
              </label>
              <select
                id="paymentStatus"
                value={formData.paymentStatus}
                onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value as Order["paymentStatus"], paymentMethod: e.target.value === "Unpaid" ? undefined : formData.paymentMethod, amountPaid: e.target.value !== "Partial" ? "" : formData.amountPaid })}
                className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            {/* Collapsible payment details */}
            {formData.paymentStatus !== "Unpaid" && (
              <div className="border-t border-[#f2f3ff]">
                <button
                  type="button"
                  onClick={() => setPaymentDetailsOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-[#434655]"
                >
                  <span>Payment Details</span>
                  <span className={`transition-transform ${paymentDetailsOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                {paymentDetailsOpen && (
                  <div className="px-5 pb-5 space-y-4">
                    {formData.paymentStatus === "Partial" && (
                      <div>
                        <label htmlFor="amountPaid" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                          Amount Paid (₹)
                        </label>
                        <input
                          id="amountPaid"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.amountPaid}
                          onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                        />
                      </div>
                    )}
                    <div>
                      <label htmlFor="paymentMethod" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                        Payment Method
                      </label>
                      <select
                        id="paymentMethod"
                        value={formData.paymentMethod ?? ""}
                        onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as Order["paymentMethod"] })}
                        className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                      >
                        <option value="">Select method</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Delivery Details */}
        <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <button
            type="button"
            onClick={() => setDeliveryDetailsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-[#131b2e]"
          >
            <span>Delivery Details</span>
            <span className={`transition-transform inline-block ${deliveryDetailsOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {deliveryDetailsOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-[#f2f3ff] pt-4">
              <div>
                <label htmlFor="deliveryDate" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                  Delivery Date
                </label>
                <input
                  id="deliveryDate"
                  type="date"
                  value={formData.deliveryDate}
                  onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                  className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                />
              </div>
              <div>
                <label htmlFor="deliveryCharge" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
                  Delivery Charge (₹)
                </label>
                <input
                  id="deliveryCharge"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.deliveryCharge}
                  onChange={(e) => setFormData({ ...formData, deliveryCharge: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-5 py-3.5 bg-[#f2f3ff] border border-[#c3c6d7] rounded-xl text-[#131b2e] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <label className="block text-sm font-semibold text-[#131b2e] mb-2">Tags</label>
          {/* Selected tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => setSelectedTags((prev) => prev.filter((t) => t.id !== tag.id))}
                  className="hover:opacity-70 ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => { setTagDropdownOpen(true); setTimeout(() => tagSearchRef.current?.focus(), 50); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#f2f3ff] text-[#004ac6] border border-dashed border-[#c3c6d7] hover:border-[#004ac6] transition-colors"
            >
              <Plus className="h-3 w-3" /> Add tag
            </button>
          </div>
          {/* Tag dropdown */}
          {tagDropdownOpen && (
            <div className="border border-[#c3c6d7] rounded-xl overflow-hidden">
              <input
                ref={tagSearchRef}
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search or create tag..."
                className="w-full px-4 py-2.5 text-sm text-[#131b2e] placeholder:text-[#737686] focus:outline-none border-b border-[#f2f3ff]"
              />
              <div className="max-h-48 overflow-y-auto">
                {filteredTagOptions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => { setSelectedTags((prev) => [...prev, tag]); setTagSearch(""); setTagDropdownOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#f2f3ff] transition-colors text-left"
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="text-sm text-[#131b2e]">{tag.name}</span>
                  </button>
                ))}
                {tagSearch.trim() && !allTags.find((t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                  <div className="px-4 py-3 border-t border-[#f2f3ff]">
                    {!creatingTag ? (
                      <div className="space-y-2">
                        <p className="text-xs text-[#737686]">Create <strong className="text-[#131b2e]">"{tagSearch.trim()}"</strong></p>
                        <div className="flex gap-1.5 flex-wrap">
                          {TAG_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewTagColor(c)}
                              className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? "scale-125 ring-2 ring-offset-1 ring-[#004ac6]" : ""}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            setCreatingTag(true);
                            try {
                              const newTag = await createTag(tagSearch.trim(), newTagColor);
                              setAllTags((prev) => [...prev, newTag]);
                              setSelectedTags((prev) => [...prev, newTag]);
                              setTagSearch("");
                              setTagDropdownOpen(false);
                            } catch { toast.error("Failed to create tag"); }
                            setCreatingTag(false);
                          }}
                          className="text-xs font-semibold text-white bg-[#004ac6] px-3 py-1.5 rounded-lg hover:bg-[#003ea8] transition-colors"
                        >
                          Create tag
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-[#737686]">Creating...</p>
                    )}
                  </div>
                )}
                {filteredTagOptions.length === 0 && !tagSearch.trim() && (
                  <p className="px-4 py-3 text-xs text-[#737686]">No more tags to add</p>
                )}
              </div>
              <div className="border-t border-[#f2f3ff] px-4 py-2 flex justify-end">
                <button type="button" onClick={() => { setTagDropdownOpen(false); setTagSearch(""); }} className="text-xs text-[#737686] hover:text-[#131b2e]">Done</button>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
          <label htmlFor="notes" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
            Notes
          </label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Add any special instructions or notes"
            rows={4}
            className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white text-[#131b2e] placeholder:text-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 resize-none"
          />
        </div>

        {/* Submit + Delete */}
        <div className="space-y-3 px-5">
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-2xl py-4 font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-70"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                {isEditing ? "Saving…" : "Creating…"}
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {isEditing ? "Save Changes" : "Create Order"}
              </>
            )}
          </button>

          {isEditing && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleDelete}
                disabled={formData.status !== "Pending" && formData.status !== "Cancelled"}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-2xl py-4 font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
              >
                <Trash2 className="h-5 w-5" />
                Delete Order
              </button>
              {formData.status !== "Pending" && formData.status !== "Cancelled" && (
                <p className="text-xs text-center text-[#737686]">
                  Orders can only be deleted when status is Pending or Cancelled
                </p>
              )}
            </div>
          )}
        </div>
      </form>

      {/* ── AI ORDER PARSER MODAL ─────────────────────────────────── */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[60]">
          <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-[0_4px_16px_rgba(0,74,198,0.12)] flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="p-5 border-b border-[#c3c6d7] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#004ac6]" />
                <h2 className="text-base font-bold text-[#131b2e]">
                  {aiStep === "input" ? "Describe the Order" : "Confirm Items"}
                </h2>
              </div>
              <button
                onClick={closeAIModal}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f2f3ff] text-[#737686] hover:bg-[#eaedff] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {aiStep === "input" ? (
              <>
                <div className="p-5 space-y-3 overflow-y-auto flex-1">
                  <p className="text-sm text-[#737686]">
                    Type or paste the order in plain text — e.g. a WhatsApp message or a spoken description.
                  </p>
                  <textarea
                    autoFocus
                    value={aiText}
                    onChange={(e) => setAIText(e.target.value)}
                    placeholder={"e.g. \"10L groundnut, 5 sunflower oil, coconut 3 litres, 20L palm\""}
                    rows={3}
                    className="w-full rounded-xl border border-[#c3c6d7] bg-[#f2f3ff] px-4 py-3 text-sm text-[#131b2e] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors resize-none"
                  />
                </div>
                <div className="p-4 flex gap-3 border-t border-[#c3c6d7] shrink-0">
                  <button
                    type="button"
                    onClick={closeAIModal}
                    className="flex-1 bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] rounded-xl py-3 font-semibold text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAIParse}
                    disabled={aiParsing || !aiText.trim()}
                    className="flex-1 bg-[#004ac6] hover:bg-[#003ea8] disabled:opacity-60 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
                  >
                    {aiParsing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                        </svg>
                        Parsing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Parse Order
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 space-y-3 overflow-y-auto flex-1">
                  <p className="text-sm text-[#737686]">
                    AI matched {aiParsed.length} item{aiParsed.length !== 1 ? "s" : ""}. Review before applying.
                  </p>
                  {aiParsed.map((item, i) => {
                    const product = products.find((p) => p.id === item.productId);
                    const unitSize = product?.unitSize ?? 1;
                    const containers = unitSize > 1 ? Math.ceil(item.quantity / unitSize) : null;
                    return (
                      <div key={i} className="rounded-xl border border-[#c3c6d7] bg-[#f2f3ff] p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#131b2e] truncate text-sm">{item.productName}</p>
                          <p className="text-xs text-[#737686] mt-0.5">
                            {item.quantity} L
                            {containers && (
                              <span className="ml-1 text-[#004ac6] font-medium">
                                ({containers} × {unitSize}L)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-[#737686]">Price set per batch</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-[#c3c6d7] flex items-center justify-between gap-3">
                    <span className="font-semibold text-[#131b2e] text-sm">Total</span>
                    <span className="text-xs text-[#737686]">Calculated after batch selection</span>
                  </div>
                </div>
                <div className="p-4 flex gap-3 border-t border-[#c3c6d7] shrink-0">
                  <button
                    type="button"
                    onClick={() => setAIStep("input")}
                    className="flex-1 bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] rounded-xl py-3 font-semibold text-sm transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleAIConfirm}
                    className="flex-1 bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-xl py-3 flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Fill Order
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Order"
        message="Are you sure you want to delete this order? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        isOpen={!!showReactivateConfirm}
        title="Reactivate Order"
        message="This cancelled order will be moved back to Pending."
        confirmLabel="Reactivate"
        variant="primary"
        onConfirm={() => {
          if (showReactivateConfirm) setFormData({ ...formData, status: showReactivateConfirm as Order["status"] });
          setShowReactivateConfirm(null);
        }}
        onCancel={() => setShowReactivateConfirm(null)}
      />
    </div>
  );
}
