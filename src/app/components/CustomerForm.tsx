import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getCustomer, createCustomer, updateCustomer } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, setCachedCustomers } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import type { Customer } from "../../lib/types";
import { customers as mockCustomers } from "../data/mockData";

export function CustomerForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const isOnline = useOnlineStatus();

  const [loading, setLoading] = useState(!!id);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    email: "",
  });

  useEffect(() => {
    if (!isEditing || !id) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const useSupabase = isSupabaseConfigured() && isOnline;
      if (useSupabase) {
        try {
          const customer = await getCustomer(id);
          if (customer) {
            setFormData({
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              email: customer.email ?? "",
            });
          }
        } catch (e) {
          console.error(e);
          const cached = getCachedCustomers() as Customer[] | null;
          const customer = cached?.find((c) => c.id === id);
          if (customer) {
            setFormData({
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              email: customer.email ?? "",
            });
          }
        } finally {
          setLoading(false);
        }
      } else {
        const cached = getCachedCustomers() as Customer[] | null;
        const customer = (cached ?? mockCustomers).find((c) => c.id === id);
        if (customer) {
          setFormData({
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            email: customer.email ?? "",
          });
        }
        setLoading(false);
      }
    };
    load();
  }, [isEditing, id, isOnline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!isSupabaseConfigured() || !isOnline) {
      toast.success(isEditing ? "Customer updated (saved locally)." : `Customer "${formData.name}" added (saved locally).`);
      navigate("/customers");
      return;
    }

    try {
      if (isEditing && id) {
        await updateCustomer(id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          email: formData.email.trim() || undefined,
        });
        toast.success("Customer updated successfully");
      } else {
        await createCustomer({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          email: formData.email.trim() || undefined,
        });
        toast.success(`Customer "${formData.name}" added successfully`);
      }
      const { getCustomers } = await import("../../lib/api");
      const list = await getCustomers();
      setCachedCustomers(list);
      navigate("/customers");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save customer");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="p-6 pb-24 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading…</p>
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

      <div className="mb-8">
        <h1 className="text-3xl text-foreground mb-2">
          {isEditing ? "Edit Customer" : "Add New Customer"}
        </h1>
        <p className="text-muted-foreground">
          {isEditing ? "Update customer information" : "Enter customer information"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block mb-3 text-foreground">
            Customer Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-6 py-4 rounded-xl border-2 border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter customer name"
            required
          />
        </div>

        <div>
          <label htmlFor="phone" className="block mb-3 text-foreground">
            Phone Number *
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-6 py-4 rounded-xl border-2 border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="+1 (555) 123-4567"
            required
          />
        </div>

        <div>
          <label htmlFor="address" className="block mb-3 text-foreground">
            Delivery Address *
          </label>
          <textarea
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full px-6 py-4 rounded-xl border-2 border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Enter delivery address"
            rows={3}
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="block mb-3 text-foreground">
            Email (Optional)
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full px-6 py-4 rounded-xl border-2 border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="customer@email.com"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl py-5 px-6 shadow-md transition-all active:scale-[0.98]"
        >
          {isEditing ? "Save Changes" : "Add Customer"}
        </button>
      </form>
    </div>
  );
}
