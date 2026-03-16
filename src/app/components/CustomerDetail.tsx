import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { getCustomer, getOrders, getProducts } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, getCachedOrders, getCachedProducts } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Customer, Order, Product } from "../../lib/types";
import { customers as mockCustomers, orders as mockOrders, products as mockProducts } from "../data/mockData";
import { ArrowLeft, User, Phone, MapPin, Mail, Calendar, Package as PackageIcon, Pencil } from "lucide-react";

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
        return "bg-accent text-accent-foreground";
      case "Delivered":
        return "bg-primary/20 text-primary";
      case "Cancelled":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-center text-muted-foreground">Customer not found</p>
        <button onClick={() => navigate("/customers")} className="mt-4 text-primary">
          Back to Customers
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-2xl mx-auto">
      <button
        onClick={() => navigate("/customers")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Back to Customers</span>
      </button>

      <div className="bg-card rounded-2xl p-6 shadow-md border-2 border-border mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-primary/10 p-4 rounded-xl">
              <User className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl">{customer.name}</h1>
          </div>
          <Link
            to={`/customers/edit/${customer.id}`}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-3 px-4 flex items-center gap-2"
          >
            <Pencil className="h-5 w-5" />
            <span>Edit</span>
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-foreground">
            <Phone className="h-5 w-5 text-primary flex-shrink-0" />
            <a href={`tel:${customer.phone}`} className="hover:text-primary transition-colors">
              {customer.phone}
            </a>
          </div>
          <div className="flex items-center gap-3 text-foreground">
            <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
            <span>{customer.address}</span>
          </div>
          {customer.email && (
            <div className="flex items-center gap-3 text-foreground">
              <Mail className="h-5 w-5 text-primary flex-shrink-0" />
              <a href={`mailto:${customer.email}`} className="hover:text-primary transition-colors">
                {customer.email}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-2xl mb-4">Order History ({customerOrders.length})</h2>
      </div>

      {customerOrders.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border-2 border-border">
          <p className="text-muted-foreground text-lg">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customerOrders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/edit/${order.id}`}
              className="block bg-card rounded-xl p-4 shadow border-2 border-border hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className={`${getStatusColor(order.status)} px-3 py-1 rounded-lg text-sm`}>
                  {order.status}
                </span>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(order.date)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <PackageIcon className="h-5 w-5 text-primary" />
                <span>
                  {getProductName(order.productId)} - {order.quantity} liters
                </span>
              </div>
              {order.notes && (
                <p className="text-sm text-muted-foreground mt-2 italic">{order.notes}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
