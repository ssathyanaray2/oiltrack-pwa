import { jsPDF } from "jspdf";
import type { Order, Product } from "./types";

const BUSINESS = {
  name: "Shabari's Chetana Cold Pressed Oil Dealers",
  address: "#54 Sree Krishna, 1st Main Road, CIL Layout, Block A, Sanjaynagar, Bangalore - 560094",
  phone: "6366303511",
};

export function getFinancialYear(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth(); // 0-indexed; 3 = April
  const year = date.getFullYear();
  if (month >= 3) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

export function getFYDateRange(dateStr: string): { start: string; end: string } {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month >= 3) {
    return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
  } else {
    return { start: `${year - 1}-04-01`, end: `${year}-03-31` };
  }
}

export function generateReceiptPDF(
  order: Order,
  products: Product[],
  receiptNumber: number
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth(); // 612pt
  const margin = 50;
  const contentW = pageW - margin * 2; // 512pt
  let y = 55;

  // ── Title ────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RECEIPT", pageW / 2, y, { align: "center" });
  y += 28;

  // ── Business name ────────────────────────────────────────
  doc.setFontSize(13);
  doc.text(BUSINESS.name, pageW / 2, y, { align: "center" });
  y += 18;

  // ── Address ──────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(BUSINESS.address, pageW / 2, y, { align: "center" });
  y += 15;

  // ── Phone ────────────────────────────────────────────────
  doc.text(`Ph: ${BUSINESS.phone}`, pageW / 2, y, { align: "center" });
  y += 40;

  // ── Date + Receipt No ────────────────────────────────────
  const fy = getFinancialYear(order.date);
  const receiptLabel = `${fy}_${receiptNumber}`;
  const formattedDate = new Date(order.date + "T00:00:00")
    .toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, "-");

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${formattedDate}`, margin, y);
  doc.text(`Receipt No.: ${receiptLabel}`, pageW - margin, y, { align: "right" });
  y += 35;

  // ── Customer ─────────────────────────────────────────────
  doc.setFontSize(12);
  doc.text(`Sri/Smt: ${order.customerName}`, margin, y);
  y += 30;

  // ── Table setup ──────────────────────────────────────────
  // Column x positions (left edge of each column)
  const colParticulars = margin;
  const colQty = margin + contentW * 0.58;     // ~347
  const colRate = margin + contentW * 0.72;    // ~419
  const colAmount = margin + contentW;         // ~562 (right edge)
  const rowH = 22;
  const textOffsetY = 15; // baseline within row

  const drawRowBorders = (rowY: number, h: number) => {
    // Outer rect
    doc.rect(margin, rowY, contentW, h, "S");
    // Column separators
    doc.line(colQty - 4, rowY, colQty - 4, rowY + h);
    doc.line(colRate - 4, rowY, colRate - 4, rowY + h);
    doc.line(colAmount - 70, rowY, colAmount - 70, rowY + h);
  };

  // ── Table header ─────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  drawRowBorders(y, rowH);
  doc.text("Particulars", colParticulars + 5, y + textOffsetY);
  doc.text("QTY", (colQty - 4 + colRate - 4) / 2, y + textOffsetY, { align: "center" });
  doc.text("Rate", (colRate - 4 + colAmount - 70) / 2, y + textOffsetY, { align: "center" });
  doc.text("Amount", colAmount - 5, y + textOffsetY, { align: "right" });
  y += rowH;

  // ── Table rows ───────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  const items =
    order.items && order.items.length > 0
      ? order.items
      : [{ productId: order.productId, quantity: order.quantity, unitPrice: 0, costPrice: 0 }];

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    const name = product?.name ?? "Unknown";
    const qty = item.quantity;
    const rate = item.unitPrice ?? 0;
    const amount = qty * rate;

    drawRowBorders(y, rowH);
    doc.text(name, colParticulars + 5, y + textOffsetY);
    doc.text(qty.toFixed(2), (colQty - 4 + colRate - 4) / 2, y + textOffsetY, { align: "center" });
    doc.text(rate.toFixed(2), (colRate - 4 + colAmount - 70) / 2, y + textOffsetY, { align: "center" });
    doc.text(amount.toFixed(2), colAmount - 5, y + textOffsetY, { align: "right" });
    y += rowH;
  }

  y += 25;

  // ── Totals ───────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice ?? 0), 0);
  const shipping = order.deliveryCharge ?? 0;
  const grandTotal = subtotal + shipping;

  const labelX = pageW - margin - 160;
  const valueX = pageW - margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);

  doc.text("SUBTOTAL", labelX, y, { align: "right" });
  doc.text(subtotal.toFixed(2), valueX, y, { align: "right" });
  y += 18;

  doc.text("SHIPPING/HANDLING", labelX, y, { align: "right" });
  doc.text(shipping.toFixed(2), valueX, y, { align: "right" });
  y += 8;

  // Line above grand total
  doc.line(labelX - 80, y, valueX, y);
  y += 14;

  doc.setFontSize(11);
  doc.text("Grand Total", labelX, y, { align: "right" });
  doc.text(grandTotal.toFixed(2), valueX, y, { align: "right" });
  y += 6;

  // Double line below grand total
  doc.line(labelX - 80, y, valueX, y);
  y += 3;
  doc.line(labelX - 80, y, valueX, y);

  return doc.output("blob");
}
