import React,{ useState, useEffect, useMemo } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper, type SortingState, type Column, type VisibilityState, type RowSelectionState, getFilteredRowModel } from "@tanstack/react-table";
import Fuse from "fuse.js";
import { ConfirmModal } from "./ConfirmModal";
import { Link } from "react-router";
import { getOrdersPaginated, getProducts, updateOrder, InsufficientStockError, getTags, getNextReceiptNumber, saveReceiptNumber/*, uploadReceipt, getReceiptDownloadUrl, receiptExists*/ } from "../../lib/api";
import { toast } from "sonner";
import { getCachedOrders, getCachedProducts, setCachedProducts, setCachedOrders } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineOrdersDB, type OfflineOrder } from "../../lib/db";
import { SYNC_COMPLETE_EVENT } from "../hooks/useOfflineSync";
import type { Order, Product, Tag } from "../../lib/types";
import { Plus, Calendar, User, Package as PackageIcon, List, ArrowUpDown, Search, IndianRupee, Clock, ChevronDown, Table2, FileDown } from "lucide-react";

type ViewMode = "list" | "table";
type SortOrder = "recent" | "oldest";
type StatusFilter = "All" | "Pending" | "Packed" | "Delivered" | "Cancelled";
type PaymentFilter = "All" | "Unpaid" | "Partial" | "Paid";

const colHelper = createColumnHelper<Order>();

const statusColors: Record<string, string> = {
  Pending: "bg-orange-50 text-orange-700",
  Packed: "bg-[#eaedff] text-[#004ac6]",
  Delivered: "bg-green-50 text-green-700",
  Cancelled: "bg-red-50 text-red-600",
};
const payColors: Record<string, string> = {
  Paid: "bg-green-50 text-green-700",
  Unpaid: "bg-orange-50 text-orange-700",
  Partial: "bg-orange-100 text-orange-700",
};

function getPinStyles(column: Column<Order>): React.CSSProperties {
  const isPinned = column.getIsPinned();
  if (!isPinned) return {};
  return {
    position: "sticky",
    left: isPinned === "left" ? column.getStart("left") : undefined,
    zIndex: 1,
  };
}

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (!direction) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1">{direction === "asc" ? "↑" : "↓"}</span>;
}

const TOGGLEABLE_COLUMNS = ["items", "paid", "deliveryDate", "deliveryCharge", "profit", "tags"];
const COLUMN_LABELS: Record<string, string> = {
  items: "Items", paid: "Paid", deliveryDate: "Delivery Date", deliveryCharge: "Delivery Charge", profit: "Profit", tags: "Tags",
};

