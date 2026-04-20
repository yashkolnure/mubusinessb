const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder, getDateRange } = require('../../utils/pagination.util');
const { generateDocumentNumber, calculateTotals, toFloat } = require('../../utils/document.util');
const { emails } = require('../../utils/email.util');

exports.listQuotations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const searchTerm = req.query.search;
  const search = searchTerm ? {
    OR: [
      { quotationNumber: { contains: searchTerm, mode: 'insensitive' } },
      { client: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { client: { email: { contains: searchTerm, mode: 'insensitive' } } },
      { client: { company: { contains: searchTerm, mode: 'insensitive' } } },
    ],
  } : {};
  const dateFilter = getDateRange(req.query, 'date');
  const orderBy    = getSortOrder(req.query, ['date','totalAmount','quotationNumber','createdAt']);
  const where = {
    businessId: req.businessId, ...search, ...dateFilter,
    ...(req.query.status   && { status:   req.query.status }),
    ...(req.query.clientId && { clientId: req.query.clientId }),
  };
  const [quotations, total] = await prisma.$transaction([
    prisma.quotation.findMany({ where, skip, take: limit, orderBy, include: { client: { select: { id:true, name:true, email:true } } } }),
    prisma.quotation.count({ where }),
  ]);
  return paginatedResponse(res, { data: quotations, page, limit, total });
});

exports.getQuotation = asyncHandler(async (req, res) => {
  const q = await prisma.quotation.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { client: true, items: { orderBy: { sortOrder: 'asc' } }, invoice: { select: { invoiceNumber:true, id:true } } },
  });
  if (!q) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  return successResponse(res, { data: q });
});

exports.createQuotation = asyncHandler(async (req, res) => {
  const { clientId, date, validUntil, items, discountType, discountValue = 0, notes, terms, internalNotes } = req.body;

  if (!clientId) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Client is required.' });
  if (!items || !items.length) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'At least one item is required.' });

  const client = await prisma.client.findFirst({ where: { id: clientId, businessId: req.businessId } });
  if (!client) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });

  const quotationNumber = await generateDocumentNumber(req.businessId, 'quotations');
  const totals          = calculateTotals(items, discountType, toFloat(discountValue));

  const quotation = await prisma.quotation.create({
    data: {
      businessId: req.businessId,
      clientId,
      quotationNumber,
      date:         date       ? new Date(date)       : new Date(),
      validUntil:   validUntil ? new Date(validUntil) : null,
      status:       'DRAFT',
      discountType: discountType || null,
      discountValue:toFloat(discountValue),
      discountAmount:totals.discountAmount,
      subtotal:     totals.subtotal,
      taxAmount:    totals.taxAmount,
      totalAmount:  totals.totalAmount,
      notes:        notes        || null,
      terms:        terms        || null,
      internalNotes:internalNotes || null,
      items: { create: totals.items.map((item, idx) => ({ ...item, sortOrder: idx })) },
    },
    include: { items: true, client: { select: { id:true, name:true } } },
  });

  await req.audit({ module: 'quotations', action: 'CREATE', entityType: 'Quotation', entityId: quotation.id });
  return successResponse(res, { status: HTTP.CREATED, message: 'Quotation created.', data: quotation });
});

exports.updateQuotation = asyncHandler(async (req, res) => {
  const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  if (['CONVERTED','CANCELLED'].includes(existing.status)) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: `Cannot edit a ${existing.status.toLowerCase()} quotation.` });
  }

  const { items, discountType, discountValue = 0, ...rest } = req.body;
  let updateData = { ...rest };
  if (updateData.date)       updateData.date       = new Date(updateData.date);
  if (updateData.validUntil) updateData.validUntil = new Date(updateData.validUntil);

  if (items && items.length) {
    const totals = calculateTotals(items, discountType, toFloat(discountValue));
    updateData = { ...updateData, discountType, discountValue: toFloat(discountValue), discountAmount: totals.discountAmount, subtotal: totals.subtotal, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount };
    await prisma.$transaction([
      prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } }),
      prisma.quotationItem.createMany({ data: totals.items.map((item, idx) => ({ quotationId: req.params.id, ...item, sortOrder: idx })) }),
    ]);
  }

  const q = await prisma.quotation.update({ where: { id: req.params.id }, data: updateData, include: { items: true } });
  await req.audit({ module: 'quotations', action: 'UPDATE', entityType: 'Quotation', entityId: q.id });
  return successResponse(res, { message: 'Quotation updated.', data: q });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ['DRAFT','SENT','VIEWED','APPROVED','REJECTED','EXPIRED'];
  if (!allowed.includes(status)) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: `Invalid status.` });
  const q = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!q) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  await prisma.quotation.update({ where: { id: req.params.id }, data: { status } });
  await req.audit({ module: 'quotations', action: 'STATUS_CHANGE', entityType: 'Quotation', entityId: req.params.id, description: `Status → ${status}` });
  return successResponse(res, { message: `Status updated to ${status}.` });
});

exports.sendQuotation = asyncHandler(async (req, res) => {
  const q = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { client: true } });
  if (!q) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  if (!q.client.email) return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Client has no email address.' });
  const business = await prisma.business.findUnique({ where: { id: req.businessId } });
  await emails.quotationSent({ clientName: q.client.name, clientEmail: q.client.email, quotationNumber: q.quotationNumber, validUntil: q.validUntil ? q.validUntil.toDateString() : '–', quoteUrl: `${process.env.FRONTEND_URL}/quotations/${q.id}`, businessName: business.name, businessId: req.businessId });
  await prisma.quotation.update({ where: { id: req.params.id }, data: { status: 'SENT' } });
  return successResponse(res, { message: 'Quotation sent.' });
});

exports.convertToInvoice = asyncHandler(async (req, res) => {
  const q = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { items: true } });
  if (!q) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  if (q.status === 'CONVERTED') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Already converted.' });

  const invoiceNumber = await generateDocumentNumber(req.businessId, 'invoices');
  const { dueDate } = req.body;

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        businessId: req.businessId, clientId: q.clientId, quotationId: q.id,
        invoiceNumber, date: new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'DRAFT',
        subtotal: q.subtotal, discountType: q.discountType, discountValue: q.discountValue,
        discountAmount: q.discountAmount, taxAmount: q.taxAmount,
        totalAmount: q.totalAmount, balanceAmount: q.totalAmount,
        notes: q.notes, terms: q.terms,
        items: { create: q.items.map(({ id:_id, quotationId:_qid, ...item }) => item) },
      },
      include: { items: true },
    });
    await tx.quotation.update({ where: { id: q.id }, data: { status: 'CONVERTED' } });
    return inv;
  });

  await req.audit({ module: 'quotations', action: 'CONVERT', entityType: 'Quotation', entityId: q.id, description: `${q.quotationNumber} → ${invoiceNumber}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Converted to invoice.', data: invoice });
});

exports.deleteQuotation = asyncHandler(async (req, res) => {
  const q = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!q) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Quotation not found.' });
  if (q.status === 'CONVERTED') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Cannot delete a converted quotation.' });
  await prisma.quotation.delete({ where: { id: req.params.id } });
  return successResponse(res, { message: 'Quotation deleted.' });
});
