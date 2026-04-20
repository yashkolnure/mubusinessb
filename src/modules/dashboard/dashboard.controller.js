const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse } = require('../../utils/response.util');

exports.getDashboard = asyncHandler(async (req, res) => {
  const now          = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfYear  = new Date(now.getFullYear(), 0, 1);
  const bId          = req.businessId;

  const [
    // Revenue
    monthRevenue,
    yearRevenue,
    // Invoices
    invoiceCounts,
    overdueInvoices,
    // Clients
    totalClients,
    newClientsThisMonth,
    // Inventory
    lowStockCount,
    // Employees
    totalEmployees,
    todayAbsent,
    pendingLeaves,
    // Recent invoices
    recentInvoices,
    // Outstanding payables
    totalPayables,
    // Quotations
    pendingQuotations,
  ] = await prisma.$transaction([

    // Revenue this month (from paid invoices)
    prisma.invoice.aggregate({
      where: { businessId: bId, status: { in: ['PAID','PARTIALLY_PAID'] }, date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { paidAmount: true },
    }),

    // Revenue this year
    prisma.invoice.aggregate({
      where: { businessId: bId, status: { in: ['PAID','PARTIALLY_PAID'] }, date: { gte: startOfYear } },
      _sum: { paidAmount: true },
    }),

    // Invoice status breakdown
    prisma.invoice.groupBy({
      by:    ['status'],
      where: { businessId: bId, status: { notIn: ['DRAFT','CANCELLED'] } },
      _count:{ status: true },
      _sum:  { balanceAmount: true },
    }),

    // Overdue invoices
    prisma.invoice.aggregate({
      where: { businessId: bId, status: 'OVERDUE' },
      _sum:  { balanceAmount: true },
      _count: true,
    }),

    // Total active clients
    prisma.client.count({ where: { businessId: bId, isActive: true } }),

    // New clients this month
    prisma.client.count({ where: { businessId: bId, createdAt: { gte: startOfMonth } } }),

    // Low stock products
    prisma.$queryRaw`
      SELECT count(*) FROM products
      WHERE "businessId" = ${bId}
        AND "isActive" = true
        AND "isService" = false
        AND "currentStock" <= "lowStockThreshold"
    `,

    // Total active employees
    prisma.employee.count({ where: { businessId: bId, isActive: true } }),

    // Today's absentees
    prisma.attendance.count({
      where: {
        employee: { businessId: bId },
        date:     { equals: new Date(now.toDateString()) },
        status:   'ABSENT',
      },
    }),

    // Pending leave requests
    prisma.leaveRequest.count({
      where: { employee: { businessId: bId }, status: 'PENDING' },
    }),

    // Recent 5 invoices
    prisma.invoice.findMany({
      where:   { businessId: bId },
      orderBy: { createdAt: 'desc' },
      take:    5,
      select:  { id: true, invoiceNumber: true, totalAmount: true, balanceAmount: true, status: true, date: true, client: { select: { name: true } } },
    }),

    // Total vendor payables
    prisma.purchase.aggregate({
      where: { businessId: bId, status: { in: ['PENDING','PARTIALLY_PAID'] } },
      _sum:  { balanceAmount: true },
      _count: true,
    }),

    // Pending quotations
    prisma.quotation.count({ where: { businessId: bId, status: { in: ['SENT','VIEWED'] } } }),
  ]);

  const invoiceStatusMap = invoiceCounts.reduce((acc, row) => {
    acc[row.status] = { count: row._count.status, outstanding: row._sum.balanceAmount || 0 };
    return acc;
  }, {});

  return successResponse(res, {
    data: {
      revenue: {
        thisMonth: monthRevenue._sum.paidAmount || 0,
        thisYear:  yearRevenue._sum.paidAmount  || 0,
      },
      invoices: {
        byStatus:        invoiceStatusMap,
        overdueCount:    overdueInvoices._count,
        overdueAmount:   overdueInvoices._sum.balanceAmount || 0,
      },
      clients: {
        total:     totalClients,
        newThisMonth: newClientsThisMonth,
      },
      inventory: {
        lowStockCount: parseInt(lowStockCount[0]?.count || 0),
      },
      workforce: {
        totalEmployees,
        todayAbsent,
        pendingLeaves,
      },
      payables: {
        totalAmount: totalPayables._sum.balanceAmount || 0,
        count:       totalPayables._count,
      },
      quotations: {
        pendingApproval: pendingQuotations,
      },
      recentInvoices,
    },
  });
});
