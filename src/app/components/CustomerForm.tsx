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
      <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center pb-32">
        <p className="text-[#737686]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-[#faf8ff] flex items-center justify-between px-5 py-4 shadow-[0_1px_0_#c3c6d7]">
        <button
          onClick={() => navigate("/customers")}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f3ff] text-[#434655] hover:bg-[#eaedff] transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-[#131b2e]">
          {isEditing ? "Edit Customer" : "Add Customer"}
        </h1>
        <div className="w-9" />
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="mx-5 mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
          <WifiOff className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">You're offline</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Customer will be saved locally and synced automatically when you're back online
            </p>
          </div>
        </div>
      )}

      {/* Form card */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,74,198,0.06)] mx-5 mt-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
              placeholder="Enter customer name"
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
              placeholder="+1 (555) 123-4567"
              required
            />
          </div>

          {/* Address */}
          <div>
            <label htmlFor="address" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Delivery Address <span className="text-red-500">*</span>
            </label>
            <textarea
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686] resize-none"
              placeholder="Enter delivery address"
              rows={3}
              required
            />
          </div>

          {/* Maps Link */}
          <div>
            <label className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Google Maps Link
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.maps_link ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, maps_link: e.target.value }))}
                className="flex-1 px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
                placeholder="Paste Google Maps link here"
              />
              {/* Paste button — super handy on mobile */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (
                      text.includes("maps.google") ||
                      text.includes("goo.gl/maps") ||
                      text.includes("maps.app.goo.gl")
                    ) {
                      setFormData((prev) => ({ ...prev, maps_link: text }));
                      toast.success("Maps link pasted!");
                    } else {
                      toast.error("That doesn't look like a Maps link");
                    }
                  } catch {
                    toast.error("Could not read clipboard");
                  }
                }}
                className="bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] px-4 py-3.5 rounded-xl border border-[#c3c6d7] font-semibold text-sm transition-colors active:scale-95 whitespace-nowrap"
              >
                Paste
              </button>
            </div>
            <p className="text-xs text-[#737686] mt-1.5">
              Open Google Maps → Share → Copy Link → Paste here
            </p>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-[#131b2e] mb-1.5">
              Email <span className="text-[#737686] font-normal">(Optional)</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-5 py-3.5 rounded-xl border border-[#c3c6d7] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#131b2e] placeholder:text-[#737686]"
              placeholder="customer@email.com"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-[#004ac6] hover:bg-[#003ea8] text-white rounded-2xl py-4 font-semibold text-base transition-colors active:scale-[0.98] mt-2"
          >
            {isEditing ? "Save Changes" : "Add Customer"}
          </button>
        </form>
      </div>
    </div>
  );
}
