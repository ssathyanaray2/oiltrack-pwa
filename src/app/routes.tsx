import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { AuthGuard } from "./components/AuthGuard";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { Inventory } from "./components/Inventory";
import { ProductForm } from "./components/ProductForm";
import { Orders } from "./components/Orders";
import { OrderForm } from "./components/OrderForm";
import { Customers } from "./components/Customers";
import { CustomerDetail } from "./components/CustomerDetail";
import { CustomerForm } from "./components/CustomerForm";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  {
    path: "/",
    Component: AuthGuard,
    children: [
      {
        Component: Root,
        children: [
          { index: true, Component: Dashboard },
          { path: "inventory", Component: Inventory },
          { path: "inventory/new", Component: ProductForm },
          { path: "orders", Component: Orders },
          { path: "orders/new", Component: OrderForm },
          { path: "orders/edit/:id", Component: OrderForm },
          { path: "customers", Component: Customers },
          { path: "customers/new", Component: CustomerForm },
          { path: "customers/edit/:id", Component: CustomerForm },
          { path: "customers/:id", Component: CustomerDetail },
        ],
      },
    ],
  },
]);
