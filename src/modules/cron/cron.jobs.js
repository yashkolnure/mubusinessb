const cron   = require('node-cron');
const { prisma }  = require('../../config/database');
const { emails }  = require('../../utils/email.util');
const { createBulkNotifications } = require('../../modules/notifications/notifications.controller');
const logger = require('../../config/logger');

// ══════════════════════════════════════════════════════════════
// MARK OVERDUE INVOICES — runs every day at 00:05 AM
// ══════════════════════════════════════════════════════════════
const markOverdueInvoices = cron.schedule('5 0 * * *', async () => {
  logger.info('[CRON] Marking overdue invoices...');
  try {
    const result = await prisma.invoice.updateMany({
      where: {
        status:        { in: ['SENT', 'PARTIALLY_PAID', 'VIEWED'] },
        dueDate:       { lt: new Date() },
        balanceAmount: { gt: 0 },
      },
      data: { status: 'OVERDUE' },
    });
    logger.info(`[CRON] Marked ${result.count} invoice(s) as OVERDUE`);
  } catch (err) {
    logger.error('[CRON] markOverdueInvoices failed:', err.message);
  }
}, { scheduled: false });

// ══════════════════════════════════════════════════════════════
// PAYMENT REMINDER EMAILS — runs every day at 09:00 AM
// Sends reminders for invoices due in 3 days & overdue ones
// ══════════════════════════════════════════════════════════════
const sendPaymentReminders = cron.schedule('0 9 * * *', async () => {
  logger.info('[CRON] Sending payment reminders...');
  try {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Upcoming due (in 3 days)
    const upcomingInvoices = await prisma.invoice.findMany({
      where: {
        status:        { in: ['SENT', 'PARTIALLY_PAID', 'VIEWED'] },
        dueDate:       { lte: threeDaysFromNow, gte: new Date() },
        balanceAmount: { gt: 0 },
      },
      include: { client: { select: { name: true, email: true } }, business: { select: { name: true, currencySymbol: true } } },
    });

    // Overdue
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status:        'OVERDUE',
        balanceAmount: { gt: 0 },
        client:        { email: { not: null } },
      },
      include: { client: { select: { name: true, email: true } }, business: { select: { name: true, currencySymbol: true } } },
    });

    let remindersSent = 0;

    for (const inv of [...upcomingInvoices, ...overdueInvoices]) {
      if (!inv.client.email) continue;

      const daysOverdue = inv.status === 'OVERDUE'
        ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
        : 0;

      await emails.invoiceOverdueReminder({
        clientName:    inv.client.name,
        clientEmail:   inv.client.email,
        invoiceNumber: inv.invoiceNumber,
        amount:        `${inv.business.currencySymbol}${inv.balanceAmount.toFixed(2)}`,
        daysOverdue,
        invoiceUrl:    `${process.env.FRONTEND_URL}/invoices/${inv.id}/view`,
        businessId:    inv.businessId,
      });
      remindersSent++;
    }

    logger.info(`[CRON] Sent ${remindersSent} payment reminder(s)`);
  } catch (err) {
    logger.error('[CRON] sendPaymentReminders failed:', err.message);
  }
}, { scheduled: false });

