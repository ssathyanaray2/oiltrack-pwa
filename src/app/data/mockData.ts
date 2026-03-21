export interface Product {
  id: string;
  name: string;
  stock: number;
  unit: string;
  lowStockThreshold: number;
  pricePerLiter: number;
  sellingPrice: number;
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

export interface SalesData {
  month: string;
  sales: number;
}

export interface InventoryData {
  month: string;
  level: number;
}

export const products: Product[] = [
  { id: "1", name: "Vegetable Oil", stock: 450, unit: "Liters", lowStockThreshold: 200, pricePerLiter: 3.50, sellingPrice: 0 },
  { id: "2", name: "Olive Oil", stock: 180, unit: "Liters", lowStockThreshold: 200, pricePerLiter: 8.00, sellingPrice: 0 },
  { id: "3", name: "Sunflower Oil", stock: 320, unit: "Liters", lowStockThreshold: 200, pricePerLiter: 4.25, sellingPrice: 0 },
  { id: "4", name: "Coconut Oil", stock: 150, unit: "Liters", lowStockThreshold: 200, pricePerLiter: 6.75, sellingPrice: 0 },
  { id: "5", name: "Palm Oil", stock: 280, unit: "Liters", lowStockThreshold: 200, pricePerLiter: 3.80, sellingPrice: 0 },
];

export const customers: Customer[] = [
  {
    id: "1",
    name: "Maria's Restaurant",
    phone: "+1 (555) 123-4567",
    address: "123 Main Street, Downtown",
    email: "maria@restaurant.com",
  },
  {
    id: "2",
    name: "Santos Bakery",
    phone: "+1 (555) 234-5678",
    address: "456 Oak Avenue, West Side",
    email: "santos@bakery.com",
  },
  {
    id: "3",
    name: "Green Market",
    phone: "+1 (555) 345-6789",
    address: "789 Pine Road, East End",
  },
  {
    id: "4",
    name: "Bella's Bistro",
    phone: "+1 (555) 456-7890",
    address: "321 Elm Street, Midtown",
    email: "bella@bistro.com",
  },
  {
    id: "5",
    name: "City Supermarket",
    phone: "+1 (555) 567-8901",
    address: "654 Maple Drive, North District",
    email: "orders@citysupermarket.com",
  },
];

export const orders: Order[] = [
  {
    id: "1",
    customerId: "1",
    customerName: "Maria's Restaurant",
    productId: "1",
    quantity: 50,
    date: "2026-03-14",
    status: "Pending",
    paymentStatus: "Unpaid",
    notes: "Deliver in the morning",
  },
  {
    id: "2",
    customerId: "2",
    customerName: "Santos Bakery",
    productId: "2",
    quantity: 30,
    date: "2026-03-13",
    status: "Delivered",
    paymentStatus: "Paid",
  },
  {
    id: "3",
    customerId: "3",
    customerName: "Green Market",
    productId: "3",
    quantity: 75,
    date: "2026-03-12",
    status: "Delivered",
    paymentStatus: "Paid",
  },
  {
    id: "4",
    customerId: "4",
    customerName: "Bella's Bistro",
    productId: "4",
    quantity: 25,
    date: "2026-03-11",
    status: "Cancelled",
    paymentStatus: "Unpaid",
    notes: "Customer requested cancellation",
  },
  {
    id: "5",
    customerId: "5",
    customerName: "City Supermarket",
    productId: "1",
    quantity: 100,
    date: "2026-03-10",
    status: "Delivered",
    paymentStatus: "Partial",
  },
];

export const monthlySales: SalesData[] = [
  { month: "Jan", sales: 42000 },
  { month: "Feb", sales: 38500 },
  { month: "Mar", sales: 45200 },
  { month: "Apr", sales: 41800 },
  { month: "May", sales: 48600 },
  { month: "Jun", sales: 52100 },
  { month: "Jul", sales: 49300 },
  { month: "Aug", sales: 51700 },
  { month: "Sep", sales: 47900 },
  { month: "Oct", sales: 53400 },
  { month: "Nov", sales: 50200 },
  { month: "Dec", sales: 55800 },
];

export const inventoryLevels: InventoryData[] = [
  { month: "Jan", level: 1200 },
  { month: "Feb", level: 1150 },
  { month: "Mar", level: 1380 },
  { month: "Apr", level: 1280 },
  { month: "May", level: 1420 },
  { month: "Jun", level: 1350 },
  { month: "Jul", level: 1400 },
  { month: "Aug", level: 1320 },
  { month: "Sep", level: 1290 },
  { month: "Oct", level: 1360 },
  { month: "Nov", level: 1410 },
  { month: "Dec", level: 1380 },
];