require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Business ─────────────────────────────────────────────────
  const business = await prisma.business.upsert({
    where:  { id: 'seed-business-001' },
    update: {},
    create: {
      id:             'seed-business-001',
      name:           'Acme Technologies Pvt Ltd',
      email:          'admin@acmetech.in',
      phone:          '+91 98765 43210',
      address:        '42, MG Road, Koregaon Park',
      city:           'Pune',
      state:          'Maharashtra',
      country:        'India',
      pincode:        '411001',
      gstin:          '27AADCB2230M1ZT',
      pan:            'AADCB2230M',
      currency:       'INR',
      currencySymbol: '₹',
      invoicePrefix:  'INV',
      quotationPrefix:'QUO',
      purchasePrefix: 'PUR',
    },
  });

  // ── Super Admin ───────────────────────────────────────────────
  const password = await bcrypt.hash('Admin@1234', 12);

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@acmetech.in' },
    update: {},
    create: {
      businessId:    business.id,
      name:          'Admin User',
      email:         'admin@acmetech.in',
      password,
      role:          'SUPER_ADMIN',
      emailVerified: true,
      permissions: {
        create: [
          { module: 'auth',              actions: ['view','create','edit','delete','export'] },
          { module: 'users',             actions: ['view','create','edit','delete','export'] },
          { module: 'clients',           actions: ['view','create','edit','delete','export'] },
          { module: 'workforce',         actions: ['view','create','edit','delete','export','approve'] },
          { module: 'quotations',        actions: ['view','create','edit','delete','export'] },
          { module: 'invoicing',         actions: ['view','create','edit','delete','export'] },
          { module: 'invoice_statements',actions: ['view','export'] },
          { module: 'vendors',           actions: ['view','create','edit','delete','export'] },
          { module: 'purchases',         actions: ['view','create','edit','delete','export'] },
          { module: 'inventory',         actions: ['view','create','edit','delete','export'] },
          { module: 'finance',           actions: ['view','create','edit','delete','export'] },
          { module: 'reports',           actions: ['view','export'] },
          { module: 'settings',          actions: ['view','create','edit','delete','export'] },
          { module: 'notifications',     actions: ['view'] },
          { module: 'audit',             actions: ['view','export'] },
        ],
      },
    },
  });

  // ── Tax Configs ───────────────────────────────────────────────
  const taxes = [
    { name: 'GST 5%',   rate: 5,  type: 'GST', isDefault: false },
    { name: 'GST 12%',  rate: 12, type: 'GST', isDefault: false },
    { name: 'GST 18%',  rate: 18, type: 'GST', isDefault: true  },
    { name: 'GST 28%',  rate: 28, type: 'GST', isDefault: false },
    { name: 'No Tax',   rate: 0,  type: 'OTHER',isDefault: false },
  ];

  for (const tax of taxes) {
    await prisma.taxConfig.create({ data: { businessId: business.id, ...tax } }).catch(() => {});
  }

  // ── Sample Clients ────────────────────────────────────────────
  const clients = [
    { name: 'TechSoft Solutions',    email: 'accounts@techsoft.in',   phone: '9876543001', company: 'TechSoft Solutions Pvt Ltd', gstin: '27AABCT1332L1ZQ', billingCity: 'Mumbai',   billingState: 'Maharashtra' },
    { name: 'BuildRight Constructions', email: 'billing@buildright.in', phone: '9876543002', company: 'BuildRight Constructions',   billingCity: 'Pune',     billingState: 'Maharashtra' },
    { name: 'Global Exports Ltd',    email: 'finance@globalexp.com',  phone: '9876543003', company: 'Global Exports Ltd',         billingCity: 'Ahmedabad',billingState: 'Gujarat' },
  ];

  for (const client of clients) {
    await prisma.client.create({ data: { businessId: business.id, ...client } }).catch(() => {});
  }

  // ── Sample Employees ──────────────────────────────────────────
  const employees = [
    { name: 'Rajesh Kumar',   email: 'rajesh@acmetech.in',  department: 'Engineering',  designation: 'Senior Developer', baseSalary: 75000 },
    { name: 'Priya Sharma',   email: 'priya@acmetech.in',   department: 'Sales',        designation: 'Sales Manager',    baseSalary: 60000 },
    { name: 'Amit Verma',     email: 'amit@acmetech.in',    department: 'Accounts',     designation: 'Accountant',       baseSalary: 45000 },
  ];

  for (const emp of employees) {
    await prisma.employee.create({
      data: { businessId: business.id, dateOfJoining: new Date('2023-01-15'), ...emp },
    }).catch(() => {});
  }

  // ── Sample Products ───────────────────────────────────────────
  const products = [
    { name: 'Web Development Service', sellingPrice: 50000, costPrice: 20000, taxRate: 18, isService: true,  category: 'Services', hsnCode: '998314' },
    { name: 'Laptop Stand',            sellingPrice: 1499,  costPrice: 800,   taxRate: 18, isService: false, category: 'Hardware', sku: 'HW-001', currentStock: 50, lowStockThreshold: 10 },
    { name: 'USB-C Cable 2m',          sellingPrice: 599,   costPrice: 200,   taxRate: 18, isService: false, category: 'Hardware', sku: 'HW-002', currentStock: 5,  lowStockThreshold: 10 },
  ];

  for (const product of products) {
    await prisma.product.create({ data: { businessId: business.id, ...product } }).catch(() => {});
  }

  console.log('');
  console.log('✅ Seed complete!');
  console.log('─────────────────────────────────');
  console.log(`Business: ${business.name}`);
  console.log(`Admin Email:    admin@acmetech.in`);
  console.log(`Admin Password: Admin@1234`);
  console.log('─────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
