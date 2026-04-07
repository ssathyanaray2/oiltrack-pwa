import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { getCustomer, getOrders, getProducts, getBatchesForProduct } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, getCachedOrders, getCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Customer, Order, Product, ProductBatch } from "../../lib/types";
import { customers as mockCustomers, orders as mockOrders, products as mockProducts } from "../data/mockData";
import { ArrowLeft, User, Phone, MapPin, Mail, Calendar, Package as PackageIcon, Pencil, ContactRound, IndianRupee } from "lucide-react";
import React from "react";
import { formatPhoneLink, formatMapsLink } from "../../lib/utils";

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batchesByProduct, setBatchesByProduct] = useState<Record<string, ProductBatch[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [customerData, ordersData, productsData] = await Promise.all([
            getCustomer(id),
            getOrders(),
            getProducts(),
          ]);
          setCustomer(customerData ?? null);
          setOrders(ordersData);
          setProducts(productsData);
          const batchResults = await Promise.all(
            productsData.map((p) => getBatchesForProduct(p.id).then((b) => ({ id: p.id, batches: b })))
          );
          setBatchesByProduct(Object.fromEntries(batchResults.map(({ id, batches }) => [id, batches])));
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          const co = getCachedOrders() as Order[] | null;
          const cp = getCachedProducts() as Product[] | null;
          setCustomer((cc ?? mockCustomers).find((c) => c.id === id) ?? null);
          setOrders(co ?? mockOrders);
          setProducts(cp ?? mockProducts);
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        const co = getCachedOrders() as Order[] | null;
        const cp = getCachedProducts() as Product[] | null;
        setCustomer((cc ?? mockCustomers).find((c) => c.id === id) ?? null);
        setOrders(co ?? mockOrders);
        setProducts(cp ?? mockProducts);
        setLoading(false);
      }
    };
    load();
  }, [id, isOnline]);

  const customerOrders = orders
    .filter((o) => o.customerId === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getProductName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? "Unknown Product";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pending":
        return "bg-orange-100 text-orange-700";
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
      case "Delivered":
        return "#22c55e";
      case "Cancelled":
        return "#ba1a1a";
      default:
        return "#c3c6d7";
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const sharePrices = () => {
    if (!products.length) return;
    const lines = products.map((p) => {
      const batches = batchesByProduct[p.id] ?? [];
      const oldest = batches
        .filter((b) => b.numberOfBottles > 0)
        .sort((a, b) => {
          if (!a.manufactureDate && !b.manufactureDate) return 0;
          if (!a.manufactureDate) return 1;
          if (!b.manufactureDate) return -1;
          return new Date(a.manufactureDate).getTime() - new Date(b.manufactureDate).getTime();
        })[0];
      const price = oldest?.unitPrice;
      if (!price) return null;
      return `• ${p.name} (${p.unitSize}L/bottle): ₹${price}/bottle`;
    }).filter(Boolean).join("\n");
    if (!lines) return;
    const message = `*Current Prices*\n\n${lines}`;
    const rawPhone = customer?.phone?.replace(/\D/g, "") ?? "";
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const saveToContacts = () => {
    if (!customer) return;
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${customer.name}`,
      customer.phone ? `TEL:${customer.phone}` : null,
      customer.email ? `EMAIL:${customer.email}` : null,
      customer.address ? `ADR:;;${customer.address};;;;` : null,
      "END:VCARD",
    ].filter(Boolean).join("\n");

    const blob = new Blob([lines], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.name}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] shadow-[0_1px_0_#c3c6d7] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/customers")}
            className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-bold text-[#131b2e]">Customer</span>
        </div>
        <div className="p-4 pb-24 max-w-2xl mx-auto">
          <p className="text-[#737686] text-sm mt-6">Loading…</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#faf8ff]">
        <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] shadow-[0_1px_0_#c3c6d7] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/customers")}
            className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-bold text-[#131b2e]">Customer</span>
        </div>
        <div className="p-4 pb-24 max-w-2xl mx-auto flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-[#eaedff] rounded-full p-4 mb-3">
            <User className="h-8 w-8 text-[#004ac6]" />
          </div>
          <p className="text-[#131b2e] font-semibold mb-1">Customer not found</p>
          <button
            onClick={() => navigate("/customers")}
            className="mt-3 text-sm text-[#2563eb] font-semibold hover:underline"
          >
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#c3c6d7] shadow-[0_1px_0_#c3c6d7] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/customers")}
          className="p-1.5 rounded-lg text-[#434655] hover:bg-[#f2f3ff] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-base font-bold text-[#131b2e] flex-1 truncate">{customer.name}</span>
        <div className="relative group flex-shrink-0">
          <button
            onClick={sharePrices}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] transition-colors active:scale-95"
          >
            <IndianRupee className="h-4 w-4" />
          </button>
          <div className="absolute top-full mt-2 right-0 bg-[#131b2e] text-white text-xs rounded-xl px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
            <div className="absolute bottom-full right-3 border-4 border-transparent border-b-[#131b2e]" />
            Share current prices
          </div>
        </div>
        <div className="relative group flex-shrink-0">
          <button
            onClick={saveToContacts}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] transition-colors active:scale-95"
          >
            <ContactRound className="h-4.5 w-4.5" />
          </button>
          <div className="absolute top-full mt-2 right-0 bg-[#131b2e] text-white text-xs rounded-xl px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
            <div className="absolute bottom-full right-3 border-4 border-transparent border-b-[#131b2e]" />
            Save to contacts
          </div>
        </div>
        <Link
          to={`/customers/edit/${customer.id}`}
          className="flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#004ac6] text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors active:scale-[0.97] flex-shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
      </div>

      <div className="p-4 pb-24 max-w-2xl mx-auto space-y-4">
        {/* Customer Info Card */}
        <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] p-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-[#eaedff] flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-[#004ac6]">{getInitials(customer.name)}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[#131b2e] truncate">{customer.name}</h2>
              {customer.address && (
                <p className="text-sm text-[#737686] mt-0.5 line-clamp-1">{customer.address}</p>
              )}
            </div>
          </div>

          {/* Contact rows */}
          <div className="space-y-0 divide-y divide-[#f2f3ff]">
            {customer.phone && (
              <a
                href={formatPhoneLink(customer.phone)}
                className="flex items-center gap-3 py-3 group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#eaedff] flex items-center justify-center flex-shrink-0">
                  <Phone className="h-4 w-4 text-[#004ac6]" />
                </div>
                <span className="text-sm text-[#131b2e] group-hover:text-[#2563eb] transition-colors">
                  {customer.phone}
                </span>
              </a>
            )}
            {customer.address && (
              <a
                href={customer.maps_link?.trim() || formatMapsLink(customer.address)}
                className="flex items-center gap-3 py-3 group"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#eaedff] flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-[#004ac6]" />
                </div>
                <span className="text-sm text-[#131b2e] group-hover:text-[#2563eb] transition-colors line-clamp-2">
                  {customer.address}
                </span>
              </a>
            )}
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-3 py-3 group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#eaedff] flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4 text-[#004ac6]" />
                </div>
                <span className="text-sm text-[#131b2e] group-hover:text-[#2563eb] transition-colors break-all min-w-0">
                  {customer.email}
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Order History */}
        <div>
          <h3 className="text-base font-bold text-[#131b2e] mb-3">
            Order History ({customerOrders.length})
          </h3>

          {customerOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,74,198,0.06)]">
              <div className="bg-[#eaedff] rounded-full p-4 mb-3">
                <PackageIcon className="h-7 w-7 text-[#004ac6]" />
              </div>
              <p className="text-[#131b2e] font-semibold text-sm">No orders yet</p>
              <p className="text-[#737686] text-xs mt-1">Orders from this customer will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customerOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/edit/${order.id}`}
                  className="block bg-white rounded-xl shadow-[0_4px_16px_rgba(0,74,198,0.06)] overflow-hidden active:scale-[0.99] transition-transform"
                  style={{ borderLeft: `3px solid ${getStatusBorderColor(order.status)}` }}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                      <div className="flex items-center gap-1 text-[#737686] flex-shrink-0">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-xs">{formatDate(order.date)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <PackageIcon className="h-4 w-4 text-[#737686] flex-shrink-0" />
                      <span className="text-sm text-[#434655]">
                        {getProductName(order.productId)} · {order.quantity} L
                      </span>
                    </div>
                    {order.notes && (
                      <p className="text-xs text-[#737686] italic mt-1.5">{order.notes}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
