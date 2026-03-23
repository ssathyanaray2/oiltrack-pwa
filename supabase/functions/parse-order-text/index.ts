import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { text, products } = await req.json() as {
      text: string;
      products: Array<{ id: string; name: string; unitSize: number }>;
    };

    if (!text?.trim() || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text, products" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("VITE_ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "VITE_ANTHROPIC_API_KEY secret not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const productList = products
      .map((p) => `- "${p.name}" (id: ${p.id}, container size: ${p.unitSize}L)`)
      .join("\n");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Extract oil product orders from the text below and match them to our product list.

Our products (with container sizes):
${productList}

Order text:
"${text}"

Rules:
1. Match each product mentioned to the closest item in our product list
2. The "quantity" field in your output = TOTAL LITRES requested (not number of containers)
   - If user says "10L groundnut" → quantity = 10
   - If user says "2 units of Groundnut Oil - 5L" → quantity = 10 (2 × 5L)
   - If no unit given, assume litres
3. Only include items you are reasonably confident about
4. The "productId" must be copied EXACTLY from our product list above
5. Return ONLY a valid JSON array — no explanation, no markdown

Format:
[
  { "productId": "id from list", "productName": "exact name from list", "quantity": 10 }
]

If nothing matches, return [].`,
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

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ items: [] }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const items = (JSON.parse(jsonMatch[0]) as Array<{
      productId: string;
      productName: string;
      quantity: number;
    }>).filter((item) => item.productId && item.quantity > 0);

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
