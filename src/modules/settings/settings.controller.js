const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, HTTP } = require('../../utils/response.util');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { env } = require('../../config/env');

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), env.UPLOAD_DIR, 'logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${req.businessId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits:    { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only JPEG, PNG and WebP images are allowed.'));
    cb(null, true);
  },
});

exports.uploadMiddleware = upload.single('logo');

// ── GET BUSINESS PROFILE ──────────────────────────────────────────────────────
exports.getBusinessProfile = asyncHandler(async (req, res) => {
  const business = await prisma.business.findUnique({
    where:  { id: req.businessId },
    select: {
      id:true, name:true, email:true, phone:true,
      address:true, city:true, state:true, country:true, pincode:true,
      gstin:true, pan:true, logo:true, website:true,
      currency:true, currencySymbol:true, dateFormat:true,
      fiscalYearStart:true, timezone:true,
      invoicePrefix:true, quotationPrefix:true, purchasePrefix:true,
      nextInvoiceNo:true, nextQuotationNo:true, nextPurchaseNo:true,
      // SMTP — never return password
      smtpHost:true, smtpPort:true, smtpSecure:true, smtpUser:true,
      smtpFromName:true, smtpFromEmail:true,
      // smtpPass is excluded intentionally
    },
  });
  return successResponse(res, { data: business });
});

// ── UPDATE BUSINESS PROFILE ───────────────────────────────────────────────────
exports.updateBusinessProfile = asyncHandler(async (req, res) => {
  const allowed = ['name','email','phone','address','city','state','country','pincode',
    'gstin','pan','website','currency','currencySymbol','dateFormat','fiscalYearStart',
    'timezone','invoicePrefix','quotationPrefix','purchasePrefix'];
  const data = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k] || null; });

  const business = await prisma.business.update({ where: { id: req.businessId }, data });
  await req.audit({ module:'settings', action:'UPDATE_BUSINESS_PROFILE' });
  return successResponse(res, { message:'Business profile updated.', data: business });
});

// ── UPLOAD LOGO ───────────────────────────────────────────────────────────────
exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) return errorResponse(res, { status:HTTP.BAD_REQUEST, message:'No file uploaded.' });
  const logoUrl = `/uploads/logos/${req.file.filename}`;
  const current = await prisma.business.findUnique({ where: { id: req.businessId }, select: { logo:true } });
  if (current?.logo) {
    const oldPath = path.join(process.cwd(), current.logo.replace('/uploads','uploads'));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await prisma.business.update({ where: { id: req.businessId }, data: { logo: logoUrl } });
  return successResponse(res, { message:'Logo uploaded.', data: { logoUrl } });
});

// ── SMTP CONFIGURATION ────────────────────────────────────────────────────────
exports.getSMTPConfig = asyncHandler(async (req, res) => {
  const b = await prisma.business.findUnique({
    where:  { id: req.businessId },
    select: { smtpHost:true, smtpPort:true, smtpSecure:true, smtpUser:true, smtpFromName:true, smtpFromEmail:true },
  });
  return successResponse(res, { data: { ...b, smtpPass: b?.smtpHost ? '••••••••' : '' } });
});

exports.updateSMTPConfig = asyncHandler(async (req, res) => {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFromName, smtpFromEmail } = req.body;
  const data = {
    smtpHost:      smtpHost || null,
    smtpPort:      smtpPort ? parseInt(smtpPort, 10) : null,
    smtpSecure:    smtpSecure === true || smtpSecure === 'true',
    smtpUser:      smtpUser || null,
    smtpFromName:  smtpFromName || null,
    smtpFromEmail: smtpFromEmail || null,
  };
  // Only update password if provided (not masked)
  if (smtpPass && smtpPass !== '••••••••') data.smtpPass = smtpPass;

  await prisma.business.update({ where: { id: req.businessId }, data });
  await req.audit({ module:'settings', action:'UPDATE_SMTP' });
  return successResponse(res, { message:'SMTP configuration saved.' });
});