function OrdersTable({
  orders,
  products,
  getProductName,
  calculateOrderTotal,
  calculateOrderProfit,
  formatDate,
  onBulkAction,
  onDownloadReceipt,
}: {
  orders: Order[];
  products: Product[];
  getProductName: (id: string) => string;
  calculateOrderTotal: (o: Order) => number;
  calculateOrderProfit: (o: Order) => number;
  formatDate: (d: string) => string;
  onBulkAction: (ids: string[], action: "delivered" | "paid") => Promise<void>;
  onDownloadReceipt: (order: Order) => Promise<void>;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showColMenu, setShowColMenu] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const selectedIds = Object.keys(rowSelection).map((idx) => orders[Number(idx)]?.id).filter(Boolean);
  const selectedOrders = Object.keys(rowSelection).map((idx) => orders[Number(idx)]).filter(Boolean);
  const selectedProfit = selectedOrders.reduce((sum, o) => sum + calculateOrderProfit(o), 0);
  const selectedRevenue = selectedOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0);

  const handleBulkAction = async (action: "delivered" | "paid") => {
    if (!selectedIds.length) return;
    setBulkLoading(true);
    await onBulkAction(selectedIds, action);
    setRowSelection({});
    setBulkLoading(false);
  };

  const columns = useMemo(() => [
    colHelper.display({
      id: "select",
      size: 40,
      enableResizing: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="rounded border-[#c3c6d7] accent-[#004ac6] cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-[#c3c6d7] accent-[#004ac6] cursor-pointer"
        />
      ),
    }),
    colHelper.accessor("date", {
      header: "Date",
      size: 110,
      enableSorting: true,
      enableResizing: true,
      cell: (info) => <span className="text-[#737686] tabular-nums whitespace-nowrap">{formatDate(info.getValue())}</span>,
    }),
    colHelper.accessor("customerName", {
      header: "Customer",
      size: 180,
      enableSorting: true,
      enableResizing: true,
      cell: (info) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#eaedff] flex items-center justify-center font-bold text-[11px] text-[#004ac6] flex-shrink-0">
            {info.getValue()[0]}
          </div>
          <span className="font-semibold text-[#131b2e] truncate">{info.getValue()}</span>
        </div>
      ),
    }),
    colHelper.display({
      id: "items",
      header: "Items",
      size: 180,
      enableResizing: true,
      cell: ({ row }) => {
        const o = row.original;
        const summary = o.items && o.items.length > 1 ? `${o.items.length} items` : getProductName(o.productId);
        return <span className="text-[#434655] truncate">{summary}</span>;
      },
    }),
    colHelper.display({
      id: "amount",
      header: () => <span className="w-full text-right block">Amount</span>,
      size: 100,
      enableResizing: true,
      cell: ({ row }) => {
        const total = calculateOrderTotal(row.original);
        return <span className="font-bold text-[#131b2e] tabular-nums block text-right">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>;
      },
    }),
    colHelper.display({
      id: "paid",
      header: () => <span className="w-full text-right block">Paid</span>,
      size: 100,
      enableResizing: true,
      cell: ({ row }) => {
        const o = row.original;
        const total = calculateOrderTotal(o);
        if (o.paymentStatus === "Partial") return (
          <div className="text-right">
            <div className="font-semibold text-green-700 tabular-nums">₹{(o.amountPaid ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div className="text-[10px] text-red-500 tabular-nums">-₹{Math.max(0, total - (o.amountPaid ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
          </div>
        );
        if (o.paymentStatus === "Paid") return <span className="text-green-700 font-semibold tabular-nums block text-right">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>;
        return <span className="text-[#737686] block text-right">—</span>;
      },
    }),
    colHelper.accessor("status", {
      header: "Status",
      size: 100,
      enableResizing: true,
      cell: (info) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColors[info.getValue()] ?? "bg-[#f2f3ff] text-[#434655]"}`}>
          {info.getValue()}
        </span>
      ),
    }),
    colHelper.accessor("paymentStatus", {
      header: "Payment",
      size: 100,
      enableResizing: true,
      cell: (info) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${payColors[info.getValue()] ?? "bg-[#f2f3ff] text-[#434655]"}`}>
          {info.getValue()}
        </span>
      ),
    }),
    colHelper.accessor("deliveryDate", {
      header: "Delivery Date",
      size: 120,
      enableSorting: true,
      enableResizing: true,
      cell: (info) => {
        const d = info.getValue();
        return d ? <span className="text-[#737686] tabular-nums whitespace-nowrap">{formatDate(d)}</span> : <span className="text-[#737686]">—</span>;
      },
    }),
    colHelper.display({
      id: "deliveryCharge",
      header: () => <span className="w-full text-right block">Delivery</span>,
      size: 90,
      enableResizing: true,
      cell: ({ row }) => {
        const c = row.original.deliveryCharge;
        return c ? <span className="block text-right tabular-nums text-[#434655]">₹{c.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span> : <span className="block text-right text-[#737686]">—</span>;
      },
    }),
    colHelper.display({
      id: "profit",
      header: () => <span className="w-full text-right block">Profit</span>,
      size: 100,
      enableResizing: true,
      cell: ({ row }) => {
        const profit = calculateOrderProfit(row.original);
        if (profit === 0) return <span className="block text-right text-[#737686]">—</span>;
        const color = profit > 0 ? "text-green-700" : "text-red-600";
        return (
          <span className={`font-semibold tabular-nums block text-right ${color}`}>
            {profit > 0 ? "+" : ""}₹{profit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        );
      },
    }),
    colHelper.display({
      id: "tags",
      header: "Tags",
      size: 160,
      enableResizing: true,
      cell: ({ row }) => {
        const tags = row.original.tags;
        if (!tags || tags.length === 0) return <span className="text-[#737686]">—</span>;
        const visible = tags.slice(0, 2);
        const overflow = tags.length - 2;
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {visible.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
                style={{ backgroundColor: t.color }}
              >
                {t.name}
              </span>
            ))}
            {overflow > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#eaedff] text-[#004ac6] whitespace-nowrap cursor-default"
                title={tags.slice(2).map((t) => t.name).join(", ")}
              >
                +{overflow}
              </span>
            )}
          </div>
        );
      },
    }),
    colHelper.display({
      id: "action",
      header: "",
      size: 100,
      enableResizing: false,
      cell: ({ row }) => {
        const order = row.original;
        const isDelivered = order.status === "Delivered";
        const [downloading, setDownloading] = React.useState(false);
        return (
          <div className="flex items-center justify-end gap-2">
            <button
              title={isDelivered ? "Download receipt" : "Mark as Delivered to download receipt"}
              disabled={!isDelivered || downloading}
              onClick={async (e) => {
                e.preventDefault();
                setDownloading(true);
                await onDownloadReceipt(order);
                setDownloading(false);
              }}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                isDelivered
                  ? "bg-green-50 text-green-700 hover:bg-green-100"
                  : "bg-[#f2f3ff] text-[#c3c6d7] cursor-not-allowed"
              } disabled:opacity-50`}
            >
              {downloading
                ? <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                : <FileDown className="h-3.5 w-3.5" />}
            </button>
            <Link
              to={`/orders/edit/${order.id}`}
              className="text-xs font-semibold text-[#2563eb] hover:underline"
            >
              Open
            </Link>
          </div>
        );
      },
    }),
  ], [orders]);

  const table = useReactTable({
    data: orders,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnPinning: isMobile ? {} : { left: ["select", "date", "customerName"] },
    },
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="mt-5 mb-8 rounded-2xl border border-[#eaedff] shadow-[0_4px_16px_rgba(0,74,198,0.05)] overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#eaedff] bg-[#faf8ff]">
        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 ? (
            <>
              <span className="text-xs font-semibold text-[#004ac6]">{selectedIds.length} selected</span>
              <span className="text-xs text-[#737686] tabular-nums">
                ₹{selectedRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
              {selectedProfit !== 0 && (
                <span className={`text-xs font-semibold tabular-nums ${selectedProfit > 0 ? "text-green-700" : "text-red-600"}`}>
                  {selectedProfit > 0 ? "+" : ""}₹{selectedProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })} profit
                </span>
              )}
              <button
                onClick={() => handleBulkAction("delivered")}
                disabled={bulkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
              >
                Mark Delivered
              </button>
              <button
                onClick={() => handleBulkAction("paid")}
                disabled={bulkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
              >
                Mark Paid
              </button>
              <button
                onClick={() => setRowSelection({})}
                className="text-xs text-[#737686] hover:text-[#131b2e] transition-colors"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-xs text-[#737686]">Select rows for bulk actions</span>
          )}
        </div>
        {/* Column visibility */}
        <div className="relative">
          <button
            onClick={() => setShowColMenu((v) => !v)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-[#c3c6d7] text-[#434655] hover:border-[#004ac6] transition-colors flex items-center gap-1.5"
          >
            <span>Columns</span>
            <span className="opacity-50">▾</span>
          </button>
          {showColMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#eaedff] rounded-xl shadow-lg z-20 p-2 min-w-[160px]">
              {TOGGLEABLE_COLUMNS.map((colId) => (
                <label key={colId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f2f3ff] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={table.getColumn(colId)?.getIsVisible() ?? true}
                    onChange={table.getColumn(colId)?.getToggleVisibilityHandler()}
                    className="rounded accent-[#004ac6]"
                  />
                  <span className="text-xs font-medium text-[#434655]">{COLUMN_LABELS[colId]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 600 }}>
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-[#f2f3ff] text-[11px] uppercase tracking-wider font-bold text-[#737686] border-b border-[#c3c6d7]">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), ...getPinStyles(header.column) }}
                    className={`px-4 py-3 text-left whitespace-nowrap select-none bg-[#f2f3ff] relative ${header.column.id === "customerName" ? "after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-[#c3c6d7]" : ""} ${header.column.getCanSort() ? "cursor-pointer hover:text-[#004ac6]" : ""}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && <SortIcon direction={header.column.getIsSorted()} />}
                    {/* Resize handle */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-[#004ac6] ${header.column.getIsResizing() ? "bg-[#004ac6]" : ""}`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[#eaedff]">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`group transition-colors ${row.getIsSelected() ? "bg-[#eaedff]/60" : "hover:bg-[#f2f3ff]/50"}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={getPinStyles(cell.column)}
                    className={`px-4 py-3 max-w-[200px] truncate relative ${cell.column.getIsPinned() ? row.getIsSelected() ? "bg-[#eaedff]/60" : "bg-white group-hover:bg-[#f2f3ff]/50" : ""} ${cell.column.id === "customerName" ? "after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-[#eaedff]" : ""}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-[#eaedff] text-xs text-[#737686] bg-[#f2f3ff]/50">
        Showing <strong className="text-[#131b2e]">{orders.length}</strong> orders
        {selectedIds.length > 0 && <span className="ml-2 text-[#004ac6] font-semibold">· {selectedIds.length} selected</span>}
      </div>
    </div>
  );
}

export function Orders() {
  const isOnline = useOnlineStatus();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState<OfflineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const loaderRef = React.useRef<HTMLDivElement>(null);

  const loadPending = () =>
    offlineOrdersDB.getAll().then(setPendingOrders).catch(console.error);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth >= 1024 ? "table" : "list"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<{ productId: string; available: number; requested: number } | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [expandedPayment, setExpandedPayment] = useState<Set<string>>(new Set());

  const togglePaymentExpand = (orderId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedPayment((prev) => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const toggleExpand = (orderId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const [reactivateConfirm, setReactivateConfirm] = useState<{ orderId: string; newStatus: Order["status"] } | null>(null);

  // forceRegenerate=true: always regenerate fresh (auto-triggered on status → Delivered)
  //   - reuses existing receipt number so the same number is kept, overwrites file in storage
  // forceRegenerate=false: serve existing file from storage (manual download button)
  const generateAndSaveReceipt = async (order: Order, forceRegenerate = false) => {
    try {
      // Storage upload disabled to reduce Supabase disk I/O.
      // Receipts are generated client-side on demand and never written to storage.
      const { generateReceiptPDF } = await import("../../lib/receiptGenerator");
      const receiptNum = order.receiptNumber ?? await getNextReceiptNumber(order.date);
      const pdfBlob = generateReceiptPDF(order, products, receiptNum);

      // Save receipt number to the order if not already assigned (orders table only, no storage)
      if (!order.receiptNumber) {
        await saveReceiptNumber(order.id, receiptNum);
      }

      // Only open if user explicitly requested (forceRegenerate=true = auto-trigger, no open)
      if (!forceRegenerate) {
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success("Receipt opened");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate receipt");
    }
  };

  const handleStatusChange = async (orderId: string, currentStatus: Order["status"], newStatus: Order["status"]) => {
    if (currentStatus === newStatus) return;
    if (currentStatus === "Cancelled" && (newStatus === "Packed" || newStatus === "Delivered")) return;
    if (currentStatus === "Cancelled") {
      setReactivateConfirm({ orderId, newStatus });
      return;
    }
    setSavingOrderId(orderId);
    setOrders((prev) => {
      const next = prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o);
      setCachedOrders(next);
      return next;
    });
    try {
      await updateOrder(orderId, { status: newStatus });
      if (newStatus === "Delivered") {
        const order = orders.find((o) => o.id === orderId);
        if (order) generateAndSaveReceipt({ ...order, status: "Delivered" }, true);
      }
    } catch (err) {
      console.error(err);
      setOrders((prev) => {
        const rolled = prev.map((o) => o.id === orderId ? { ...o, status: currentStatus } : o);
        setCachedOrders(rolled);
        return rolled;
      });
      if (err instanceof InsufficientStockError) {
        setStockWarning({ productId: err.productName, available: err.available, requested: err.requested });
      } else {
        toast.error("Failed to update status");
      }
    } finally {
      setSavingOrderId(null);
    }
  };

  const confirmReactivate = async () => {
    if (!reactivateConfirm) return;
    const { orderId, newStatus } = reactivateConfirm;
    setReactivateConfirm(null);
    setSavingOrderId(orderId);
    setOrders((prev) => {
      const next = prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o);
      setCachedOrders(next);
      return next;
    });
    try {
      await updateOrder(orderId, { status: newStatus });
      if (newStatus === "Delivered") {
        const order = orders.find((o) => o.id === orderId);
        if (order) generateAndSaveReceipt({ ...order, status: "Delivered" }, true);
      }
    } catch (err) {
      console.error(err);
      setOrders((prev) => {
        const rolled = prev.map((o) => o.id === orderId ? { ...o, status: "Cancelled" as const } : o);
        setCachedOrders(rolled);
        return rolled;
      });
      if (err instanceof InsufficientStockError) {
        setStockWarning({ productId: err.productName, available: err.available, requested: err.requested });
      } else {
        toast.error("Failed to update status");
      }
    } finally {
      setSavingOrderId(null);
    }
  };

  const handlePaymentStatusChange = async (orderId: string, currentPayment: Order["paymentStatus"], newPayment: Order["paymentStatus"]) => {
    if (currentPayment === newPayment) return;
    setSavingOrderId(orderId);
    const clearedMethod = newPayment === "Unpaid" ? null : undefined;
    setOrders((prev) => {
      const next = prev.map((o) => o.id === orderId ? { ...o, paymentStatus: newPayment, ...(newPayment === "Unpaid" ? { paymentMethod: undefined } : {}) } : o);
      setCachedOrders(next);
      return next;
    });
    try {
      await updateOrder(orderId, { paymentStatus: newPayment, ...(clearedMethod !== undefined ? { paymentMethod: clearedMethod } : {}) });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment status");
      setOrders((prev) => {
        const rolled = prev.map((o) => o.id === orderId ? { ...o, paymentStatus: currentPayment } : o);
        setCachedOrders(rolled);
        return rolled;
      });
    } finally {
      setSavingOrderId(null);
    }
  };

  const handlePaymentMethodChange = async (orderId: string, newMethod: Order["paymentMethod"]) => {
    setSavingOrderId(orderId);
    setOrders((prev) => {
      const next = prev.map((o) => o.id === orderId ? { ...o, paymentMethod: newMethod } : o);
      setCachedOrders(next);
      return next;
    });
    try {
      await updateOrder(orderId, { paymentMethod: newMethod });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment method");
      setOrders((prev) => {
        const rolled = prev.map((o) => o.id === orderId ? { ...o, paymentMethod: undefined } : o);
        setCachedOrders(rolled);
        return rolled;
      });
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleBulkAction = async (ids: string[], action: "delivered" | "paid") => {
    const results = await Promise.allSettled(
      ids.map((id) =>
        action === "delivered"
          ? updateOrder(id, { status: "Delivered" })
          : updateOrder(id, { paymentStatus: "Paid" })
      )
    );
    const succeeded = ids.filter((_, i) => results[i].status === "fulfilled");
    const failed = ids.length - succeeded.length;
    if (succeeded.length) toast.success(`${succeeded.length} order${succeeded.length > 1 ? "s" : ""} updated`);
    if (failed) toast.error(`${failed} order${failed > 1 ? "s" : ""} failed to update`);

    // Generate receipts for all successfully delivered orders (fire and forget — don't block UI)
    if (action === "delivered" && succeeded.length > 0) {
      const deliveredOrders = orders.filter((o) => succeeded.includes(o.id));
      for (const order of deliveredOrders) {
        generateAndSaveReceipt({ ...order, status: "Delivered" }, true).catch(console.error);
      }
    }

    // If a filter is active, reload from server so updated orders drop out of the filtered list
    if (statusFilter !== "All" || paymentFilter !== "All") {
      setPage(0);
      loadOrders(0, true);
    } else {
      setOrders((prev) => {
        const next = prev.map((o) => {
          if (!succeeded.includes(o.id)) return o;
          return action === "delivered" ? { ...o, status: "Delivered" as const } : { ...o, paymentStatus: "Paid" as const };
        });
        setCachedOrders(next);
        return next;
      });
    }
  };

  // Load tags for filter dropdown
  useEffect(() => {
    if (!isOnline) return;
    getTags().then(setAllTags).catch(console.error);
  }, [isOnline]);

  // Load pending IDB orders on mount and after each sync
  useEffect(() => {
    loadPending();
    window.addEventListener(SYNC_COMPLETE_EVENT, loadPending);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, loadPending);
  }, []);

  const loadOrders = async (pageNum: number, replace: boolean) => {
    if (!isOnline) {
      if (replace) {
        const co = getCachedOrders() as Order[] | null;
        setOrders(co ?? []);
        setHasMore(false);
        setLoading(false);
      }
      return;
    }
    try {
      const { orders: newOrders, hasMore: more } = await getOrdersPaginated(pageNum, statusFilter, sortOrder);
      setOrders((prev) => replace ? newOrders : [...prev, ...newOrders]);
      setHasMore(more);
    } catch (e) {
      console.error(e);
      if (replace) {
        const co = getCachedOrders() as Order[] | null;
        setOrders(co ?? []);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial load + reload when filter/sort/online changes
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setPage(0);
      setHasMore(true);
      // Load products once
      if (isOnline) {
        try {
          const productsData = await getProducts();
          setProducts(productsData);
          setCachedProducts(productsData);
        } catch {
          const cp = getCachedProducts() as Product[] | null;
          setProducts(cp ?? []);
        }
      } else {
        const cp = getCachedProducts() as Product[] | null;
        setProducts(cp ?? []);
      }
      await loadOrders(0, true);
    };
    init();
  }, [isOnline, statusFilter, sortOrder]);

  // Infinite scroll — observe loader div
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setLoadingMore(true);
          const nextPage = page + 1;
          setPage(nextPage);
          loadOrders(nextPage, false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, statusFilter, sortOrder]);

  const getProductName = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product?.name || "Unknown Product";
  };

  const getItemLitres = (productId: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    return quantity * (product?.unitSize ?? 1);
  };

  const calculateOrderTotal = (order: Order) => {
    if (order.items && order.items.length > 0) {
      return order.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
    }
    return 0;
  };

  const calculateOrderProfit = (order: Order) => {
    if (order.items && order.items.length > 0) {
      return order.items.reduce(
        (sum, item) => sum + item.quantity * ((item.unitPrice ?? 0) - (item.costPrice ?? 0)),
        0
      );
    }
    return 0;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pending":
        return "bg-orange-100 text-orange-700";
      case "Packed":
        return "bg-blue-100 text-blue-700";
      case "Delivered":
        return "bg-green-100 text-green-700";
      case "Cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case "Pending":
        return "#943700";
      case "Packed":
        return "#2563eb";
      case "Delivered":
        return "#22c55e";
      case "Cancelled":
        return "#ba1a1a";
      default:
        return "#c3c6d7";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-700";
      case "Unpaid":
        return "bg-red-100 text-red-700";
      case "Partial":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getPaymentMethodColor = (method: string | undefined) => {
    switch (method) {
      case "Cash":
        return "bg-purple-100 text-purple-700";
      case "UPI":
        return "bg-teal-100 text-teal-700";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const orderFuse = useMemo(() => new Fuse(orders, { keys: ["customerName"], threshold: 0.3 }), [orders]);
  const searchedOrders = searchQuery ? orderFuse.search(searchQuery).map((r) => r.item) : orders;

  const filteredOrders = searchedOrders
    .filter((o) => paymentFilter === "All" || o.paymentStatus === paymentFilter)
    .filter((o) => tagFilter.length === 0 || tagFilter.every((id) => (o.tags ?? []).some((t) => t.id === id)))
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === "recent" ? createdB - createdA : createdA - createdB;
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] animate-pulse">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
          <div className="h-6 w-16 bg-[#e2e7ff] rounded-full" />
          {/* Desktop search */}
          <div className="hidden lg:block h-9 w-64 bg-[#e2e7ff] rounded-xl flex-1 mx-6" />
          {/* Mobile + button */}
          <div className="h-9 w-9 bg-[#e2e7ff] rounded-xl lg:hidden" />
          <div className="h-9 w-9 lg:w-28 bg-[#e2e7ff] rounded-xl ml-auto" />
        </div>
        <div className="px-5 lg:px-8 pt-4 pb-24 space-y-4">
          {/* Mobile search bar */}
          <div className="h-10 w-full bg-[#e2e7ff] rounded-xl lg:hidden" />
          {/* Toolbar: dropdowns + sort + view toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-7 w-24 bg-[#e2e7ff] rounded-full" />
            <div className="h-7 w-24 bg-[#e2e7ff] rounded-full" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-16 bg-[#e2e7ff] rounded-full" />
              <div className="h-8 w-20 bg-[#e2e7ff] rounded-xl" />
            </div>
          </div>
          {/* Order cards */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                    <div className="h-4 w-32 bg-[#e2e7ff] rounded-full" />
                  </div>
                  <div className="h-4 w-16 bg-[#e2e7ff] rounded-full" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rounded-full bg-[#e2e7ff]" />
                  <div className="h-3.5 w-40 bg-[#e2e7ff] rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="h-5 w-16 bg-[#e2e7ff] rounded-full" />
                    <div className="h-5 w-14 bg-[#e2e7ff] rounded-full" />
                  </div>
                  <div className="h-3.5 w-20 bg-[#e2e7ff] rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff]">
      {/* Sticky Header */}
      <div className="sticky top-0 left-0 right-0 z-50 bg-[#faf8ff] flex items-center gap-3 px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <h1 className="text-xl font-bold text-[#131b2e] flex-shrink-0">Orders</h1>
        <div className="hidden lg:flex relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-[#c3c6d7] text-[#131b2e] placeholder-[#737686] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Link
            to="/orders/new"
            className="flex items-center gap-1.5 bg-[#004ac6] hover:bg-[#003ea8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">New Order</span>
          </Link>
        </div>
      </div>

      <div className="px-5 lg:px-8 pt-4 pb-24 space-y-4 max-w-2xl mx-auto lg:max-w-none w-full min-w-0">
        {/* Pending sync banner */}
        {pendingOrders.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="flex items-center gap-2 text-orange-700 mb-2">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold">
                {pendingOrders.length} order{pendingOrders.length > 1 ? "s" : ""} pending sync
              </span>
            </div>
            <div className="space-y-2">
              {pendingOrders.map((order) => {
                const firstItem = order.items[0];
                const product = products.find((p) => p.id === firstItem?.productId);
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-lg px-3 py-2 border border-orange-100 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium text-[#131b2e] truncate">{order.customerName}</span>
                    <span className="text-xs text-orange-600 whitespace-nowrap">
                      {order.items.length === 1
                        ? `${product?.name ?? "Unknown"} — ${firstItem ? getItemLitres(firstItem.productId, firstItem.quantity) : 0}L`
                        : `${order.items.length} items`}
                      {" · "}{order.date}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search bar — mobile only (desktop search is in the header) */}
        <div className="relative lg:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737686]" />
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#e2e7ff] text-[#131b2e] placeholder-[#737686] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] border border-transparent"
          />
        </div>

        {/* Filters + sort + view toggle + add new */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-full border outline-none cursor-pointer transition-colors ${
              statusFilter !== "All"
                ? "bg-[#004ac6] text-white border-[#004ac6]"
                : "bg-white text-[#434655] border-[#c3c6d7]"
            }`}
          >
            <option value="All">Status</option>
            <option value="Pending">Pending</option>
            <option value="Packed">Packed</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          {/* Payment dropdown */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-full border outline-none cursor-pointer transition-colors ${
              paymentFilter === "Partial"
                ? "bg-orange-500 text-white border-orange-500"
                : paymentFilter === "Unpaid"
                ? "bg-red-500 text-white border-red-500"
                : paymentFilter === "Paid"
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-[#434655] border-[#c3c6d7]"
            }`}
          >
            <option value="All">Payment</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </select>
          {/* Tag multi-select filter */}
          {allTags.length > 0 && (
            <div className="relative">
              <button
                onClick={() => { setTagDropdownOpen((v) => !v); setTagSearch(""); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border outline-none cursor-pointer transition-colors flex items-center gap-1.5 ${
                  tagFilter.length > 0
                    ? "bg-[#004ac6] text-white border-[#004ac6]"
                    : "bg-white text-[#434655] border-[#c3c6d7]"
                }`}
              >
                {tagFilter.length === 0
                  ? "Tag"
                  : tagFilter.length === 1
                  ? (allTags.find((t) => t.id === tagFilter[0])?.name ?? "Tag")
                  : `${tagFilter.length} tags`}
                <span className="opacity-70">▾</span>
              </button>
              {tagDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTagDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white border border-[#eaedff] rounded-xl shadow-lg z-20 w-52 overflow-hidden">
                    {/* Search */}
                    <div className="px-3 py-2 border-b border-[#eaedff]">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search tags..."
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="w-full text-xs rounded-lg border border-[#c3c6d7] px-2.5 py-1.5 outline-none focus:border-[#2563eb] text-[#131b2e] placeholder-[#737686]"
                      />
                    </div>
                    {/* Tag options */}
                    <div className="max-h-48 overflow-y-auto py-1">
                      {allTags
                        .filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        .map((t) => {
                          const checked = tagFilter.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#f2f3ff] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setTagFilter((prev) =>
                                    checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                                  )
                                }
                                className="rounded accent-[#004ac6] flex-shrink-0"
                              />
                              <span
                                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: t.color }}
                              />
                              <span className="text-xs font-medium text-[#434655] truncate">{t.name}</span>
                            </label>
                          );
                        })}
                      {allTags.filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-[#737686] text-center py-3">No tags found</p>
                      )}
                    </div>
                    {/* Clear selection */}
                    {tagFilter.length > 0 && (
                      <div className="border-t border-[#eaedff] px-3 py-2">
                        <button
                          onClick={() => { setTagFilter([]); setTagDropdownOpen(false); }}
                          className="text-xs font-semibold text-[#737686] hover:text-[#131b2e] transition-colors"
                        >
                          Clear filter
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {/* Sort (list view only) + view toggle */}
          <div className="flex items-center gap-1.5">
            {viewMode === "list" && (
              <button
                onClick={() => setSortOrder(sortOrder === "recent" ? "oldest" : "recent")}
                className="flex items-center gap-1 text-xs font-medium text-[#434655] bg-white border border-[#c3c6d7] rounded-full px-2.5 py-1.5 hover:border-[#004ac6] transition-colors whitespace-nowrap"
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortOrder === "recent" ? "Recent" : "Oldest"}
              </button>
            )}
            <div className="flex items-center bg-white border border-[#c3c6d7] rounded-xl p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "list" ? "bg-[#eaedff] text-[#004ac6]" : "text-[#737686] hover:text-[#434655]"}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "table" ? "bg-[#eaedff] text-[#004ac6]" : "text-[#737686] hover:text-[#434655]"}`}
              >
                <Table2 className="h-3.5 w-3.5" /> Table
              </button>
            </div>
          </div>
        </div>

        {/* Orders */}
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-[#eaedff] rounded-full p-4 mb-3">
              <PackageIcon className="h-8 w-8 text-[#004ac6]" />
            </div>
            <p className="text-[#131b2e] font-semibold mb-1">No orders found</p>
            <p className="text-[#737686] text-sm">Try adjusting your filters or search query</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-4">
            {filteredOrders.map((order) => {
              const total = calculateOrderTotal(order);
              const formattedTotal = total.toLocaleString("en-IN", { maximumFractionDigits: 0 });
              const profit = calculateOrderProfit(order);
              const isSaving = savingOrderId === order.id;
              return (
                <Link
                  key={order.id}
                  to={`/orders/edit/${order.id}`}
                  className={`block bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden active:scale-[0.99] transition-all ${isSaving ? "opacity-60" : ""}`}
                  style={{ borderLeft: `4px solid ${getStatusBorderColor(order.status)}` }}
                >
                  <div className="p-4">
                    {/* Customer name + total */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-[#737686] flex-shrink-0" />
                        <span className="font-bold text-[#131b2e] truncate">{order.customerName}</span>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 ml-2">
                        <div className="flex items-center gap-0.5">
                          <IndianRupee className="h-3.5 w-3.5 text-[#004ac6]" />
                          <span className="font-bold text-[#004ac6] text-sm">{formattedTotal}</span>
                        </div>
                        {profit !== 0 && (
                          <span className={`text-[10px] font-semibold tabular-nums ${profit > 0 ? "text-green-700" : "text-red-600"}`}>
                            {profit > 0 ? "+" : ""}₹{profit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product + quantity */}
                    <div className="mb-3">
                      {order.items && order.items.length > 1 ? (
                        <>
                          <button
                            onClick={(e) => toggleExpand(order.id, e)}
                            className="flex items-center gap-2 text-sm text-[#434655] w-full text-left"
                          >
                            <PackageIcon className="h-4 w-4 text-[#737686] flex-shrink-0" />
                            <span>{order.items.length} items</span>
                            <ChevronDown className={`h-3.5 w-3.5 text-[#737686] transition-transform ${expandedOrders.has(order.id) ? "rotate-180" : ""}`} />
                          </button>
                          {expandedOrders.has(order.id) && (
                            <div className="mt-2 ml-6 space-y-1">
                              {order.items.map((item, i) => (
                                <div key={i} className="text-xs text-[#434655]">
                                  {getProductName(item.productId)} · {getItemLitres(item.productId, item.quantity)}L
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <PackageIcon className="h-4 w-4 text-[#737686] flex-shrink-0" />
                          <span className="text-sm text-[#434655]">
                            {getProductName(order.productId)} · {getItemLitres(order.productId, order.quantity)}L
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inline status selects + date */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1.5" onClick={(e) => e.preventDefault()}>
                        <select
                          value={order.status}
                          disabled={isSaving}
                          onChange={(e) => handleStatusChange(order.id, order.status, e.target.value as Order["status"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getStatusColor(order.status)}`}
                        >
                          <option value="Pending">Pending</option>
                          {order.status !== "Cancelled" && <option value="Packed">Packed</option>}
                          {order.status !== "Cancelled" && <option value="Delivered">Delivered</option>}
                          <option value="Cancelled">Cancelled</option>
                        </select>
                        <select
                          value={order.paymentStatus}
                          disabled={isSaving}
                          onChange={(e) => handlePaymentStatusChange(order.id, order.paymentStatus, e.target.value as Order["paymentStatus"])}
                          onClick={(e) => e.preventDefault()}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentStatusColor(order.paymentStatus)}`}
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Partial">Partial</option>
                          <option value="Paid">Paid</option>
                        </select>
                        {(order.paymentStatus === "Paid" || order.paymentStatus === "Partial") && (
                          <select
                            value={order.paymentMethod ?? ""}
                            disabled={isSaving}
                            onChange={(e) => handlePaymentMethodChange(order.id, e.target.value as Order["paymentMethod"])}
                            onClick={(e) => e.preventDefault()}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${getPaymentMethodColor(order.paymentMethod)}`}
                          >
                            <option value="">Method?</option>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                          </select>
                        )}
                        {order.paymentStatus === "Partial" && (
                          <button
                            type="button"
                            onClick={(e) => togglePaymentExpand(order.id, e)}
                            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 flex items-center gap-0.5"
                          >
                            Details
                            <span className={`transition-transform inline-block ${expandedPayment.has(order.id) ? "rotate-180" : ""}`}>▾</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[#737686]">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-xs">{formatDate(order.date)}</span>
                      </div>
                    </div>

                    {order.paymentStatus === "Partial" && expandedPayment.has(order.id) && (
                      <div className="mt-2 pt-2 border-t border-[#f2f3ff] space-y-1" onClick={(e) => e.preventDefault()}>
                        <div className="flex justify-between text-xs text-[#434655]">
                          <span>Amount Paid</span>
                          <span className="font-semibold text-green-700">
                            ₹{(order.amountPaid ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-[#434655]">
                          <span>Outstanding</span>
                          <span className="font-semibold text-red-600">
                            ₹{Math.max(0, calculateOrderTotal(order) - (order.amountPaid ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    )}

                    {order.notes && (
                      <p className="text-xs text-[#737686] italic mt-2 pt-2 border-t border-[#f2f3ff]">
                        {order.notes}
                      </p>
                    )}

                    {order.tags && order.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#f2f3ff]">
                        {order.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <OrdersTable
            orders={filteredOrders}
            products={products}
            getProductName={getProductName}
            calculateOrderTotal={calculateOrderTotal}
            calculateOrderProfit={calculateOrderProfit}
            formatDate={formatDate}
            onBulkAction={handleBulkAction}
            onDownloadReceipt={generateAndSaveReceipt}
          />
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="py-2 text-center">
          {loadingMore && (
            <div className="w-6 h-6 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mx-auto" />
          )}
          {!hasMore && filteredOrders.length > 0 && (
            <p className="text-xs text-[#737686]">All orders loaded</p>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!reactivateConfirm}
        title="Reactivate Order"
        message="This cancelled order will be moved back to Pending."
        confirmLabel="Reactivate"
        variant="primary"
        onConfirm={confirmReactivate}
        onCancel={() => setReactivateConfirm(null)}
      />

      <ConfirmModal
        isOpen={!!stockWarning}
        title="Insufficient Stock"
        message={stockWarning ? `Only ${stockWarning.available} bottles available in the selected batch, but ${stockWarning.requested} were ordered. Status was not updated.` : ""}
        confirmLabel="OK"
        cancelLabel=""
        variant="primary"
        onConfirm={() => setStockWarning(null)}
        onCancel={() => setStockWarning(null)}
      />
    </div>
  );
}
