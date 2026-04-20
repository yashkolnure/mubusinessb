const { prisma }   = require('../../config/database');
const { asyncHandler, AppError } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder, getDateRange } = require('../../utils/pagination.util');
const { generateDocumentNumber, calculateTotals, toFloat } = require('../../utils/document.util');
const { emails } = require('../../utils/email.util');
const { generateInvoicePDF } = require('./invoice.pdf');

// ── Sanitize invoice body ──────────────────────────────────────────────────────
const sanitizeInvoice = (body) => {
  const d = { ...body };
  if (d.discountValue !== undefined) d.discountValue = toFloat(d.discountValue);
  ['notes','terms','internalNotes'].forEach((k) => { if (d[k] === '') d[k] = undefined; });
  return d;
};

const syncClientBalance = async (clientId) => {
  const result = await prisma.invoice.aggregate({
    where: { clientId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    _sum:  { balanceAmount: true },
  });
  await prisma.client.update({
    where: { id: clientId },
    data:  { outstandingBalance: result._sum.balanceAmount || 0 },
  });
};

exports.listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  // Search by invoice number or client name
  const searchTerm = req.query.search;
  const searchFilter = searchTerm ? {
    OR: [
      { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
      { client: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { client: { email: { contains: searchTerm, mode: 'insensitive' } } },
      { client: { company: { contains: searchTerm, mode: 'insensitive' } } },
    ],
  } : {};
  const search = searchFilter;
  const dateFilter = getDateRange(req.query, 'date');
  const orderBy    = getSortOrder(req.query, ['date','dueDate','totalAmount','invoiceNumber','createdAt']);
  const where = {
    businessId: req.businessId,
    ...search, ...dateFilter,
    ...(req.query.status   && { status:   req.query.status }),
    ...(req.query.clientId && { clientId: req.query.clientId }),
  };
  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({ where, skip, take: limit, orderBy, include: { client: { select: { id:true, name:true, email:true } }, _count: { select: { payments:true } } } }),
    prisma.invoice.count({ where }),
  ]);
  return paginatedResponse(res, { data: invoices, page, limit, total });
});

exports.getInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { client: true, items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } }, quotation: { select: { quotationNumber:true } } },
  });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (!invoice.viewedAt && req.query.markViewed === 'true') {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { viewedAt: new Date() } });
  }
  return successResponse(res, { data: invoice });
});

