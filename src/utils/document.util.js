const { prisma } = require('../config/database');

/**
 * Generates and increments the next document number atomically
 */
const generateDocumentNumber = async (businessId, type) => {
  const fieldMap = {
    invoices:   { counter: 'nextInvoiceNo',   prefix: 'invoicePrefix' },
    quotations: { counter: 'nextQuotationNo', prefix: 'quotationPrefix' },
    purchases:  { counter: 'nextPurchaseNo',  prefix: 'purchasePrefix' },
  };

  const { counter, prefix: prefixField } = fieldMap[type];

  const business = await prisma.$transaction(async (tx) => {
    const biz = await tx.business.findUnique({ where: { id: businessId } });
    await tx.business.update({
      where: { id: businessId },
      data:  { [counter]: { increment: 1 } },
    });
    return biz;
  });

  const prefix = business[prefixField] || type.slice(0, 3).toUpperCase();
  const year   = new Date().getFullYear();
  const number = String(business[counter]).padStart(4, '0');
  return `${prefix}-${year}-${number}`;
};

/**
 * Safely parse a value to float, returning 0 if empty/null/undefined/NaN
 */
const toFloat = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/**
 * Safely parse a value to int
 */
const toInt = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
};

/**
 * Calculate invoice/quotation totals from items.
 * Handles string inputs from HTML forms — all numeric fields are coerced.
 */
const calculateTotals = (items, discountType, discountValue) => {
  let subtotal  = 0;
  let taxAmount = 0;

  const processedItems = items.map((item) => {
    const quantity     = toFloat(item.quantity);
    const unitPrice    = toFloat(item.unitPrice);
    const taxRate      = toFloat(item.taxRate);
    const discountRate = toFloat(item.discountRate);

    const lineTotal      = quantity * unitPrice;
    const discountAmt    = lineTotal * (discountRate / 100);
    const taxableAmount  = lineTotal - discountAmt;
    const lineTax        = taxableAmount * (taxRate / 100);
    const lineAmount     = taxableAmount + lineTax;

    subtotal  += taxableAmount;
    taxAmount += lineTax;

    // ── CRITICAL FIX: explicitly set coerced numbers, never spread raw strings ──
    return {
      description:   String(item.description || ''),
      productId:     item.productId || null,
      unit:          item.unit      || null,
      sortOrder:     toInt(item.sortOrder),
      // All numeric fields explicitly coerced to Float
      quantity:      quantity,
      unitPrice:     unitPrice,
      taxRate:       taxRate,
      discountRate:  discountRate,
      taxAmount:     parseFloat(lineTax.toFixed(2)),
      discountAmount:parseFloat(discountAmt.toFixed(2)),
      amount:        parseFloat(lineAmount.toFixed(2)),
    };
  });

  let docDiscountAmount = 0;
  const dv = toFloat(discountValue);
  if (discountType === 'PERCENT' && dv > 0) {
    docDiscountAmount = subtotal * (dv / 100);
  } else if (discountType === 'FIXED' && dv > 0) {
    docDiscountAmount = dv;
  }

  const finalSubtotal = subtotal - docDiscountAmount;
  const total         = finalSubtotal + taxAmount;

  return {
    items:          processedItems,
    subtotal:       parseFloat(finalSubtotal.toFixed(2)),
    discountAmount: parseFloat(docDiscountAmount.toFixed(2)),
    taxAmount:      parseFloat(taxAmount.toFixed(2)),
    totalAmount:    parseFloat(total.toFixed(2)),
  };
};

module.exports = { generateDocumentNumber, calculateTotals, toFloat, toInt };
