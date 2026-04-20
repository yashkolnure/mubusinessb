const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder, getDateRange } = require('../../utils/pagination.util');
const { toFloat } = require('../../utils/document.util');

// ── Sanitize a client body: coerce numeric strings to floats ─────────────────
const sanitizeClient = (body) => {
  const d = { ...body };
  if (d.creditLimit  !== undefined) d.creditLimit  = toFloat(d.creditLimit);
  if (d.outstandingBalance !== undefined) d.outstandingBalance = toFloat(d.outstandingBalance);
  // Remove empty strings for optional fields so DB doesn't complain
  ['email','phone','alternatePhone','company','gstin','pan',
   'billingAddress','billingCity','billingState','billingPincode',
   'shippingAddress','shippingCity','shippingState','shippingPincode',
   'notes','currency','website'].forEach((k) => {
    if (d[k] === '') d[k] = undefined;
  });
  return d;
};

exports.listClients = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search  = buildSearchFilter(req.query.search, ['name', 'email', 'phone', 'company', 'gstin']);
  const orderBy = getSortOrder(req.query, ['name', 'email', 'createdAt', 'outstandingBalance']);
  const where = {
    businessId: req.businessId,
    isActive:   req.query.isActive !== 'false',
    ...search,
  };
  const [clients, total] = await prisma.$transaction([
    prisma.client.findMany({ where, skip, take: limit, orderBy }),
    prisma.client.count({ where }),
  ]);
  return paginatedResponse(res, { data: clients, page, limit, total });
});

exports.getClient = asyncHandler(async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
    include: { _count: { select: { invoices: true, quotations: true } } },
  });
  if (!client) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });
  return successResponse(res, { data: client });
});

exports.createClient = asyncHandler(async (req, res) => {
  const data = sanitizeClient(req.body);
  const client = await prisma.client.create({
    data: { businessId: req.businessId, ...data },
  });
  await req.audit({ module: 'clients', action: 'CREATE', entityType: 'Client', entityId: client.id, description: `Created client: ${client.name}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Client created.', data: client });
});

exports.updateClient = asyncHandler(async (req, res) => {
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });
  const data = sanitizeClient(req.body);
  const client = await prisma.client.update({ where: { id: req.params.id }, data });
  await req.audit({ module: 'clients', action: 'UPDATE', entityType: 'Client', entityId: client.id, oldData: existing, newData: client });
  return successResponse(res, { message: 'Client updated.', data: client });
});

exports.deleteClient = asyncHandler(async (req, res) => {
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });
  await prisma.client.update({ where: { id: req.params.id }, data: { isActive: false } });
  await req.audit({ module: 'clients', action: 'DELETE', entityType: 'Client', entityId: req.params.id });
  return successResponse(res, { message: 'Client deleted.' });
});

exports.getClientActivity = asyncHandler(async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!client) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });
  const [invoices, quotations] = await prisma.$transaction([
    prisma.invoice.findMany({
      where: { clientId: req.params.id },
      select: { id:true, invoiceNumber:true, date:true, totalAmount:true, paidAmount:true, balanceAmount:true, status:true },
      orderBy: { date: 'desc' }, take: 20,
    }),
    prisma.quotation.findMany({
      where: { clientId: req.params.id },
      select: { id:true, quotationNumber:true, date:true, totalAmount:true, status:true },
      orderBy: { date: 'desc' }, take: 10,
    }),
  ]);
  return successResponse(res, { data: { client, invoices, quotations, invoiceCount: invoices.length } });
});

exports.getClientStatement = asyncHandler(async (req, res) => {
  const dateFilter = getDateRange(req.query, 'date');
  const client = await prisma.client.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!client) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Client not found.' });
  const invoices = await prisma.invoice.findMany({
    where: { clientId: req.params.id, status: { notIn: ['DRAFT', 'CANCELLED'] }, ...dateFilter },
    include: { payments: { select: { amount:true, paymentDate:true, method:true, reference:true } } },
    orderBy: { date: 'asc' },
  });
  const summary = {
    totalInvoiced: invoices.reduce((s, i) => s + i.totalAmount, 0),
    totalPaid:     invoices.reduce((s, i) => s + i.paidAmount, 0),
    totalBalance:  invoices.reduce((s, i) => s + i.balanceAmount, 0),
    overdueAmount: invoices.filter((i) => i.status === 'OVERDUE' || (i.dueDate && i.dueDate < new Date() && i.balanceAmount > 0)).reduce((s, i) => s + i.balanceAmount, 0),
  };
  return successResponse(res, { data: { client, invoices, summary } });
});