exports.createInvoice = asyncHandler(async (req, res) => {
  const { clientId, date, dueDate, items, discountType, discountValue = 0, notes, terms, internalNotes, isRecurring, recurringCycle, recurringEndDate } = req.body;
  
  if (!clientId) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Client is required.' });
  if (!items || !items.length) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'At least one item is required.' });

  const client = await prisma.client.findFirst({ where: { id: clientId, businessId: req.businessId } });
  if (!client) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });

  const invoiceNumber = await generateDocumentNumber(req.businessId, 'invoices');
  // calculateTotals coerces all string inputs to floats
  const totals = calculateTotals(items, discountType, toFloat(discountValue));

  const invoice = await prisma.invoice.create({
    data: {
      businessId: req.businessId,
      clientId,
      invoiceNumber,
      date:         date ? new Date(date) : new Date(),
      dueDate:      dueDate ? new Date(dueDate) : null,
      status:       'DRAFT',
      discountType: discountType || null,
      discountValue:toFloat(discountValue),
      discountAmount:totals.discountAmount,
      subtotal:     totals.subtotal,
      taxAmount:    totals.taxAmount,
      totalAmount:  totals.totalAmount,
      balanceAmount:totals.totalAmount,
      notes:        notes || null,
      terms:        terms || null,
      internalNotes:internalNotes || null,
      isRecurring:  isRecurring || false,
      recurringCycle: recurringCycle || null,
      recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null,
      items: { create: totals.items.map((item, idx) => ({ ...item, sortOrder: idx })) },
    },
    include: { items: true, client: { select: { id:true, name:true } } },
  });

  await req.audit({ module: 'invoicing', action: 'CREATE', entityType: 'Invoice', entityId: invoice.id, description: `Created invoice ${invoiceNumber}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Invoice created.', data: invoice });
});

exports.updateInvoice = asyncHandler(async (req, res) => {
  const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (['PAID','CANCELLED'].includes(existing.status)) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: `Cannot edit a ${existing.status.toLowerCase()} invoice.` });
  }

  const { items, discountType, discountValue = 0, ...rest } = req.body;
  let updateData = sanitizeInvoice(rest);

  if (items && items.length) {
    const totals = calculateTotals(items, discountType || existing.discountType, toFloat(discountValue));
    updateData = {
      ...updateData,
      discountType, discountValue: toFloat(discountValue),
      discountAmount: totals.discountAmount,
      subtotal:       totals.subtotal,
      taxAmount:      totals.taxAmount,
      totalAmount:    totals.totalAmount,
      balanceAmount:  totals.totalAmount - (existing.paidAmount || 0),
    };
    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({ where: { invoiceId: req.params.id } }),
      prisma.invoiceItem.createMany({ data: totals.items.map((item, idx) => ({ invoiceId: req.params.id, ...item, sortOrder: idx })) }),
    ]);
  }

  if (updateData.date)    updateData.date    = new Date(updateData.date);
  if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id }, data: updateData,
    include: { items: true, client: { select: { id:true, name:true } } },
  });
  await req.audit({ module: 'invoicing', action: 'UPDATE', entityType: 'Invoice', entityId: invoice.id });
  return successResponse(res, { message: 'Invoice updated.', data: invoice });
});

exports.sendInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { client: true, items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (invoice.status === 'CANCELLED') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Cannot send a cancelled invoice.' });
  if (!invoice.client.email) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Client has no email address.' });

  const business = await prisma.business.findUnique({ where: { id: req.businessId } });
  await emails.invoiceSent({
    clientName:    invoice.client.name,
    clientEmail:   invoice.client.email,
    invoiceNumber: invoice.invoiceNumber,
    amount:        `${business.currencySymbol}${invoice.balanceAmount.toFixed(2)}`,
    dueDate:       invoice.dueDate ? invoice.dueDate.toDateString() : 'No due date',
    invoiceUrl:    `${process.env.FRONTEND_URL}/invoices/${invoice.id}`,
    businessName:  business.name,
    businessId:    req.businessId,
  });

  await prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'SENT', sentAt: new Date() } });
  await req.audit({ module: 'invoicing', action: 'SEND', entityType: 'Invoice', entityId: req.params.id });
  return successResponse(res, { message: 'Invoice sent successfully.' });
});

exports.recordPayment = asyncHandler(async (req, res) => {
  const { amount, paymentDate, method, reference, notes, bankName, chequeNumber } = req.body;
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (invoice.status === 'CANCELLED') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Cannot record payment on a cancelled invoice.' });

  const payAmount = toFloat(amount);
  if (payAmount <= 0) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Payment amount must be positive.' });
  if (payAmount > invoice.balanceAmount + 0.01) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: `Payment of ${payAmount} exceeds balance ${invoice.balanceAmount}.` });
  }

  const newPaid    = parseFloat((invoice.paidAmount + payAmount).toFixed(2));
  const newBalance = parseFloat((invoice.totalAmount - newPaid).toFixed(2));
  const newStatus  = newBalance <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId:   req.params.id,
        amount:      payAmount,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        method:      method || 'BANK_TRANSFER',
        reference:   reference || null,
        notes:       notes    || null,
        bankName:    bankName || null,
        chequeNumber:chequeNumber || null,
      },
    }),
    prisma.invoice.update({ where: { id: req.params.id }, data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus } }),
  ]);

  await syncClientBalance(invoice.clientId);

  await prisma.finance.create({
    data: {
      businessId:    req.businessId,
      type:          'INCOME',
      category:      'Invoice Payment',
      amount:        payAmount,
      date:          paymentDate ? new Date(paymentDate) : new Date(),
      description:   `Payment for ${invoice.invoiceNumber}`,
      reference:     invoice.invoiceNumber,
      referenceId:   invoice.id,
      paymentMethod: method || 'BANK_TRANSFER',
      createdBy:     req.user.id,
    },
  });

  await req.audit({ module: 'invoicing', action: 'PAYMENT', entityType: 'Invoice', entityId: invoice.id, description: `Recorded ₹${payAmount} for ${invoice.invoiceNumber}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Payment recorded.', data: payment });
});

