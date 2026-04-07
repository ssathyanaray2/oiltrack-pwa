/** App-facing types (camelCase) used across the UI */
export interface Product {
  id: string;
  name: string;
  stock: number;
  unit: string;
  lowStockThreshold: number;
  unitSize: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  maps_link?: string;
  email?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  productId: string;
  quantity: number;
  date: string;
  createdAt?: string;
  status: "Pending" | "Packed" | "Delivered" | "Cancelled";
  paymentStatus: "Paid" | "Unpaid";
  paymentMethod?: "Cash" | "UPI";
  notes?: string;
  items?: Array<{ productId: string; quantity: number; unitPrice?: number; costPrice?: number; batchId?: string }>;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
}

export interface SalesData {
  month: string;
  sales: number;
}

export interface InventoryData {
  month: string;
  level: number;
}

export interface ProductBatch {
  id: string;
  productId: string;
  batchNumber: string;
  numberOfBottles: number;
  bottleSizeLitres: number;
  unitPrice: number;
  costPrice: number;
  quantityLitres: number;
  manufactureDate: string | null;
  expiryDate: string | null;
  notes?: string;
  createdAt?: string;
}
