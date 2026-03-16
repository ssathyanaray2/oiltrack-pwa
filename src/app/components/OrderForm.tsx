import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Save, Trash2, Printer, Download, WifiOff, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { useOfflineStorage, useOnlineStatus } from "../hooks/useOfflineStorage";
import {
  getOrder,
  getOrders,
  getProducts,
  getCustomers,
  createOrder,
  updateOrder,
  deleteOrder,
  updateProduct,
} from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedOrders, getCachedProducts, getCachedCustomers, setCachedOrders, setCachedProducts, setCachedCustomers } from "../../lib/cache";
import type { Order, Product, Customer } from "../../lib/types";
import { orders as mockOrders, products as mockProducts, customers as mockCustomers } from "../data/mockData";

export function OrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const isOnline = useOnlineStatus();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    customerId: "",
    customerName: "",
    productId: "",
    quantity: "",
    date: new Date().toISOString().split("T")[0],
    status: "Pending" as Order["status"],
    paymentStatus: "Unpaid" as Order["paymentStatus"],
    notes: "",
  });

  const [offlineOrders, setOfflineOrders] = useOfflineStorage<Array<typeof formData & { id?: string; createdAt?: string; offline?: boolean }>>("offline-orders", []);

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [customersData, productsData] = await Promise.all([getCustomers(), getProducts()]);
          setCustomers(customersData);
          setProducts(productsData);
          setCachedCustomers(customersData);
          setCachedProducts(productsData);
          if (isEditing && id) {
            const order = await getOrder(id);
            setExistingOrder(order ?? null);
            if (order) {
              setFormData({
                customerId: order.customerId,
                customerName: order.customerName,
                productId: order.productId,
                quantity: order.quantity.toString(),
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                notes: order.notes ?? "",
              });
            }
          }
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          const cp = getCachedProducts() as Product[] | null;
          const co = getCachedOrders() as Order[] | null;
          setCustomers(cc?.length ? cc : mockCustomers);
          setProducts(cp?.length ? cp : mockProducts);
          if (isEditing && id) {
            const order = (co ?? mockOrders).find((o) => o.id === id) ?? null;
            setExistingOrder(order);
            if (order)
              setFormData({
                customerId: order.customerId,
                customerName: order.customerName,
                productId: order.productId,
                quantity: order.quantity.toString(),
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                notes: order.notes ?? "",
              });
            }
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        const cp = getCachedProducts() as Product[] | null;
        const co = getCachedOrders() as Order[] | null;
        setCustomers(cc?.length ? cc : mockCustomers);
        setProducts(cp?.length ? cp : mockProducts);
        if (isEditing && id) {
          const order = (co ?? mockOrders).find((o) => o.id === id) ?? null;
          setExistingOrder(order);
          if (order)
            setFormData({
              customerId: order.customerId,
              customerName: order.customerName,
              productId: order.productId,
              quantity: order.quantity.toString(),
              date: order.date,
              status: order.status,
              paymentStatus: order.paymentStatus,
              notes: order.notes ?? "",
            });
        }
        setLoading(false);
      }
    };
    load();
  }, [isOnline, isEditing, id]);

  useEffect(() => {
    if (!isOnline) {
      toast.info("You're offline. Orders will be saved locally.", { duration: 5000 });
    } else if (offlineOrders.length > 0) {
      toast.success("You're back online! Offline orders are ready to sync.", { duration: 5000 });
    }
  }, [isOnline]);

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setFormData({
      ...formData,
      customerId,
      customerName: customer?.name ?? "",
    });
  };

  const handlePrint = () => {
    const product = products.find((p) => p.id === formData.productId);
    const customer = customers.find((c) => c.id === formData.customerId);
    if (!product || !customer) {
      toast.error("Missing product or customer information");
      return;
    }
    const total = product.pricePerLiter * parseInt(formData.quantity || "0");
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order Receipt - ${formData.customerName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1 { color: #C87D3A; }
            .header { border-bottom: 3px solid #C87D3A; padding-bottom: 20px; margin-bottom: 30px; }
            .info-row { margin: 15px 0; font-size: 16px; }
            .label { font-weight: bold; color: #3D2817; }
            .total { font-size: 24px; font-weight: bold; color: #C87D3A; margin-top: 30px; padding-top: 20px; border-top: 2px solid #D4A574; }
            .footer { margin-top: 40px; font-size: 14px; color: #6B5444; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Order Receipt</h1>
            <p style="font-size: 14px; color: #6B5444;">Order ID: ${id || "NEW"}</p>
          </div>
          <div class="info-row"><span class="label">Customer:</span> ${customer.name}</div>
          <div class="info-row"><span class="label">Delivery Address:</span> ${customer.address}</div>
          <div class="info-row"><span class="label">Phone:</span> ${customer.phone}</div>
          ${customer.email ? `<div class="info-row"><span class="label">Email:</span> ${customer.email}</div>` : ""}
          <div style="margin-top: 30px;">
            <div class="info-row"><span class="label">Product:</span> ${product.name}</div>
            <div class="info-row"><span class="label">Quantity:</span> ${formData.quantity} Liters</div>
            <div class="info-row"><span class="label">Price per Liter:</span> $${product.pricePerLiter.toFixed(2)}</div>
            <div class="info-row"><span class="label">Date:</span> ${new Date(formData.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            <div class="info-row"><span class="label">Status:</span> ${formData.status}</div>
            <div class="info-row"><span class="label">Payment Status:</span> ${formData.paymentStatus}</div>
          </div>
          ${formData.notes ? `<div class="info-row"><span class="label">Notes:</span> ${formData.notes}</div>` : ""}
          <div class="total">TOTAL: $${total.toFixed(2)}</div>
          <div class="footer">
            Thank you for your business!<br>
            Printed on ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      toast.success("Opening print dialog...");
    } else {
      toast.error("Please enable pop-ups to print");
    }
  };

  const handleExport = () => {
    const product = products.find((p) => p.id === formData.productId);
    const customer = customers.find((c) => c.id === formData.customerId);
    if (!product || !customer) {
      toast.error("Missing product or customer information");
      return;
    }
    const total = product.pricePerLiter * parseInt(formData.quantity || "0");
    const csvContent = `Order Receipt
Order ID,${id || "NEW"}

Customer Information
Name,${customer.name}
Address,${customer.address}
Phone,${customer.phone}
Email,${customer.email || "N/A"}

Order Details
Product,${product.name}
Quantity,${formData.quantity} Liters
Price per Liter,$${product.pricePerLiter.toFixed(2)}
Date,${formData.date}
Status,${formData.status}
Payment Status,${formData.paymentStatus}
Notes,${formData.notes || "N/A"}

Total,$${total.toFixed(2)}
`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `order-${id || "new"}-${formData.customerName}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Order exported successfully!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.productId || !formData.quantity) {
      toast.error("Please fill in all required fields");
      return;
    }

    const qty = parseInt(formData.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (!isOnline && !isEditing) {
      setOfflineOrders([
        ...offlineOrders,
        {
          ...formData,
          id: `offline-${Date.now()}`,
          createdAt: new Date().toISOString(),
          offline: true,
        },
      ]);
      toast.success("Order saved locally. It will sync when you're back online.", { duration: 5000 });
      navigate("/orders");
      return;
    }

    if (!isSupabaseConfigured()) {
      toast.success(isEditing ? "Order updated." : "Order created.");
      navigate("/orders");
      return;
    }

    try {
      // Need to check if the product is available in stock
      const product = products.find((p) => p.id === formData.productId);
      if (!product) {
        toast.error("Product not found");
        return;
      }
      if (product.stock < qty) {
        toast.error("Product not available in stock");
        return;
      }
      // Update the product stock
      // await updateProduct(formData.productId, {
      //   stock: product.stock - qty,
      // });

      if (isEditing && id) {
        await updateOrder(id, {
          customerId: formData.customerId,
          customerName: formData.customerName,
          productId: formData.productId,
          quantity: qty,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          notes: formData.notes || undefined,
        });
        toast.success("Order updated successfully!");
      } else {
        await createOrder({
          customerId: formData.customerId,
          customerName: formData.customerName,
          productId: formData.productId,
          quantity: qty,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          notes: formData.notes || undefined,
        });
        toast.success("Order created successfully!");
      }
      const fresh = await getOrders();
      setCachedOrders(fresh);
      navigate("/orders");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save order");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this order?")) return;
    if (!isOnline || !isSupabaseConfigured() || !id) {
      toast.success("Order deleted");
      navigate("/orders");
      return;
    }
    try {
      await deleteOrder(id);
      const fresh = await getOrders();
      setCachedOrders(fresh);
      toast.success("Order deleted");
      navigate("/orders");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete order");
    }
  };

  const handleSyncOfflineOrders = async () => {
    if (!isSupabaseConfigured() || offlineOrders.length === 0) {
      setOfflineOrders([]);
      return;
    }
    try {
      for (const o of offlineOrders) {
        const qty = parseInt(o.quantity, 10);
        if (isNaN(qty) || qty <= 0 || !o.customerId || !o.productId) continue;
        await createOrder({
          customerId: o.customerId,
          customerName: o.customerName,
          productId: o.productId,
          quantity: qty,
          date: o.date,
          status: o.status,
          paymentStatus: o.paymentStatus,
          notes: o.notes || undefined,
        });
      }
      const fresh = await getOrders();
      setCachedOrders(fresh);
      setOfflineOrders([]);
      toast.success("Offline orders synced successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Some orders failed to sync");
    }
  };

  if (loading && isEditing) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading order…</p>
      </div>
    );
  }

  if (isEditing && id && !existingOrder && !loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Order not found</p>
        <button onClick={() => navigate("/orders")} className="mt-4 text-primary">Back to Orders</button>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto">
      {!isOnline && (
        <div className="bg-accent/20 border-2 border-accent rounded-2xl p-4 mb-6 flex items-center gap-3">
          <WifiOff className="h-6 w-6 text-accent-foreground" />
          <div>
            <p className="font-medium text-accent-foreground">You're offline</p>
            <p className="text-sm text-foreground">Orders will be saved locally and synced when you're back online</p>
          </div>
        </div>
      )}

      {isOnline && offlineOrders.length > 0 && (
        <div className="bg-primary/10 border-2 border-primary rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Wifi className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <p className="font-medium text-primary">You're back online</p>
            <p className="text-sm text-foreground">
              {offlineOrders.length} offline {offlineOrders.length === 1 ? "order" : "orders"} ready to sync
            </p>
          </div>
          <button
            onClick={handleSyncOfflineOrders}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm"
          >
            Sync Now
          </button>
        </div>
      )}

      <div className="mb-8">
        <button
          onClick={() => navigate("/orders")}
          className="flex items-center gap-2 text-primary mb-4 hover:text-primary/80 transition-colors py-2"
        >
          <ArrowLeft className="h-6 w-6" />
          <span>Back to Orders</span>
        </button>
        <h1 className="text-3xl text-foreground mb-2">{isEditing ? "Edit Order" : "New Order"}</h1>
        <p className="text-muted-foreground">{isEditing ? "Update order details" : "Create a new order"}</p>
      </div>

      {isEditing && (
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 px-6 flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Printer className="h-5 w-5" />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl py-4 px-6 flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="customerId">Customer *</label>
            <Link to="/customers/new" className="text-primary text-sm hover:text-primary/80 transition-colors flex items-center gap-1">
              <Plus className="h-4 w-4" />
              <span>Add New</span>
            </Link>
          </div>
          <select
            id="customerId"
            value={formData.customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {formData.customerId && (
            <p className="mt-3 text-sm text-muted-foreground">
              Delivery: {customers.find((c) => c.id === formData.customerId)?.address}
            </p>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <label htmlFor="productId" className="block mb-3">Product *</label>
          <select
            id="productId"
            value={formData.productId}
            onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
            className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - ${product.pricePerLiter.toFixed(2)}/L
              </option>
            ))}
          </select>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <label htmlFor="quantity" className="block mb-3">Quantity (Liters) *</label>
          <input
            id="quantity"
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="Enter quantity"
            className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          {formData.productId && formData.quantity && (
            <p className="mt-3 text-muted-foreground">
              Total: ${(products.find((p) => p.id === formData.productId)?.pricePerLiter ?? 0) * parseInt(formData.quantity || "0", 10)}
            </p>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <label htmlFor="date" className="block mb-3">Date *</label>
          <input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {isEditing && (
          <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
            <label htmlFor="status" className="block mb-3">Order Status</label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as Order["status"] })}
              className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Pending">Pending</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        )}

        {isEditing && (
          <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
            <label htmlFor="paymentStatus" className="block mb-3">Payment Status</label>
            <select
              id="paymentStatus"
              value={formData.paymentStatus}
              onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value as Order["paymentStatus"] })}
              className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Unpaid">Unpaid</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        )}

        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <label htmlFor="notes" className="block mb-3">Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Add any special instructions or notes"
            rows={4}
            className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl py-5 px-6 flex items-center justify-center gap-3 shadow-md transition-all active:scale-[0.98]"
          >
            <Save className="h-6 w-6" />
            <span className="text-xl">{isEditing ? "Save Changes" : "Create Order"}</span>
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-2xl py-5 px-6 flex items-center justify-center gap-3 shadow-md transition-all active:scale-[0.98]"
            >
              <Trash2 className="h-6 w-6" />
              <span className="text-xl">Delete Order</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
