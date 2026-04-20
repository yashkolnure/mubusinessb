const { prisma }   = require('../../config/database');
const { toFloat }  = require('../../utils/document.util');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder } = require('../../utils/pagination.util');

// ── PRODUCTS ─────────────────────────────────────────────────────────────────

exports.listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search  = buildSearchFilter(req.query.search, ['name','sku','barcode','category']);
  const orderBy = getSortOrder(req.query, ['name','currentStock','sellingPrice','createdAt']);

  const where = {
    businessId: req.businessId,
    isActive:   req.query.isActive !== 'false',
    ...search,
    ...(req.query.category  && { category:  req.query.category }),
    ...(req.query.isService !== undefined && { isService: req.query.isService === 'true' }),
    // Low stock filter
    ...(req.query.lowStock === 'true' && {
      currentStock: { lte: prisma.product.fields.lowStockThreshold },
    }),
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, skip, take: limit, orderBy }),
    prisma.product.count({ where }),
  ]);

  return paginatedResponse(res, { data: products, page, limit, total });
});

exports.getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await prisma.$queryRaw`
    SELECT * FROM products
    WHERE "businessId" = ${req.businessId}
      AND "isActive" = true
      AND "isService" = false
      AND "currentStock" <= "lowStockThreshold"
    ORDER BY "currentStock" ASC
  `;
  return successResponse(res, { data: products, meta: { count: products.length } });
});

exports.getProduct = asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({
    where:   { id: req.params.id, businessId: req.businessId },
    include: { stockLogs: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!product) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Product not found.' });
  return successResponse(res, { data: product });
});

exports.createProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  ['sellingPrice','costPrice','taxRate','currentStock','lowStockThreshold'].forEach(k => { if (body[k] !== undefined) body[k] = toFloat(body[k]); });
  if (body.isService === 'true') body.isService = true;
  if (body.isService === 'false') body.isService = false;
  const product = await prisma.product.create({
    data: { businessId: req.businessId, ...body },
  });

  // Opening stock log
  if (product.currentStock > 0) {
    await prisma.stockLog.create({
      data: {
        productId:    product.id,
        type:         'OPENING',
        quantity:     product.currentStock,
        balanceAfter: product.currentStock,
        notes:        'Opening stock',
        createdBy:    req.user.id,
      },
    });
  }

  await req.audit({ module: 'inventory', action: 'CREATE', entityType: 'Product', entityId: product.id });
  return successResponse(res, { status: HTTP.CREATED, message: 'Product created.', data: product });
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Product not found.' });

  const { currentStock: _cs, ...raw } = req.body;
  const updateData = { ...raw };
  ['sellingPrice','costPrice','taxRate','lowStockThreshold'].forEach(k => {
    if (updateData[k] !== undefined) updateData[k] = parseFloat(updateData[k]) || 0;
  });
  if (updateData.isService === 'true') updateData.isService = true;
  if (updateData.isService === 'false') updateData.isService = false;

  const product = await prisma.product.update({ where: { id: req.params.id }, data: updateData });
  return successResponse(res, { message: 'Product updated.', data: product });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Product not found.' });
  await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
  return successResponse(res, { message: 'Product deactivated.' });
});

// ── STOCK MANAGEMENT ─────────────────────────────────────────────────────────

exports.adjustStock = asyncHandler(async (req, res) => {
  const { type, quantity, notes, reference } = req.body;
  // type: IN | OUT | ADJUSTMENT | RETURN

  if (!['IN','OUT','ADJUSTMENT','RETURN'].includes(type)) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Invalid stock type.' });
  }

  const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!product) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Product not found.' });

  const qty = toFloat(quantity);
  const isDeduction = ['OUT'].includes(type);

  if (isDeduction && product.currentStock < qty) {
    return errorResponse(res, {
      status:  HTTP.BAD_REQUEST,
      message: `Insufficient stock. Available: ${product.currentStock}`,
    });
  }

  const newStock = parseFloat((
    type === 'ADJUSTMENT'
      ? qty
      : isDeduction
        ? product.currentStock - qty
        : product.currentStock + qty
  ).toFixed(3));

  await prisma.$transaction([
    prisma.product.update({ where: { id: req.params.id }, data: { currentStock: newStock } }),
    prisma.stockLog.create({
      data: {
        productId:    product.id,
        type,
        quantity:     type === 'ADJUSTMENT' ? qty - product.currentStock : qty,
        balanceAfter: newStock,
        notes, reference,
        createdBy:    req.user.id,
      },
    }),
  ]);

  return successResponse(res, { message: 'Stock adjusted.', data: { productId: product.id, previousStock: product.currentStock, newStock } });
});

exports.getStockLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!product) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Product not found.' });

  const [logs, total] = await prisma.$transaction([
    prisma.stockLog.findMany({
      where:   { productId: req.params.id },
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockLog.count({ where: { productId: req.params.id } }),
  ]);

  return paginatedResponse(res, { data: logs, page, limit, total });
});

exports.getInventorySummary = asyncHandler(async (req, res) => {
  const [totalProducts, lowStock, outOfStock, totalValue] = await prisma.$transaction([
    prisma.product.count({ where: { businessId: req.businessId, isActive: true, isService: false } }),
    prisma.$queryRaw`SELECT count(*) FROM products WHERE "businessId" = ${req.businessId} AND "isActive" = true AND "isService" = false AND "currentStock" <= "lowStockThreshold" AND "currentStock" > 0`,
    prisma.product.count({ where: { businessId: req.businessId, isActive: true, isService: false, currentStock: 0 } }),
    prisma.$queryRaw`SELECT COALESCE(SUM("currentStock" * "costPrice"), 0) as value FROM products WHERE "businessId" = ${req.businessId} AND "isActive" = true AND "isService" = false`,
  ]);

  return successResponse(res, {
    data: {
      totalProducts,
      lowStockCount:  parseInt(lowStock[0]?.count || 0),
      outOfStockCount:outOfStock,
      totalStockValue:parseFloat(totalValue[0]?.value || 0),
    },
  });
});
