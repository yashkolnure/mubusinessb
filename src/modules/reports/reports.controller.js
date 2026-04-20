const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, HTTP } = require('../../utils/response.util');
const { getDateRange } = require('../../utils/pagination.util');
const ExcelJS = require('exceljs');

// ── SALES REPORT ─────────────────────────────────────────────────────────────
exports.salesReport = asyncHandler(async (req, res) => {
  const dateFilter = getDateRange(req.query, 'date');

  const invoices = await prisma.invoice.findMany({
    where: { businessId: req.businessId, status: { notIn: ['DRAFT','CANCELLED'] }, ...dateFilter },
    include: { client: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  const summary = {
    totalInvoices:  invoices.length,
    totalAmount:    invoices.reduce((s, i) => s + i.totalAmount, 0),
    totalPaid:      invoices.reduce((s, i) => s + i.paidAmount,  0),
    totalOutstanding:invoices.reduce((s, i) => s + i.balanceAmount, 0),
    totalTax:       invoices.reduce((s, i) => s + i.taxAmount, 0),
    byStatus: invoices.reduce((acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    }, {}),
  };

  return successResponse(res, { data: { summary, invoices } });
});

// ── EXPENSE REPORT ───────────────────────────────────────────────────────────
exports.expenseReport = asyncHandler(async (req, res) => {
  const dateFilter = getDateRange(req.query, 'date');

  const entries = await prisma.finance.findMany({
    where: { businessId: req.businessId, type: 'EXPENSE', ...dateFilter },
    orderBy: { date: 'asc' },
  });

  const byCategory = entries.reduce((acc, e) => {
    if (!acc[e.category]) acc[e.category] = { total: 0, count: 0 };
    acc[e.category].total += e.amount;
    acc[e.category].count += 1;
    return acc;
  }, {});

  const summary = {
    totalExpense:  entries.reduce((s, e) => s + e.amount, 0),
    entryCount:    entries.length,
    byCategory,
  };

  return successResponse(res, { data: { summary, entries } });
});

// ── EMPLOYEE REPORT ──────────────────────────────────────────────────────────
exports.employeeReport = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const [employees, salaries, leaves] = await prisma.$transaction([
    prisma.employee.count({ where: { businessId: req.businessId, isActive: true } }),
    prisma.salary.findMany({
      where: {
        employee: { businessId: req.businessId },
        ...(month && { month: parseInt(month) }),
        ...(year  && { year:  parseInt(year) }),
      },
      include: { employee: { select: { name: true, department: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employee: { businessId: req.businessId },
        status:  'APPROVED',
        ...(year && { startDate: { gte: new Date(`${year}-01-01`) } }),
      },
      include: { employee: { select: { name: true, department: true } } },
    }),
  ]);

  const payrollSummary = {
    totalNetSalary:  salaries.reduce((s, sl) => s + sl.netSalary, 0),
    totalPaid:       salaries.filter((sl) => sl.status === 'PAID').reduce((s, sl) => s + sl.netSalary, 0),
    totalPending:    salaries.filter((sl) => sl.status !== 'PAID').reduce((s, sl) => s + sl.netSalary, 0),
  };

  return successResponse(res, { data: { totalEmployees: employees, salaries, leaves, payrollSummary } });
});

// ── INVENTORY REPORT ─────────────────────────────────────────────────────────
exports.inventoryReport = asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({
    where:   { businessId: req.businessId, isActive: true, isService: false },
    orderBy: { currentStock: 'asc' },
  });

  const summary = {
    totalProducts:   products.length,
    totalStockValue: products.reduce((s, p) => s + p.currentStock * p.costPrice, 0),
    lowStockItems:   products.filter((p) => p.currentStock <= p.lowStockThreshold).length,
    outOfStockItems: products.filter((p) => p.currentStock === 0).length,
    byCategory: products.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { count: 0, value: 0 };
      acc[cat].count += 1;
      acc[cat].value += p.currentStock * p.costPrice;
      return acc;
    }, {}),
  };

  return successResponse(res, { data: { summary, products } });
});

