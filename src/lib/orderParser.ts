import { supabase } from "./supabase";

export interface ParsedOrderItem {
  productId: string;
  productName: string;
  quantity: number;
}

export async function parseOrderText(
  text: string,
  products: Array<{ id: string; name: string; unitSize: number }>
): Promise<ParsedOrderItem[]> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.functions.invoke("parse-order-text", {
    body: { text, products },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return (data?.items ?? []) as ParsedOrderItem[];
}
