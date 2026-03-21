import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Save, Trash2, Printer, Download, WifiOff, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineOrdersDB } from "../../lib/db";
import {
  getOrder,
  getOrders,
  getProducts,
  getCustomers,
  createOrder,
  updateOrder,
  deleteOrder,
} from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedOrders, getCachedProducts, getCachedCustomers, setCachedOrders, setCachedProducts, setCachedCustomers } from "../../lib/cache";
import type { Order, Product, Customer } from "../../lib/types";
import { orders as mockOrders, products as mockProducts, customers as mockCustomers } from "../data/mockData";

interface OrderItemRow {
  productId: string;
  quantity: string;
}

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
    date: new Date().toISOString().split("T")[0],
    status: "Pending" as Order["status"],
    paymentStatus: "Unpaid" as Order["paymentStatus"],
    notes: "",
  });

  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([{ productId: "", quantity: "" }]);

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
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                notes: order.notes ?? "",
              });
              const items = order.items && order.items.length > 0
                ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString() }))
                : [{ productId: order.productId, quantity: order.quantity.toString() }];
              setOrderItems(items);
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
            if (order) {
              setFormData({
                customerId: order.customerId,
                customerName: order.customerName,
                date: order.date,
                status: order.status,
                paymentStatus: order.paymentStatus,
                notes: order.notes ?? "",
              });
              const items = order.items && order.items.length > 0
                ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString() }))
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
        setCustomers(cc?.length ? cc : mockCustomers);
        setProducts(cp?.length ? cp : mockProducts);
        if (isEditing && id) {
          const order = (co ?? mockOrders).find((o) => o.id === id) ?? null;
          setExistingOrder(order);
          if (order) {
            setFormData({
              customerId: order.customerId,
              customerName: order.customerName,
              date: order.date,
              status: order.status,
              paymentStatus: order.paymentStatus,
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
    } else if (offlineOrders.length > 0) {
      toast.success("You're back online! Offline orders are ready to sync.", { duration: 5000 });
    }
  }, [isOnline]);

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setFormData({ ...formData, customerId, customerName: customer?.name ?? "" });
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

  const getOrderTotal = () => {
    return orderItems.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      const qty = parseInt(item.quantity || "0", 10);
      return sum + (product?.pricePerLiter ?? 0) * qty;
    }, 0);
  };

  const handlePrint = () => {
    const customer = customers.find((c) => c.id === formData.customerId);
    if (!customer || orderItems.some((i) => !i.productId || !i.quantity)) {
      toast.error("Missing product or customer information");
      return;
    }
    const itemRows = orderItems.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const qty = parseInt(item.quantity || "0", 10);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #D4A574;">${product?.name ?? ""}</td>
          <td style="padding: 10px; border-bottom: 1px solid #D4A574; text-align: right;">${qty} L</td>
          <td style="padding: 10px; border-bottom: 1px solid #D4A574; text-align: right;">$${product?.pricePerLiter.toFixed(2) ?? "0.00"}/L</td>
          <td style="padding: 10px; border-bottom: 1px solid #D4A574; text-align: right;">$${((product?.pricePerLiter ?? 0) * qty).toFixed(2)}</td>
        </tr>`;
    }).join("");
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
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #3D2817; color: white; padding: 10px; text-align: left; }
            th:not(:first-child) { text-align: right; }
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
          <div class="info-row"><span class="label">Date:</span> ${new Date(formData.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
          <div class="info-row"><span class="label">Status:</span> ${formData.status}</div>
          <div class="info-row"><span class="label">Payment Status:</span> ${formData.paymentStatus}</div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price/L</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          ${formData.notes ? `<div class="info-row" style="margin-top:20px;"><span class="label">Notes:</span> ${formData.notes}</div>` : ""}
          <div class="total">TOTAL: $${getOrderTotal().toFixed(2)}</div>
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
    const customer = customers.find((c) => c.id === formData.customerId);
    if (!customer || orderItems.some((i) => !i.productId || !i.quantity)) {
      toast.error("Missing product or customer information");
      return;
    }
    const itemLines = orderItems.map((item, i) => {
      const product = products.find((p) => p.id === item.productId);
      const qty = parseInt(item.quantity || "0", 10);
      return `Item ${i + 1},${product?.name ?? ""},${qty} Liters,$${product?.pricePerLiter.toFixed(2) ?? "0.00"}/L,$${((product?.pricePerLiter ?? 0) * qty).toFixed(2)}`;
    }).join("\n");
    const csvContent = `Order Receipt
Order ID,${id || "NEW"}

Customer Information
Name,${customer.name}
Address,${customer.address}
Phone,${customer.phone}
Email,${customer.email || "N/A"}

Order Details
Date,${formData.date}
Status,${formData.status}
Payment Status,${formData.paymentStatus}
Notes,${formData.notes || "N/A"}

Items
,Product,Quantity,Price/L,Subtotal
${itemLines}

Total,$${getOrderTotal().toFixed(2)}
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
    if (!formData.customerName) {
      toast.error("Please select a customer");
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
    }

    const parsedItems = orderItems.map((item) => ({
      productId: item.productId,
      quantity: parseInt(item.quantity, 10),
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

    try {
      for (const item of parsedItems) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          toast.error(`Product not found for item`);
          return;
        }
        if (product.stock < item.quantity) {
          toast.error(`Insufficient stock for ${product.name} (available: ${product.stock} L)`);
          return;
        }
      }

      if (isEditing && id) {
        await updateOrder(id, {
          customerId: formData.customerId,
          customerName: formData.customerName,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          notes: formData.notes || undefined,
          items: parsedItems,
        });
        toast.success("Order updated successfully!");
      } else {
        await createOrder({
          customerId: formData.customerId,
          customerName: formData.customerName,
          productId: parsedItems[0].productId,
          quantity: parsedItems[0].quantity,
          date: formData.date,
          status: formData.status,
          paymentStatus: formData.paymentStatus,
          notes: formData.notes || undefined,
          items: parsedItems,
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
        {/* Customer */}
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

        {/* Order Items */}
        <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg text-foreground">Oil Items *</h2>
              <p className="text-sm text-muted-foreground">Select oil type and quantity for each item</p>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {orderItems.map((item, index) => {
              const selectedProduct = products.find((p) => p.id === item.productId);
              const qty = parseInt(item.quantity || "0", 10);
              const subtotal = (selectedProduct?.pricePerLiter ?? 0) * qty;

              return (
                <div
                  key={index}
                  className="border-2 border-border rounded-xl p-4 bg-background"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Item {index + 1}
                    </span>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="flex items-center gap-1 text-destructive hover:text-destructive/80 text-sm transition-colors"
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, "productId", e.target.value)}
                      className="w-full px-4 py-3 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    >
                      <option value="">Select oil type</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} — ${product.pricePerLiter.toFixed(2)}/L
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        placeholder="Quantity (L)"
                        className="flex-1 px-4 py-3 bg-input-background border-2 border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                      />
                      {item.productId && item.quantity && (
                        <div className="text-right min-w-[90px]">
                          <p className="text-xs text-muted-foreground">Subtotal</p>
                          <p className="font-semibold text-foreground">${subtotal.toFixed(2)}</p>
                        </div>
                      )}
                    </div>

                    {selectedProduct && (
                      <p className="text-xs text-muted-foreground">
                        Stock available: {selectedProduct.stock} L
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {orderItems.some((i) => i.productId && i.quantity) && (
            <div className="mt-4 pt-4 border-t-2 border-border flex items-center justify-between">
              <span className="font-semibold text-foreground">Order Total</span>
              <span className="text-xl font-bold text-primary">${getOrderTotal().toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Date */}
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
