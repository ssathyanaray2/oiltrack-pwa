import { supabase } from "./supabase";

export interface PriceChange {
  productId: string;
  productName: string;
  extractedName: string;
  currentPrice: number;
  newPrice: number;
  isNew: boolean;
}

type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function extractPricesFromImage(
  imageBase64: string,
  mimeType: SupportedMimeType,
  products: Array<{ id: string; name: string; pricePerLiter: number }>
): Promise<PriceChange[]> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("analyze-price-image", {
    body: { imageBase64, mimeType, products },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return (data?.changes ?? []) as PriceChange[];
}
