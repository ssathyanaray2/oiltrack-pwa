import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { getCustomer, createCustomer, updateCustomer } from "../../lib/api";
import { isSupabaseConfigured } from "../../lib/supabase";
import { getCachedCustomers, setCachedCustomers } from "../../lib/cache";
import { useOnlineStatus } from "../hooks/useOfflineStorage";
import { offlineCustomersDB } from "../../lib/db";
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
    maps_link: "",
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
              maps_link: customer.maps_link ?? "",
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
              maps_link: customer.maps_link ?? "",
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
            maps_link: customer.maps_link ?? "",
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
      await offlineCustomersDB.put({
        id: `offline-customer-${Date.now()}`,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        email: formData.email.trim(),
        maps_link: formData.maps_link.trim(),
        createdAt: new Date().toISOString(),
        isEdit: isEditing,
        originalId: id ?? "",
      });
      toast.success(
        isEditing
          ? `Changes to "${formData.name}" saved. Will sync when back online.`
          : `"${formData.name}" saved. Will sync when back online.`,
        { duration: 5000 }
      );
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
          maps_link: formData.maps_link.trim() || undefined,
        });
        toast.success("Customer updated successfully");
      } else {
        await createCustomer({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          email: formData.email.trim() || undefined,
          maps_link: formData.maps_link.trim() || undefined,
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
      {!isOnline && (
        <div className="bg-accent/20 border-2 border-accent rounded-2xl p-4 mb-6 flex items-center gap-3">
          <WifiOff className="h-6 w-6 text-accent-foreground flex-shrink-0" />
          <div>
            <p className="font-medium text-accent-foreground">You're offline</p>
            <p className="text-sm text-foreground">Customer will be saved locally and synced automatically when you're back online</p>
          </div>
        </div>
      )}
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


        {/* Maps Link */}
        <div>
          <label className="block mb-2 text-foreground font-medium">
            Google Maps Link
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={formData.maps_link ?? ''}
              onChange={e => setFormData(prev => ({ 
                ...prev, maps_link: e.target.value 
              }))}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-border 
                        bg-background focus:outline-none focus:ring-2 
                        focus:ring-primary text-base"
              placeholder="Paste Google Maps link here"
            />
            {/* Paste button — super handy on mobile */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text.includes('maps.google') || 
                      text.includes('goo.gl/maps') || 
                      text.includes('maps.app.goo.gl')) {
                    setFormData(prev => ({ ...prev, maps_link: text }))
                    toast.success('Maps link pasted!')
                  } else {
                    toast.error('That doesn\'t look like a Maps link')
                  }
                } catch {
                  toast.error('Could not read clipboard')
                }
              }}
              className="bg-secondary px-4 py-3 rounded-xl border-2 
                        border-border font-medium text-secondary-foreground"
            >
              Paste
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Open Google Maps → Share → Copy Link → Paste here
          </p>
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