exports.deletePayment = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where:   { id: req.params.paymentId },
    include: { invoice: { select: { businessId:true, paidAmount:true, totalAmount:true, clientId:true } } },
  });
  if (!payment || payment.invoice.businessId !== req.businessId) {
    return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Payment not found.' });
  }
  const newPaid    = parseFloat((payment.invoice.paidAmount - payment.amount).toFixed(2));
  const newBalance = parseFloat((payment.invoice.totalAmount - newPaid).toFixed(2));
  const newStatus  = newPaid <= 0 ? 'SENT' : 'PARTIALLY_PAID';
  await prisma.$transaction([
    prisma.payment.delete({ where: { id: req.params.paymentId } }),
    prisma.invoice.update({ where: { id: req.params.id }, data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus } }),
  ]);
  await syncClientBalance(payment.invoice.clientId);
  return successResponse(res, { message: 'Payment deleted.' });
});

exports.cancelInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (invoice.status === 'PAID') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Cannot cancel a paid invoice.' });
  await prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
  await syncClientBalance(invoice.clientId);
  await req.audit({ module: 'invoicing', action: 'CANCEL', entityType: 'Invoice', entityId: req.params.id });
  return successResponse(res, { message: 'Invoice cancelled.' });
});

exports.duplicateInvoice = asyncHandler(async (req, res) => {
  const source = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId }, include: { items: true },
  });
  if (!source) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  const invoiceNumber = await generateDocumentNumber(req.businessId, 'invoices');
  const duplicate = await prisma.invoice.create({
    data: {
      businessId: req.businessId, clientId: source.clientId, invoiceNumber,
      date: new Date(), status: 'DRAFT',
      subtotal: source.subtotal, discountType: source.discountType, discountValue: source.discountValue,
      discountAmount: source.discountAmount, taxAmount: source.taxAmount,
      totalAmount: source.totalAmount, balanceAmount: source.totalAmount,
      notes: source.notes, terms: source.terms,
      items: { create: source.items.map(({ id:_id, invoiceId:_inv, ...item }) => item) },
    },
    include: { items: true },
  });
  return successResponse(res, { status: HTTP.CREATED, message: 'Invoice duplicated.', data: duplicate });
});

exports.downloadPDF = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { client: true, items: { orderBy: { sortOrder: 'asc' } }, payments: true },
  });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  const business = await prisma.business.findUnique({ where: { id: req.businessId } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  const doc = generateInvoicePDF(invoice, business);
  doc.pipe(res);
  doc.end();
});

exports.markOverdueInvoices = async (businessId) => {
  const result = await prisma.invoice.updateMany({
    where: { businessId, status: { in: ['SENT','PARTIALLY_PAID','VIEWED'] }, dueDate: { lt: new Date() }, balanceAmount: { gt: 0 } },
    data:  { status: 'OVERDUE' },
  });
  return result.count;
};

// ─── Credit Notes ──────────────────────────────────────────────────────────────
exports.createCreditNote = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  if (!['PAID','PARTIALLY_PAID'].includes(invoice.status)) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Credit notes can only be issued on paid invoices.' });
  }

  const business = await prisma.business.findUnique({ where: { id: req.businessId } });
  const cnNumber = `CN-${invoice.invoiceNumber}`;

  const cn = await prisma.creditNote.create({
    data: {
      businessId:      req.businessId,
      invoiceId:       invoice.id,
      creditNoteNumber:cnNumber,
      amount:          toFloat(amount),
      reason:          reason || null,
      date:            new Date(),
    },
  });

  // Optionally email the client
  if (req.body.sendEmail && invoice.clientId) {
    const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
    if (client?.email) {
      const { sendEmail } = require('../../utils/email.util');
      await sendEmail({
        to:      client.email,
        subject: `Credit Note ${cnNumber} from ${business.name}`,
        html:    `<p>Dear ${client.name},</p><p>A credit note of ${business.currencySymbol}${toFloat(amount).toFixed(2)} has been issued against invoice ${invoice.invoiceNumber}.</p><p>Reason: ${reason || 'N/A'}</p><p>Regards,<br>${business.name}</p>`,
      });
      await prisma.creditNote.update({ where: { id: cn.id }, data: { sentAt: new Date() } });
    }
  }

  await req.audit({ module:'invoicing', action:'CREDIT_NOTE', entityType:'Invoice', entityId:invoice.id, description:`Credit note ${cnNumber} for ${amount}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Credit note created.', data: cn });
});

exports.listCreditNotes = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!invoice) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Invoice not found.' });
  const notes = await prisma.creditNote.findMany({ where: { invoiceId: req.params.id }, orderBy: { createdAt: 'desc' } });
  return successResponse(res, { data: notes });
});