// ══════════════════════════════════════════════════════════════
// LOW STOCK ALERTS — runs every day at 08:00 AM
// ══════════════════════════════════════════════════════════════
const checkLowStock = cron.schedule('0 8 * * *', async () => {
  logger.info('[CRON] Checking low stock levels...');
  try {
    const businesses = await prisma.business.findMany({
      where:  { isActive: true },
      select: { id: true, name: true },
    });

    for (const biz of businesses) {
      const lowStockProducts = await prisma.$queryRaw`
        SELECT * FROM products
        WHERE "businessId" = ${biz.id}
          AND "isActive" = true
          AND "isService" = false
          AND "currentStock" <= "lowStockThreshold"
      `;

      if (!lowStockProducts.length) continue;

      // In-app notifications for admins/managers
      await createBulkNotifications({
        businessId: biz.id,
        roles:      ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
        type:       'LOW_STOCK',
        title:      `⚠ Low Stock Alert`,
        message:    `${lowStockProducts.length} product(s) are below minimum stock levels.`,
        data:       { products: lowStockProducts.map((p) => ({ id: p.id, name: p.name, currentStock: p.currentStock })) },
        link:       '/inventory?filter=low-stock',
      });

      // Email alert to admin
      const admins = await prisma.user.findMany({
        where:  { businessId: biz.id, role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
        select: { email: true },
      });

      for (const admin of admins) {
        await emails.lowStockAlert({
          adminEmail: admin.email,
          businessId: biz.id,
          products:   lowStockProducts.map((p) => ({
            name:              p.name,
            sku:               p.sku,
            currentStock:      p.currentStock,
            lowStockThreshold: p.lowStockThreshold,
          })),
        });
      }
    }

    logger.info('[CRON] Low stock check completed');
  } catch (err) {
    logger.error('[CRON] checkLowStock failed:', err.message);
  }
}, { scheduled: false });

// ══════════════════════════════════════════════════════════════
// RECURRING INVOICE GENERATOR — runs every day at 01:00 AM
// ══════════════════════════════════════════════════════════════
const generateRecurringInvoices = cron.schedule('0 1 * * *', async () => {
  logger.info('[CRON] Processing recurring invoices...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const recurringInvoices = await prisma.invoice.findMany({
      where: {
        isRecurring:    true,
        nextInvoiceDate:{ lte: today },
        status:         { notIn: ['CANCELLED'] },
        OR: [
          { recurringEndDate: null },
          { recurringEndDate: { gte: today } },
        ],
      },
      include: { items: true },
    });

    let generated = 0;

    for (const inv of recurringInvoices) {
      // Generate invoice number
      const business = await prisma.business.findUnique({ where: { id: inv.businessId } });
      const invNo    = `${business.invoicePrefix}-${new Date().getFullYear()}-${String(business.nextInvoiceNo).padStart(4,'0')}`;

      await prisma.$transaction([
        // Create new invoice copy
        prisma.invoice.create({
          data: {
            businessId:     inv.businessId,
            clientId:       inv.clientId,
            parentInvoiceId:inv.id,
            invoiceNumber:  invNo,
            date:           today,
            dueDate:        inv.dueDate ? calculateNextDate(today, inv.recurringCycle) : null,
            status:         'DRAFT',
            subtotal:       inv.subtotal,
            discountType:   inv.discountType,
            discountValue:  inv.discountValue,
            discountAmount: inv.discountAmount,
            taxAmount:      inv.taxAmount,
            totalAmount:    inv.totalAmount,
            balanceAmount:  inv.totalAmount,
            notes:          inv.notes,
            terms:          inv.terms,
            isRecurring:    false, // copies are not recurring themselves
            items: {
              create: inv.items.map(({ id: _id, invoiceId: _inv, ...item }) => item),
            },
          },
        }),
        // Increment business invoice counter
        prisma.business.update({ where: { id: inv.businessId }, data: { nextInvoiceNo: { increment: 1 } } }),
        // Update next invoice date
        prisma.invoice.update({
          where: { id: inv.id },
          data:  { nextInvoiceDate: calculateNextDate(today, inv.recurringCycle) },
        }),
      ]);

      generated++;
    }

    logger.info(`[CRON] Generated ${generated} recurring invoice(s)`);
  } catch (err) {
    logger.error('[CRON] generateRecurringInvoices failed:', err.message);
  }
}, { scheduled: false });

// ── HELPER: next date based on cycle ─────────────────────────────────────────
const calculateNextDate = (fromDate, cycle) => {
  const d = new Date(fromDate);
  switch (cycle) {
    case 'WEEKLY':    d.setDate(d.getDate() + 7);      break;
    case 'MONTHLY':   d.setMonth(d.getMonth() + 1);    break;
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3);    break;
    case 'YEARLY':    d.setFullYear(d.getFullYear()+1);break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return d;
};

// ══════════════════════════════════════════════════════════════
// EXPIRE QUOTATIONS — runs every day at 00:15 AM
// ══════════════════════════════════════════════════════════════
const expireQuotations = cron.schedule('15 0 * * *', async () => {
  try {
    const result = await prisma.quotation.updateMany({
      where: {
        status:     { in: ['DRAFT', 'SENT', 'VIEWED'] },
        validUntil: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    logger.info(`[CRON] Expired ${result.count} quotation(s)`);
  } catch (err) {
    logger.error('[CRON] expireQuotations failed:', err.message);
  }
}, { scheduled: false });

// ── START ALL CRON JOBS ───────────────────────────────────────────────────────
const startCronJobs = () => {
  markOverdueInvoices.start();
  sendPaymentReminders.start();
  checkLowStock.start();
  generateRecurringInvoices.start();
  expireQuotations.start();
  logger.info('✅ All cron jobs started');
};

const stopCronJobs = () => {
  markOverdueInvoices.stop();
  sendPaymentReminders.stop();
  checkLowStock.stop();
  generateRecurringInvoices.stop();
  expireQuotations.stop();
  logger.info('🔌 All cron jobs stopped');
};

module.exports = { startCronJobs, stopCronJobs };