// ── INVOICE STATEMENT EXPORT (PDF & Excel) ───────────────────────────────────
exports.exportInvoiceStatement = asyncHandler(async (req, res) => {
  const { clientId, format = 'excel' } = req.query;
  const dateFilter = getDateRange(req.query, 'date');

  const where = {
    businessId: req.businessId,
    status:     { notIn: ['DRAFT','CANCELLED'] },
    ...dateFilter,
    ...(clientId && { clientId }),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    include: { client: { select: { name: true, email: true, gstin: true } } },
    orderBy: { date: 'asc' },
  });

  if (format === 'excel') {
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice Statement');

    workbook.creator = 'MyBusiness';
    workbook.created = new Date();

    // Header row
    worksheet.columns = [
      { header: 'Invoice #',  key: 'invoiceNumber',width: 18 },
      { header: 'Date',       key: 'date',         width: 14 },
      { header: 'Due Date',   key: 'dueDate',       width: 14 },
      { header: 'Client',     key: 'client',        width: 24 },
      { header: 'Subtotal',   key: 'subtotal',      width: 14 },
      { header: 'Tax',        key: 'taxAmount',     width: 12 },
      { header: 'Total',      key: 'totalAmount',   width: 14 },
      { header: 'Paid',       key: 'paidAmount',    width: 14 },
      { header: 'Balance',    key: 'balanceAmount', width: 14 },
      { header: 'Status',     key: 'status',        width: 16 },
    ];

    // Style header
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    invoices.forEach((inv) => {
      worksheet.addRow({
        invoiceNumber: inv.invoiceNumber,
        date:          inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '',
        dueDate:       inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '',
        client:        inv.client.name,
        subtotal:      inv.subtotal,
        taxAmount:     inv.taxAmount,
        totalAmount:   inv.totalAmount,
        paidAmount:    inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        status:        inv.status,
      });
    });

    // Summary rows
    worksheet.addRow([]);
    const totals = worksheet.addRow({
      invoiceNumber: 'TOTAL',
      subtotal:      invoices.reduce((s, i) => s + i.subtotal, 0),
      taxAmount:     invoices.reduce((s, i) => s + i.taxAmount, 0),
      totalAmount:   invoices.reduce((s, i) => s + i.totalAmount, 0),
      paidAmount:    invoices.reduce((s, i) => s + i.paidAmount, 0),
      balanceAmount: invoices.reduce((s, i) => s + i.balanceAmount, 0),
    });
    totals.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice-statement.xlsx"');

    await workbook.xlsx.write(res);
    return res.end();
  }

  return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Unsupported format. Use: excel' });
});

// ── GST REPORT ───────────────────────────────────────────────────────────────
exports.gstReport = asyncHandler(async (req, res) => {
  const dateFilter = getDateRange(req.query, 'date');

  const invoices = await prisma.invoice.findMany({
    where: { businessId: req.businessId, status: { notIn: ['DRAFT','CANCELLED'] }, ...dateFilter },
    include: { items: true, client: { select: { name: true, gstin: true } } },
    orderBy: { date: 'asc' },
  });

  const taxSummary = invoices.reduce((acc, inv) => {
    inv.items.forEach((item) => {
      const rate = item.taxRate;
      if (!acc[rate]) acc[rate] = { rate, taxableAmount: 0, taxAmount: 0, count: 0 };
      acc[rate].taxableAmount += (item.amount - item.taxAmount);
      acc[rate].taxAmount     += item.taxAmount;
      acc[rate].count         += 1;
    });
    return acc;
  }, {});

  return successResponse(res, {
    data: {
      taxSummary:   Object.values(taxSummary),
      totalTaxable: invoices.reduce((s, i) => s + (i.subtotal), 0),
      totalTax:     invoices.reduce((s, i) => s + i.taxAmount, 0),
      invoiceCount: invoices.length,
      invoices,
    },
  });
});
