import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getCustomers, getOrders } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, getCachedOrders, setCachedCustomers, setCachedOrders } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Customer, Order } from "../../lib/types";
import { customers as mockCustomers, orders as mockOrders } from "../data/mockData";
import { User, Phone, MapPin, Mail, Plus, ShoppingBag } from "lucide-react";
import React from "react";
import { formatMapsLink } from "../../lib/utils";

export function Customers() {
  const isOnline = useOnlineStatus();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const [customersData, ordersData] = await Promise.all([getCustomers(), getOrders()]);
          setCustomers(customersData);
          setOrders(ordersData);
          setCachedCustomers(customersData);
          setCachedOrders(ordersData);
        } catch (e) {
          console.error(e);
          const cc = getCachedCustomers() as Customer[] | null;
          const co = getCachedOrders() as Order[] | null;
          setCustomers(cc?.length ? cc : mockCustomers);
          setOrders(co?.length ? co : mockOrders);
        } finally {
          setLoading(false);
        }
      } else {
        const cc = getCachedCustomers() as Customer[] | null;
        const co = getCachedOrders() as Order[] | null;
        setCustomers(cc?.length ? cc : mockCustomers);
        setOrders(co?.length ? co : mockOrders);
        setLoading(false);
      }
    };
    load();
  }, [isOnline]);

  const getCustomerOrderCount = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId).length;
  const getCustomerPendingOrders = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId && o.status === "Pending").length;

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading customers…</p>
      </div>
    );
  }

  const getMapsUrl = (customer: Customer): string | null => {
    // Priority 1: use saved maps link directly
    if (customer.maps_link?.trim()) {
      return customer.maps_link.trim()
    }
    // Priority 2: fall back to address text search
    if (customer.address?.trim()) {
      return formatMapsLink(customer.address)
    }
    return null
  }
  

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl text-foreground mb-2">Customers</h1>
        <p className="text-muted-foreground">Manage customer information</p>
      </div>

      <Link
        to="/customers/new"
        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl py-5 px-6 flex items-center justify-center gap-3 mb-6 shadow-md transition-all active:scale-[0.98] w-full"
      >
        <Plus className="h-7 w-7" />
        <span className="text-xl">Add Customer</span>
      </Link>

      <div className="space-y-4">
        {customers.map((customer) => {
          const totalOrders = getCustomerOrderCount(customer.id);
          const pendingOrders = getCustomerPendingOrders(customer.id);

          return (
            <Link
              key={customer.id}
              to={`/customers/${customer.id}`}
              className="block bg-card rounded-2xl p-6 shadow-md border-2 border-border hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary/10 p-3 rounded-xl">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3>{customer.name}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="h-4 w-4" />
                      {totalOrders} {totalOrders === 1 ? "order" : "orders"}
                    </span>
                    {pendingOrders > 0 && (
                      <span className="bg-accent text-accent-foreground px-2 py-1 rounded-lg">
                        {pendingOrders} pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="h-5 w-5 flex-shrink-0" />
                  <a
                    href={`tel:${customer.phone}`}
                    className="hover:text-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {customer.phone}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <MapPin className="h-5 w-5 flex-shrink-0" />
                  <a
                    href={getMapsUrl(customer) ?? ''}
                    className="hover:text-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{customer.address}</span>
                  </a>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Mail className="h-5 w-5 flex-shrink-0" />
                    <a
                      href={`mailto:${customer.email}`}
                      className="hover:text-primary transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customer.email}
                    </a>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
