const nodemailer = require('nodemailer');
const { env }    = require('../config/env');
const logger     = require('../config/logger');

// ============================================================
// TRANSPORTER — resolves SMTP config in priority order:
//   1. Business-specific SMTP (stored in DB per business)
//   2. Global .env fallback
// ============================================================

/**
 * Build a transporter using a business's saved SMTP config.
 * Returns null if neither business nor .env has valid credentials.
 */
const createTransporterForBusiness = async (businessId) => {
  // Lazy-require prisma to avoid circular deps
  const { prisma } = require('../config/database');

  let smtpConfig = null;

  if (businessId) {
    const biz = await prisma.business.findUnique({
      where:  { id: businessId },
      select: { smtpHost:true, smtpPort:true, smtpSecure:true, smtpUser:true, smtpPass:true, smtpFromName:true, smtpFromEmail:true, name:true },
    });

    if (biz?.smtpHost && biz?.smtpUser && biz?.smtpPass) {
      smtpConfig = {
        host:     biz.smtpHost,
        port:     biz.smtpPort  || 587,
        secure:   biz.smtpSecure || false,
        user:     biz.smtpUser,
        pass:     biz.smtpPass,
        fromName: biz.smtpFromName  || biz.name || 'MyBusiness',
        from:     biz.smtpFromEmail || biz.smtpUser,
      };
    }
  }

  // Fall back to .env global config
  if (!smtpConfig) {
    if (!env.EMAIL_USER || !env.EMAIL_PASS) {
      return null; // No credentials at all — log and skip
    }
    smtpConfig = {
      host:     env.EMAIL_HOST,
      port:     env.EMAIL_PORT,
      secure:   env.EMAIL_SECURE,
      user:     env.EMAIL_USER,
      pass:     env.EMAIL_PASS,
      fromName: env.EMAIL_FROM_NAME,
      from:     env.EMAIL_FROM_ADDRESS || env.EMAIL_USER,
    };
  }

  const transporter = nodemailer.createTransport({
    host:   smtpConfig.host,
    port:   smtpConfig.port,
    secure: smtpConfig.secure,
    auth:   { user: smtpConfig.user, pass: smtpConfig.pass },
    tls:    { rejectUnauthorized: false }, // allow self-signed certs in dev
  });

  return { transporter, fromName: smtpConfig.fromName, from: smtpConfig.from };
};

/**
 * Core send function.
 * @param {string|null} businessId - pass to use business SMTP
 * @param {object} opts - { to, subject, html, attachments }
 */
