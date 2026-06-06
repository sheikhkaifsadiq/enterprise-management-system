import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 1:1 port of server/services/pdfService.js (pdfkit-table) → browser jsPDF.
// Preserves the ERP System invoice layout exactly: branding header, IDENTITY MATRIX,
// INVENTORY LOGISTICS BREAKDOWN table, financial summary, FINAL SETTLEMENT box, footer.

export interface InvoiceOrder {
  id: number | string;
  customer_name?: string | null;
  fullname: string;
  phone?: string | null;
  total_amount: number | string;
  discount_amount: number | string;
  final_amount: number | string;
  created_at: string;
  items: Array<{
    name: string;
    quantity: number | string;
    unit?: string | null;
    price: number | string;
  }>;
}

export interface InvoiceBusinessInfo {
  company_name: string;
  whatsapp_number: string;
}

const fmt = (n: number | string) => `Rs. ${parseFloat(String(n)).toLocaleString()}`;

export function generateInvoice(order: InvoiceOrder, businessInfo: InvoiceBusinessInfo): jsPDF {
  // A4 with 30pt margins (matches pdfkit setup)
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595
  const LEFT = 30;
  const RIGHT = pageWidth - 30;

  // --- 1. Branding Header ---
  doc.setTextColor("#1a2035");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text((businessInfo.company_name || "ERP SYSTEM").toUpperCase(), LEFT, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#64748b");
  doc.text("Official Showroom Transaction Receipt", LEFT, 66);

  // Horizontal separator
  doc.setDrawColor("#edf2f7");
  doc.line(LEFT, 78, RIGHT, 78);

  // --- 2. Identity & Reference Matrix ---
  const topY = 100;
  doc.setTextColor("#1a2035");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ISSUED TO:", LEFT, topY);
  doc.setFont("helvetica", "normal");
  doc.text(String(order.customer_name || order.fullname || ""), LEFT, topY + 15);
  doc.text(`Contact: ${order.phone ?? ""}`, LEFT, topY + 28);

  doc.setFont("helvetica", "bold");
  doc.text("ORDER REFERENCE:", 400, topY);
  doc.setFont("helvetica", "normal");
  doc.text(`#OR-${order.id}`, 400, topY + 15);
  doc.text(`Timestamp: ${new Date(order.created_at).toLocaleString()}`, 400, topY + 28);

  // --- 3. Itemized Logistics Table ---
  autoTable(doc, {
    startY: topY + 55,
    head: [["Product Asset", "Qty", "Unit", "Rate", "Total"]],
    body: order.items.map((it) => [
      it.name,
      String(it.quantity),
      it.unit ?? "",
      fmt(it.price),
      fmt(parseFloat(String(it.price)) * Number(it.quantity)),
    ]),
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [26, 32, 53],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { textColor: [45, 55, 72], fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 230 },
      1: { cellWidth: 50, halign: "right" },
      2: { cellWidth: 60 },
      3: { cellWidth: 90, halign: "right" },
      4: { cellWidth: 95, halign: "right" },
    },
    styles: { cellPadding: 5 },
    margin: { left: LEFT, right: 30 },
    didDrawCell: () => { /* hook reserved */ },
  });

  // After table position
  type DocWithLastAuto = jsPDF & { lastAutoTable?: { finalY: number } };
  const afterTableY = ((doc as DocWithLastAuto).lastAutoTable?.finalY ?? topY + 55) + 20;

  // --- 4. Financial Settlement Summary ---
  const summaryLabelX = 380;
  const summaryValueX = 565;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#1a2035");

  doc.text("Gross Valuation:", summaryLabelX, afterTableY);
  doc.text(fmt(order.total_amount), summaryValueX, afterTableY, { align: "right" });

  doc.setTextColor("#ef4444");
  doc.text("Tier Markdown:", summaryLabelX, afterTableY + 16);
  doc.text(`- ${fmt(order.discount_amount || 0)}`, summaryValueX, afterTableY + 16, { align: "right" });

  // Final Total highlight box
  const boxY = afterTableY + 30;
  doc.setFillColor("#f8fafc");
  doc.rect(370, boxY, 200, 30, "F");
  doc.setTextColor("#1a2035");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FINAL SETTLEMENT:", 380, boxY + 19);
  doc.text(fmt(order.final_amount), summaryValueX, boxY + 19, { align: "right" });

  // --- 5. Legal Footer ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#94a3b8");
  doc.text(
    `This is a system-generated electronic receipt. For digital inquiries or claims, contact us via WhatsApp: ${businessInfo.whatsapp_number || "N/A"}`,
    pageWidth / 2,
    800,
    { align: "center", maxWidth: 535 },
  );

  return doc;
}

export function downloadInvoice(order: InvoiceOrder, businessInfo: InvoiceBusinessInfo) {
  const doc = generateInvoice(order, businessInfo);
  doc.save(`Invoice_OR-${order.id}.pdf`);
}
