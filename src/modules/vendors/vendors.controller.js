const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder, getDateRange } = require('../../utils/pagination.util');
const { generateDocumentNumber, calculateTotals, toFloat } = require('../../utils/document.util');

// ══════════════════════════════════════════════════════════════
// VENDORS
// ══════════════════════════════════════════════════════════════

exports.listVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search  = buildSearchFilter(req.query.search, ['name','email','phone','company','gstin']);
  const orderBy = getSortOrder(req.query, ['name','createdAt','outstandingBalance']);

  const where = { businessId: req.businessId, isActive: req.query.isActive !== 'false', ...search };

  const [vendors, total] = await prisma.$transaction([
    prisma.vendor.findMany({ where, skip, take: limit, orderBy }),
    prisma.vendor.count({ where }),
  ]);
  return paginatedResponse(res, { data: vendors, page, limit, total });
});

exports.getVendor = asyncHandler(async (req, res) => {
  const vendor = await prisma.vendor.findFirst({
    where:   { id: req.params.id, businessId: req.businessId },
    include: { _count: { select: { purchases: true } } },
  });
  if (!vendor) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Vendor not found.' });
  return successResponse(res, { data: vendor });
});

exports.createVendor = asyncHandler(async (req, res) => {
  const vendor = await prisma.vendor.create({ data: { businessId: req.businessId, ...req.body } });
  await req.audit({ module: 'vendors', action: 'CREATE', entityType: 'Vendor', entityId: vendor.id });
  return successResponse(res, { status: HTTP.CREATED, message: 'Vendor created.', data: vendor });
});

exports.updateVendor = asyncHandler(async (req, res) => {
  const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Vendor not found.' });
  const vData = { ...req.body };
  if (vData.creditPeriod !== undefined) vData.creditPeriod = parseInt(vData.creditPeriod, 10) || 0;
  if (vData.outstandingBalance !== undefined) vData.outstandingBalance = parseFloat(vData.outstandingBalance) || 0;
  const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: vData });
  return successResponse(res, { message: 'Vendor updated.', data: vendor });
});

exports.deleteVendor = asyncHandler(async (req, res) => {
  const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Vendor not found.' });
  await prisma.vendor.update({ where: { id: req.params.id }, data: { isActive: false } });
  return successResponse(res, { message: 'Vendor deleted.' });
});

// ══════════════════════════════════════════════════════════════
// PURCHASES
// ══════════════════════════════════════════════════════════════

const syncVendorBalance = async (vendorId) => {
  const result = await prisma.purchase.aggregate({
    where: { vendorId, status: { notIn: ['CANCELLED'] } },
    _sum:  { balanceAmount: true },
  });
  await prisma.vendor.update({ where: { id: vendorId }, data: { outstandingBalance: result._sum.balanceAmount || 0 } });
};

exports.listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const dateFilter = getDateRange(req.query, 'date');
  const orderBy    = getSortOrder(req.query, ['date','totalAmount','purchaseNumber','createdAt']);

  const where = {
    businessId: req.businessId, ...dateFilter,
    ...(req.query.vendorId && { vendorId: req.query.vendorId }),
    ...(req.query.status   && { status:   req.query.status }),
  };

  const [purchases, total] = await prisma.$transaction([
    prisma.purchase.findMany({
      where, skip, take: limit, orderBy,
      include: { vendor: { select: { id: true, name: true } } },
    }),
    prisma.purchase.count({ where }),
  ]);
  return paginatedResponse(res, { data: purchases, page, limit, total });
});

exports.getPurchase = asyncHandler(async (req, res) => {
  const purchase = await prisma.purchase.findFirst({
    where:   { id: req.params.id, businessId: req.businessId },
    include: { vendor: true, items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } } },
  });
  if (!purchase) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Purchase not found.' });
  return successResponse(res, { data: purchase });
});

