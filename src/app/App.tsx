import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import React, { useEffect } from "react";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { requestPersistentStorage } from "../lib/db";

export default function App() {
  // Auto-sync IndexedDB queue whenever the device comes back online
  useOfflineSync();

  // Request persistent storage on first load so the browser won't
  // evict offline data under disk pressure
  useEffect(() => {
    requestPersistentStorage();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </>
  );
}