const sendEmail = async ({ to, subject, html, attachments = [], businessId = null }) => {
  try {
    const config = await createTransporterForBusiness(businessId);

    if (!config) {
      logger.warn(`Email skipped (no SMTP configured) — would have sent to ${to}: ${subject}`);
      return { success: false, reason: 'no_smtp_config' };
    }

    const { transporter, fromName, from } = config;
    const info = await transporter.sendMail({
      from:        `"${fromName}" <${from}>`,
      to,
      subject,
      html,
      attachments,
    });

    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ============================================================
// BASE HTML TEMPLATE
// ============================================================
const baseTemplate = (content, accentColor = '#4F46E5') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#f4f4f4; margin:0; padding:0; color:#333; }
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
    .header { background:${accentColor}; color:#fff; padding:28px 36px; }
    .header h1 { margin:0; font-size:22px; font-weight:700; letter-spacing:-0.3px; }
    .header p  { margin:6px 0 0; font-size:13px; opacity:0.85; }
    .body { padding:32px 36px; line-height:1.6; font-size:14px; }
    .body p { margin:0 0 12px; }
    .footer { background:#f8f8f8; padding:18px 36px; text-align:center; font-size:12px; color:#aaa; border-top:1px solid #eee; }
    .btn { display:inline-block; padding:12px 28px; background:${accentColor}; color:#fff; border-radius:6px; text-decoration:none; font-weight:700; font-size:14px; margin:16px 0; }
    .info-box { background:#f0f0ff; border-left:4px solid ${accentColor}; padding:16px 20px; margin:16px 0; border-radius:0 6px 6px 0; font-size:13px; }
    .info-box p { margin:4px 0; }
    .info-box strong { color:#333; }
    .amount { font-size:28px; font-weight:800; color:${accentColor}; }
    table.items { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
    table.items th { background:#f5f5f5; padding:8px 12px; text-align:left; font-weight:700; color:#555; border-bottom:2px solid #eee; }
    table.items td { padding:10px 12px; border-bottom:1px solid #f0f0f0; }
    table.items tr:last-child td { border-bottom:none; }
    .total-row { background:#f9f0ff; font-weight:700; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      &copy; ${new Date().getFullYear()} MyBusiness Platform &nbsp;|&nbsp; Sent via MyBusiness
    </div>
  </div>
</body>
</html>`;

// ============================================================
// EMAIL TEMPLATES
// ============================================================
const emails = {

  async welcomeUser({ name, email, tempPassword, businessName, loginUrl, businessId }) {
    const html = baseTemplate(`
      <div class="header"><h1>Welcome to ${businessName}!</h1><p>Your account has been created.</p></div>
      <div class="body">
        <p>Hi <strong>${name}</strong>, you've been added as a team member on <strong>${businessName}</strong>.</p>
        <div class="info-box">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> <code style="background:#eee;padding:2px 6px;border-radius:3px;">${tempPassword}</code></p>
        </div>
        <p>Please <strong>change your password</strong> after your first login.</p>
        <a href="${loginUrl}" class="btn">Login to MyBusiness</a>
      </div>`);
    return sendEmail({ to: email, subject: `Welcome to ${businessName} — Your account is ready`, html, businessId });
  },

  async passwordReset({ name, email, resetUrl, businessId }) {
    const html = baseTemplate(`
      <div class="header"><h1>Password Reset Request</h1></div>
      <div class="body">
        <p>Hi <strong>${name}</strong>,</p>
        <p>We received a request to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" class="btn">Reset My Password</a>
        <p style="color:#999;font-size:12px;margin-top:20px;">If you didn't request this, you can safely ignore this email.</p>
      </div>`, '#1e293b');
    return sendEmail({ to: email, subject: 'Password Reset Request — MyBusiness', html, businessId });
  },

  async invoiceSent({ clientName, clientEmail, invoiceNumber, amount, dueDate, businessName, businessId, pdfBuffer, pdfFilename }) {
    const html = baseTemplate(`
      <div class="header">
        <h1>Invoice from ${businessName}</h1>
        <p>Invoice ${invoiceNumber}</p>
      </div>
      <div class="body">
        <p>Dear <strong>${clientName}</strong>,</p>
        <p>Please find your invoice attached to this email as a PDF.</p>
        <div class="info-box">
          <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
          <p><strong>Amount Due:</strong> <span class="amount">${amount}</span></p>
          <p><strong>Due Date:</strong> ${dueDate}</p>
        </div>
        <p style="font-size:13px;color:#666;">
          The invoice PDF is attached to this email. Please review and arrange payment by the due date.
          For any queries, please reply to this email.
        </p>
        <table style="width:100%;border-top:2px solid #eee;margin-top:20px;padding-top:16px;">
          <tr>
            <td style="font-size:12px;color:#999;">
              📎 <strong>${pdfFilename || invoiceNumber + '.pdf'}</strong> is attached to this email.
            </td>
          </tr>
        </table>
      </div>`);

    const attachments = pdfBuffer ? [{
      filename:    pdfFilename || `${invoiceNumber}.pdf`,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    }] : [];

    return sendEmail({ to: clientEmail, subject: `Invoice ${invoiceNumber} from ${businessName} — ${amount} due`, html, attachments, businessId });
  },

  async invoiceOverdueReminder({ clientName, clientEmail, invoiceNumber, amount, daysOverdue, invoiceUrl, businessId }) {
    const html = baseTemplate(`
      <div class="header" style="background:#dc2626;">
        <h1>Payment Overdue</h1>
        <p>Invoice ${invoiceNumber} is ${daysOverdue} day(s) past due</p>
      </div>
      <div class="body">
        <p>Dear <strong>${clientName}</strong>,</p>
        <p>This is a reminder that the following invoice is overdue:</p>
        <div class="info-box" style="border-color:#dc2626;background:#fff5f5;">
          <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
          <p><strong>Outstanding Amount:</strong> <span class="amount" style="color:#dc2626;">${amount}</span></p>
          <p><strong>Days Overdue:</strong> ${daysOverdue}</p>
        </div>
        <a href="${invoiceUrl}" class="btn" style="background:#dc2626;">Pay Now</a>
        <p style="font-size:13px;color:#666;">Please arrange payment at your earliest convenience to avoid further follow-up.</p>
      </div>`, '#dc2626');
    return sendEmail({ to: clientEmail, subject: `OVERDUE: Invoice ${invoiceNumber} — Payment Required`, html, businessId });
  },

  async quotationSent({ clientName, clientEmail, quotationNumber, validUntil, businessName, currencySymbol = '₹', totalAmount, items = [], businessId }) {
    // Build items table rows
    const itemRows = items.map((it, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${i+1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${it.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${it.quantity} ${it.unit||''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${currencySymbol}${Number(it.unitPrice).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;">${currencySymbol}${Number(it.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      </tr>`).join('');

    const html = baseTemplate(`
      <div class="header">
        <h1>Quotation from ${businessName}</h1>
        <p>Quotation ${quotationNumber}</p>
      </div>
      <div class="body">
        <p>Dear <strong>${clientName}</strong>,</p>
        <p>Please find our quotation for your reference. This quotation is valid until <strong>${validUntil}</strong>.</p>
        <div class="info-box">
          <p><strong>Quotation #:</strong> ${quotationNumber}</p>
          <p><strong>Valid Until:</strong> ${validUntil}</p>
          <p><strong>Total Amount:</strong> <span class="amount">${currencySymbol}${Number(totalAmount).toLocaleString('en-IN', {minimumFractionDigits:2})}</span></p>
        </div>
        ${items.length > 0 ? `
        <h3 style="margin:20px 0 8px;font-size:14px;color:#444;">Items / Services</h3>
        <table class="items">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th style="text-align:right;">Qty</th>
              <th style="text-align:right;">Unit Price</th><th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" style="padding:10px 12px;text-align:right;font-weight:700;">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:16px;">${currencySymbol}${Number(totalAmount).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            </tr>
          </tfoot>
        </table>` : ''}
        <p style="font-size:13px;color:#666;margin-top:20px;">
          To accept this quotation or for any questions, please reply to this email.
        </p>
      </div>`);

    return sendEmail({ to: clientEmail, subject: `Quotation ${quotationNumber} from ${businessName} — ${currencySymbol}${Number(totalAmount).toLocaleString('en-IN', {minimumFractionDigits:2})}`, html, businessId });
  },

  async lowStockAlert({ adminEmail, products, businessId }) {
    const rows = products.map(p =>
      `<tr><td>${p.name}</td><td style="font-family:monospace;">${p.sku || '—'}</td><td style="color:#dc2626;font-weight:700;">${p.currentStock}</td><td>${p.lowStockThreshold}</td></tr>`
    ).join('');
    const html = baseTemplate(`
      <div class="header" style="background:#d97706;"><h1>⚠ Low Stock Alert</h1><p>${products.length} product(s) need attention</p></div>
      <div class="body">
        <p>The following products are at or below their minimum stock threshold:</p>
        <table class="items">
          <thead><tr><th>Product</th><th>SKU</th><th>Current Stock</th><th>Min Threshold</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:13px;color:#666;">Please reorder these items to avoid stockouts.</p>
      </div>`, '#d97706');
    return sendEmail({ to: adminEmail, subject: `Low Stock Alert — ${products.length} item(s) need reordering`, html, businessId });
  },

  async leaveRequestNotification({ managerEmail, employeeName, leaveType, startDate, endDate, totalDays, businessId }) {
    const html = baseTemplate(`
      <div class="header"><h1>Leave Request — Action Required</h1></div>
      <div class="body">
        <p>A new leave request requires your approval:</p>
        <div class="info-box">
          <p><strong>Employee:</strong> ${employeeName}</p>
          <p><strong>Leave Type:</strong> ${leaveType.replace(/_/g,' ')}</p>
          <p><strong>From:</strong> ${startDate}</p>
          <p><strong>To:</strong> ${endDate}</p>
          <p><strong>Total Days:</strong> ${totalDays}</p>
        </div>
        <p style="font-size:13px;color:#666;">Please log in to approve or reject this request.</p>
      </div>`);
    return sendEmail({ to: managerEmail, subject: `Leave Request from ${employeeName} — Action Required`, html, businessId });
  },

  async paymentReceived({ adminEmail, clientName, invoiceNumber, amount, paymentMethod, businessId }) {
    const html = baseTemplate(`
      <div class="header" style="background:#16a34a;"><h1>✅ Payment Received</h1></div>
      <div class="body">
        <div class="info-box" style="border-color:#16a34a;background:#f0fff4;">
          <p><strong>Client:</strong> ${clientName}</p>
          <p><strong>Invoice:</strong> ${invoiceNumber}</p>
          <p><strong>Amount:</strong> <span class="amount" style="color:#16a34a;">${amount}</span></p>
          <p><strong>Method:</strong> ${paymentMethod.replace(/_/g,' ')}</p>
        </div>
      </div>`, '#16a34a');
    return sendEmail({ to: adminEmail, subject: `Payment Received — ${invoiceNumber} (${amount})`, html, businessId });
  },
};

module.exports = { sendEmail, emails };