exports.testSMTP = asyncHandler(async (req, res) => {
  const { testEmail } = req.body;
  if (!testEmail) return errorResponse(res, { status:HTTP.BAD_REQUEST, message:'Test email address required.' });

  const b = await prisma.business.findUnique({
    where:  { id: req.businessId },
    select: { smtpHost:true, smtpPort:true, smtpSecure:true, smtpUser:true, smtpPass:true, smtpFromName:true, smtpFromEmail:true, name:true },
  });

  if (!b?.smtpHost) return errorResponse(res, { status:HTTP.BAD_REQUEST, message:'SMTP not configured.' });

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: b.smtpHost, port: b.smtpPort || 587, secure: b.smtpSecure || false,
    auth: { user: b.smtpUser, pass: b.smtpPass },
  });

  try {
    await transporter.sendMail({
      from:    `"${b.smtpFromName || b.name}" <${b.smtpFromEmail || b.smtpUser}>`,
      to:      testEmail,
      subject: `SMTP Test — ${b.name}`,
      text:    `Your SMTP configuration is working correctly for ${b.name}.`,
    });
    return successResponse(res, { message:`Test email sent to ${testEmail}.` });
  } catch (err) {
    return errorResponse(res, { status:HTTP.BAD_REQUEST, message:`SMTP test failed: ${err.message}` });
  }
});

// ── TAX CONFIGURATIONS ────────────────────────────────────────────────────────
exports.listTaxConfigs = asyncHandler(async (req, res) => {
  const taxes = await prisma.taxConfig.findMany({ where: { businessId:req.businessId, isActive:true }, orderBy: { rate:'asc' } });
  return successResponse(res, { data: taxes });
});

exports.createTaxConfig = asyncHandler(async (req, res) => {
  const { name, rate, type, description, isDefault } = req.body;
  if (isDefault) await prisma.taxConfig.updateMany({ where: { businessId:req.businessId, type }, data: { isDefault:false } });
  const tax = await prisma.taxConfig.create({ data: { businessId:req.businessId, name, rate:parseFloat(rate)||0, type, description:description||null, isDefault:isDefault||false } });
  return successResponse(res, { status:HTTP.CREATED, message:'Tax config created.', data:tax });
});

exports.updateTaxConfig = asyncHandler(async (req, res) => {
  const existing = await prisma.taxConfig.findFirst({ where: { id:req.params.id, businessId:req.businessId } });
  if (!existing) return errorResponse(res, { status:HTTP.NOT_FOUND, message:'Tax config not found.' });
  if (req.body.isDefault) await prisma.taxConfig.updateMany({ where: { businessId:req.businessId, type:existing.type }, data: { isDefault:false } });
  const tax = await prisma.taxConfig.update({ where: { id:req.params.id }, data: { ...req.body, rate: req.body.rate ? parseFloat(req.body.rate) : undefined } });
  return successResponse(res, { message:'Updated.', data:tax });
});

exports.deleteTaxConfig = asyncHandler(async (req, res) => {
  const existing = await prisma.taxConfig.findFirst({ where: { id:req.params.id, businessId:req.businessId } });
  if (!existing) return errorResponse(res, { status:HTTP.NOT_FOUND, message:'Tax config not found.' });
  await prisma.taxConfig.update({ where: { id:req.params.id }, data: { isActive:false } });
  return successResponse(res, { message:'Deleted.' });
});

exports.resetNumbering = asyncHandler(async (req, res) => {
  const { type, startFrom } = req.body;
  const fieldMap = { invoice:'nextInvoiceNo', quotation:'nextQuotationNo', purchase:'nextPurchaseNo' };
  if (!fieldMap[type]) return errorResponse(res, { status:HTTP.BAD_REQUEST, message:'Invalid type.' });
  await prisma.business.update({ where: { id:req.businessId }, data: { [fieldMap[type]]: parseInt(startFrom,10)||1 } });
  await req.audit({ module:'settings', action:'RESET_NUMBERING', description:`Reset ${type} numbering to ${startFrom}` });
  return successResponse(res, { message:`${type} numbering reset to ${startFrom}.` });
});
