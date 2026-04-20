const { prisma }   = require('../../config/database');
const { toFloat }  = require('../../utils/document.util');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, getSortOrder, getDateRange } = require('../../utils/pagination.util');

exports.listEntries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const dateFilter = getDateRange(req.query, 'date');
  const orderBy    = getSortOrder(req.query, ['date','amount','createdAt']);

  const where = {
    businessId: req.businessId, ...dateFilter,
    ...(req.query.type       && { type:       req.query.type }),
    ...(req.query.category   && { category:   { contains: req.query.category, mode: 'insensitive' } }),
    ...(req.query.isReconciled !== undefined && { isReconciled: req.query.isReconciled === 'true' }),
  };

  const [entries, total] = await prisma.$transaction([
    prisma.finance.findMany({ where, skip, take: limit, orderBy }),
    prisma.finance.count({ where }),
  ]);
  return paginatedResponse(res, { data: entries, page, limit, total });
});

exports.getEntry = asyncHandler(async (req, res) => {
  const entry = await prisma.finance.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!entry) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Finance entry not found.' });
  return successResponse(res, { data: entry });
});

exports.createEntry = asyncHandler(async (req, res) => {
  const { type, category, subCategory, amount, date, description, paymentMethod, reference } = req.body;

  const entry = await prisma.finance.create({
    data: {
      businessId: req.businessId,
      type, category, subCategory,
      amount:     toFloat(amount),
      date:       new Date(date),
      description, paymentMethod, reference,
      createdBy:  req.user.id,
    },
  });

  await req.audit({ module: 'finance', action: 'CREATE', entityType: 'Finance', entityId: entry.id });
  return successResponse(res, { status: HTTP.CREATED, message: 'Entry created.', data: entry });
});

exports.updateEntry = asyncHandler(async (req, res) => {
  const existing = await prisma.finance.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Entry not found.' });

  const entry = await prisma.finance.update({ where: { id: req.params.id }, data: req.body });
  return successResponse(res, { message: 'Entry updated.', data: entry });
});

exports.deleteEntry = asyncHandler(async (req, res) => {
  const existing = await prisma.finance.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Entry not found.' });

  await prisma.finance.delete({ where: { id: req.params.id } });
  await req.audit({ module: 'finance', action: 'DELETE', entityType: 'Finance', entityId: req.params.id });
  return successResponse(res, { message: 'Entry deleted.' });
});

// GET /finance/dashboard – live summary
exports.getDashboard = asyncHandler(async (req, res) => {
  const now       = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear  = new Date(now.getFullYear(), 0, 1);

  const [monthIncome, monthExpense, yearIncome, yearExpense, overdueInvoices, pendingPayables] =
    await prisma.$transaction([
      prisma.finance.aggregate({ where: { businessId: req.businessId, type: 'INCOME',  date: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.finance.aggregate({ where: { businessId: req.businessId, type: 'EXPENSE', date: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.finance.aggregate({ where: { businessId: req.businessId, type: 'INCOME',  date: { gte: startOfYear  } }, _sum: { amount: true } }),
      prisma.finance.aggregate({ where: { businessId: req.businessId, type: 'EXPENSE', date: { gte: startOfYear  } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({  where: { businessId: req.businessId, status: 'OVERDUE' },                           _sum: { balanceAmount: true }, _count: true }),
      prisma.purchase.aggregate({ where: { businessId: req.businessId, status: { in: ['PENDING','PARTIALLY_PAID'] } },_sum: { balanceAmount: true }, _count: true }),
    ]);

  const mi = monthIncome._sum.amount || 0;
  const me = monthExpense._sum.amount || 0;
  const yi = yearIncome._sum.amount || 0;
  const ye = yearExpense._sum.amount || 0;

  return successResponse(res, {
    data: {
      thisMonth:  { income: mi, expense: me, profit: mi - me },
      thisYear:   { income: yi, expense: ye, profit: yi - ye },
      overdueReceivables: { amount: overdueInvoices._sum.balanceAmount || 0, count: overdueInvoices._count },
      pendingPayables:    { amount: pendingPayables._sum.balanceAmount  || 0, count: pendingPayables._count },
    },
  });
});

// GET /finance/cash-flow?year=2024
exports.getCashFlow = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const [income, expense] = await prisma.$transaction([
    prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM date)::int as month, SUM(amount) as total
      FROM finance_entries
      WHERE "businessId" = ${req.businessId} AND type = 'INCOME'
        AND EXTRACT(YEAR FROM date) = ${year}
      GROUP BY month ORDER BY month
    `,
    prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM date)::int as month, SUM(amount) as total
      FROM finance_entries
      WHERE "businessId" = ${req.businessId} AND type = 'EXPENSE'
        AND EXTRACT(YEAR FROM date) = ${year}
      GROUP BY month ORDER BY month
    `,
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      month:   m,
      income:  parseFloat(income.find((r) => r.month === m)?.total  || 0),
      expense: parseFloat(expense.find((r) => r.month === m)?.total || 0),
      profit:  parseFloat(income.find((r) => r.month === m)?.total  || 0) -
               parseFloat(expense.find((r) => r.month === m)?.total || 0),
    };
  });

  return successResponse(res, { data: { year, months } });
});

// GET /finance/categories
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await prisma.finance.groupBy({
    by:    ['type', 'category'],
    where: { businessId: req.businessId },
    _sum:  { amount: true },
    _count:{ category: true },
    orderBy: { _sum: { amount: 'desc' } },
  });
  return successResponse(res, { data: categories });
});