exports.createPurchase = asyncHandler(async (req, res) => {
  const { vendorId, date, dueDate, items, notes } = req.body;

  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, businessId: req.businessId } });
  if (!vendor) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Vendor not found.' });

  const purchaseNumber = await generateDocumentNumber(req.businessId, 'purchases');
  const totals         = calculateTotals(items, null, 0);

  const purchase = await prisma.purchase.create({
    data: {
      businessId: req.businessId,
      vendorId, purchaseNumber,
      date:       date ? new Date(date) : new Date(),
      dueDate:    dueDate ? new Date(dueDate) : null,
      status:     'PENDING',
      subtotal:   totals.subtotal,
      taxAmount:  totals.taxAmount,
      totalAmount:totals.totalAmount,
      balanceAmount:totals.totalAmount,
      notes,
      items: {
        create: totals.items.map((item, idx) => ({
          productId:   item.productId || null,
          description: item.description,
          quantity:    item.quantity,
          unit:        item.unit,
          unitPrice:   item.unitPrice,
          taxRate:     item.taxRate || 0,
          taxAmount:   item.taxAmount,
          amount:      item.amount,
          sortOrder:   idx,
        })),
      },
    },
    include: { items: true },
  });

  // Auto-update inventory stock-in
  for (const item of req.body.items) {
    if (item.productId) {
      await prisma.$transaction([
        prisma.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity } } }),
        prisma.stockLog.create({ data: { productId: item.productId, type: 'IN', quantity: item.quantity, balanceAfter: 0, reference: purchaseNumber, referenceId: purchase.id, createdBy: req.user.id } }),
      ]);
    }
  }

  await syncVendorBalance(vendorId);
  await req.audit({ module: 'purchases', action: 'CREATE', entityType: 'Purchase', entityId: purchase.id });

  return successResponse(res, { status: HTTP.CREATED, message: 'Purchase created.', data: purchase });
});

exports.recordVendorPayment = asyncHandler(async (req, res) => {
  const { amount, paymentDate, method, reference, notes } = req.body;

  const purchase = await prisma.purchase.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!purchase) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Purchase not found.' });

  const payAmount  = toFloat(amount);
  const newPaid    = parseFloat((purchase.paidAmount + payAmount).toFixed(2));
  const newBalance = parseFloat((purchase.totalAmount - newPaid).toFixed(2));
  const newStatus  = newBalance <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.$transaction([
    prisma.vendorPayment.create({ data: { purchaseId: req.params.id, amount: payAmount, paymentDate: paymentDate ? new Date(paymentDate) : new Date(), method, reference, notes } }),
    prisma.purchase.update({ where: { id: req.params.id }, data: { paidAmount: newPaid, balanceAmount: newBalance, status: newStatus } }),
  ]);

  await syncVendorBalance(purchase.vendorId);

  await prisma.finance.create({
    data: {
      businessId:    req.businessId,
      type:          'EXPENSE',
      category:      'Vendor Payment',
      amount:        payAmount,
      date:          paymentDate ? new Date(paymentDate) : new Date(),
      description:   `Payment for purchase ${purchase.purchaseNumber}`,
      reference:     purchase.purchaseNumber,
      referenceId:   purchase.id,
      paymentMethod: method,
      createdBy:     req.user.id,
    },
  });

  return successResponse(res, { status: HTTP.CREATED, message: 'Vendor payment recorded.' });
});

exports.updatePurchaseStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const purchase = await prisma.purchase.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!purchase) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Purchase not found.' });

  await prisma.purchase.update({ where: { id: req.params.id }, data: { status } });
  return successResponse(res, { message: `Purchase status updated to ${status}.` });
});

// Patch: sanitize vendor numeric fields on create/update
const _origCreate = module.exports.createVendor;
const _origUpdate = module.exports.updateVendor;

// Override with sanitized versions
module.exports.createVendor = async (req, res, next) => {
  if (req.body.creditPeriod   !== undefined) req.body.creditPeriod   = parseInt(req.body.creditPeriod, 10) || 0;
  if (req.body.outstandingBalance !== undefined) req.body.outstandingBalance = toFloat(req.body.outstandingBalance);
  return _origCreate(req, res, next);
};
module.exports.updateVendor = async (req, res, next) => {
  if (req.body.creditPeriod   !== undefined) req.body.creditPeriod   = parseInt(req.body.creditPeriod, 10) || 0;
  if (req.body.outstandingBalance !== undefined) req.body.outstandingBalance = toFloat(req.body.outstandingBalance);
  return _origUpdate(req, res, next);
};
