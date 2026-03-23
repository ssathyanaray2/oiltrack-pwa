import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Product {
  id: string;
  name: string;
  pricePerLiter: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { imageBase64, mimeType, products } = await req.json() as {
      imageBase64: string;
      mimeType: string;
      products: Product[];
    };

    if (!imageBase64 || !mimeType || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: imageBase64, mimeType, products" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("VITE_ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "VITE_ANTHROPIC_API_KEY secret not set on this function" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const productList = products.map((p) => `- "${p.name}"`).join("\n");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
              },
              {
                type: "text",
                text: `This image contains an oil product price list. Extract ALL product prices from the image.

Our inventory products:
${productList}

Rules:
1. For each price in the image, try to match it to a product from our inventory list above
2. If a confident match is found, set "matchedProduct" to the EXACT name from our list
3. If no match exists in our inventory, set "matchedProduct" to null — still include the item
4. Prices must be plain numbers only (e.g. 142.50, not "₹142.50")
5. Return ONLY a valid JSON array — no explanation, no markdown, no extra text

JSON format:
[
  {
    "matchedProduct": "exact name from our list or null",
    "extractedName": "name as written in the image",
    "newPrice": 142.50
  }
]

If the image has no prices at all, return [].`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const body = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error (${anthropicRes.status}): ${body}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicRes.json();
    const raw: string =
      data.content?.[0]?.type === "text" ? data.content[0].text.trim() : "[]";

    // Safely extract JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ changes: [] }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const extracted: Array<{
      matchedProduct: string | null;
      extractedName: string;
      newPrice: number;
    }> = JSON.parse(jsonMatch[0]);

    const changes = extracted
      .filter((item) => item.newPrice && item.newPrice > 0)
      .map((item) => {
        if (item.matchedProduct) {
          const product = products.find((p) => p.name === item.matchedProduct);
          if (!product) {
            // Claude returned a name that doesn't exactly match — treat as new
            return {
              productId: "",
              productName: item.extractedName,
              extractedName: item.extractedName,
              currentPrice: 0,
              newPrice: Number(item.newPrice),
              isNew: true,
            };
          }
          return {
            productId: product.id,
            productName: product.name,
            extractedName: item.extractedName,
            currentPrice: product.pricePerLiter,
            newPrice: Number(item.newPrice),
            isNew: false,
          };
        }
        // No match in inventory — include as a new/unknown item
        return {
          productId: "",
          productName: item.extractedName,
          extractedName: item.extractedName,
          currentPrice: 0,
          newPrice: Number(item.newPrice),
          isNew: true,
        };
      });

    return new Response(
      JSON.stringify({ changes }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
