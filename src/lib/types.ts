/** App-facing types (camelCase) used across the UI */
export interface Product {
  id: string;
  name: string;
  stock: number;
  unit: string;
  lowStockThreshold: number;
  pricePerLiter: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
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
  status: "Pending" | "Delivered" | "Cancelled";
  paymentStatus: "Paid" | "Unpaid" | "Partial";
  notes?: string;
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
