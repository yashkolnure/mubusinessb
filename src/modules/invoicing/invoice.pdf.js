const PDFDocument = require('pdfkit');

/**
 * Generates a professional invoice PDF
 * @param {object} invoice – full invoice with items, client, payments
 * @param {object} business – business details
 * @returns {PDFDocument}
 */
const generateInvoicePDF = (invoice, business) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const { currencySymbol: cs = '₹' } = business;

  const fmt = (n) => `${cs}${parseFloat(n || 0).toFixed(2)}`;
  const statusColor = {
    PAID: '#16a34a', OVERDUE: '#dc2626', PARTIALLY_PAID: '#d97706',
    DRAFT: '#6b7280', SENT: '#2563eb', CANCELLED: '#dc2626',
  };

  // ── Header ──────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill('#4F46E5');

  doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
     .text(business.name || 'MyBusiness', 50, 28);

  doc.fontSize(9).font('Helvetica')
     .text([business.address, business.city, business.state, business.pincode].filter(Boolean).join(', '), 50, 55)
     .text(`GSTIN: ${business.gstin || '–'}  |  ${business.email || ''}`, 50, 68);

  // Invoice label
  doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold')
     .text('INVOICE', 380, 25, { width: 165, align: 'right' });

  // ── Invoice Meta ─────────────────────────────────────────
  doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text('Invoice #', 50, 110);
  doc.font('Helvetica').fillColor('#4F46E5').text(invoice.invoiceNumber, 130, 110);

  doc.fillColor('#111827').font('Helvetica-Bold').text('Date:', 50, 126);
  doc.font('Helvetica').fillColor('#374151').text(new Date(invoice.date).toLocaleDateString('en-IN'), 130, 126);

  if (invoice.dueDate) {
    doc.fillColor('#111827').font('Helvetica-Bold').text('Due Date:', 50, 142);
    doc.font('Helvetica').fillColor('#374151').text(new Date(invoice.dueDate).toLocaleDateString('en-IN'), 130, 142);
  }

  // Status badge
  const sColor = statusColor[invoice.status] || '#6b7280';
  doc.roundedRect(400, 108, 145, 22, 4).fill(sColor);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
     .text(invoice.status.replace('_', ' '), 400, 113, { width: 145, align: 'center' });

  // ── Bill To ───────────────────────────────────────────────
  doc.fillColor('#4F46E5').fontSize(9).font('Helvetica-Bold').text('BILL TO', 50, 180);
  doc.moveTo(50, 191).lineTo(200, 191).lineWidth(1).stroke('#4F46E5');

  doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text(invoice.client.name, 50, 198);
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  if (invoice.client.company) doc.text(invoice.client.company, 50, 212);
  if (invoice.client.email)   doc.text(invoice.client.email, 50, 224);
  if (invoice.client.phone)   doc.text(invoice.client.phone, 50, 236);
  if (invoice.client.gstin)   doc.text(`GSTIN: ${invoice.client.gstin}`, 50, 248);

  // ── Items Table ────────────────────────────────────────────
  const tableTop = 290;
  const colX = { no: 50, desc: 75, qty: 300, unit: 350, price: 390, tax: 440, amount: 490 };

  // Table header
  doc.rect(50, tableTop, 495, 22).fill('#4F46E5');
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
  doc.text('#',          colX.no,    tableTop + 6, { width: 20  });
  doc.text('Description',colX.desc,  tableTop + 6, { width: 220 });
  doc.text('Qty',        colX.qty,   tableTop + 6, { width: 45, align: 'right' });
  doc.text('Price',      colX.price, tableTop + 6, { width: 45, align: 'right' });
  doc.text('Tax',        colX.tax,   tableTop + 6, { width: 45, align: 'right' });
  doc.text('Amount',     colX.amount,tableTop + 6, { width: 55, align: 'right' });

  // Table rows
  let y = tableTop + 24;
  invoice.items.forEach((item, idx) => {
    if (idx % 2 === 0) doc.rect(50, y - 2, 495, 20).fill('#f9fafb');

    doc.fillColor('#374151').font('Helvetica').fontSize(9);
    doc.text(String(idx + 1),      colX.no,    y, { width: 20 });
    doc.text(item.description,     colX.desc,  y, { width: 220 });
    doc.text(String(item.quantity),colX.qty,   y, { width: 45, align: 'right' });
    doc.text(fmt(item.unitPrice),  colX.price, y, { width: 45, align: 'right' });
    doc.text(`${item.taxRate}%`,   colX.tax,   y, { width: 45, align: 'right' });
    doc.text(fmt(item.amount),     colX.amount,y, { width: 55, align: 'right' });
    y += 20;
  });

  // Table border
  doc.rect(50, tableTop, 495, y - tableTop).lineWidth(0.5).stroke('#e5e7eb');

  // ── Totals ────────────────────────────────────────────────
  y += 12;
  const totalsX = 370;

  const addTotalRow = (label, value, bold = false, color = '#374151') => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
       .fillColor('#6b7280').text(label, totalsX, y, { width: 100 })
       .fillColor(color).text(value, totalsX + 105, y, { width: 70, align: 'right' });
    y += 16;
  };

  addTotalRow('Subtotal:',   fmt(invoice.subtotal));
  if (invoice.discountAmount > 0) addTotalRow('Discount:', `-${fmt(invoice.discountAmount)}`, false, '#dc2626');
  addTotalRow('Tax:',        fmt(invoice.taxAmount));

  doc.moveTo(totalsX, y - 2).lineTo(545, y - 2).lineWidth(1.5).stroke('#4F46E5');
  y += 4;
  addTotalRow('Total:', fmt(invoice.totalAmount), true, '#4F46E5');

  if (invoice.paidAmount > 0) {
    addTotalRow('Paid:', fmt(invoice.paidAmount), false, '#16a34a');
    addTotalRow('Balance Due:', fmt(invoice.balanceAmount), true, '#dc2626');
  }

  // ── Notes & Terms ─────────────────────────────────────────
  if (invoice.notes) {
    y += 16;
    doc.fillColor('#4F46E5').font('Helvetica-Bold').fontSize(9).text('NOTES', 50, y);
    y += 12;
    doc.fillColor('#374151').font('Helvetica').fontSize(9).text(invoice.notes, 50, y, { width: 280 });
  }

  if (invoice.terms) {
    y += 28;
    doc.fillColor('#4F46E5').font('Helvetica-Bold').fontSize(9).text('TERMS & CONDITIONS', 50, y);
    y += 12;
    doc.fillColor('#374151').font('Helvetica').fontSize(9).text(invoice.terms, 50, y, { width: 280 });
  }

  // ── Footer ─────────────────────────────────────────────────
  const footerY = doc.page.height - 55;
  doc.rect(0, footerY, doc.page.width, 55).fill('#f3f4f6');
  doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
     .text('Thank you for your business!', 50, footerY + 18, { width: doc.page.width - 100, align: 'center' })
     .text(`Generated by MyBusiness Platform`, 50, footerY + 32, { width: doc.page.width - 100, align: 'center' });

  return doc;
};

module.exports = { generateInvoicePDF };
