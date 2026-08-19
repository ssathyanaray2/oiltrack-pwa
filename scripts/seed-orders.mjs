import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://gzsocqxeyrtrcneyrvkr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6c29jcXhleXJ0cmNuZXlydmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTk1ODcsImV4cCI6MjA4OTE3NTU4N30.hmlMMWzLKRCeS_EzNrixOaWqQzBrG_9_fVEPeAvrUQY"
);

async function seed() {
  // Sign in first
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: "ssathyanaray2@binghamton.edu",
    password: "spoo12",
  });
  if (authError) {
    console.error("Auth failed:", authError.message);
    process.exit(1);
  }
  console.log("Signed in successfully.");

  // Fetch existing customers and products
  const { data: customers } = await supabase.from("customers").select("id, name").limit(10);
  const { data: products } = await supabase.from("products").select("id, name, unit_size").limit(5);
  const { data: { user } } = await supabase.auth.getUser();

  if (!customers?.length || !products?.length) {
    console.error("No customers or products found. Add some first.");
    process.exit(1);
  }
  if (!user) {
    console.error("Not authenticated. You need to be signed in.");
    process.exit(1);
  }

  const statuses = ["Pending", "Packed", "Delivered", "Cancelled"];
  const paymentStatuses = ["Paid", "Unpaid"];
  const now = new Date();

  // Generate 80 orders spread over last 3 months
  for (let i = 0; i < 80; i++) {
    const customer = customers[i % customers.length];
    const daysAgo = Math.floor(Math.random() * 90);
    const orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - daysAgo);
    const dateStr = orderDate.toISOString().slice(0, 10);

    const status = statuses[i % statuses.length];
    const paymentStatus = status === "Delivered" ? "Paid" : paymentStatuses[i % 2];
    const totalAmount = Math.floor(Math.random() * 5000) + 500;

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id: customer.id,
        customer_name: customer.name,
        status,
        payment_status: paymentStatus,
        total_amount: totalAmount,
        order_date: dateStr,
        user_id: user.id,
      })
      .select()
      .single();

    if (orderError) {
      console.error(`Order ${i + 1} failed:`, orderError.message);
      continue;
    }

    // Insert 1-2 items per order
    const itemCount = Math.random() > 0.5 ? 2 : 1;
    for (let j = 0; j < itemCount; j++) {
      const product = products[(i + j) % products.length];
      const quantity = Math.floor(Math.random() * 5) + 1;
      const unitPrice = Math.floor(Math.random() * 200) + 100;

      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
      });
    }

    console.log(`✓ Order ${i + 1}/80 — ${customer.name} (${status}) on ${dateStr}`);
  }

  console.log("\nDone! 80 test orders created.");
}

seed().catch(console.error);
