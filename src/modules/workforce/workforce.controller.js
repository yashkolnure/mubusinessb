const { prisma }   = require('../../config/database');
const { toFloat }  = require('../../utils/document.util');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder, getDateRange } = require('../../utils/pagination.util');
const { emails } = require('../../utils/email.util');

// ══════════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════════

exports.listEmployees = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search  = buildSearchFilter(req.query.search, ['name','email','employeeCode','department','designation']);
  const orderBy = getSortOrder(req.query, ['name','department','dateOfJoining','createdAt']);

  const where = {
    businessId: req.businessId,
    isActive:   req.query.isActive !== 'false',
    ...search,
    ...(req.query.department && { department: req.query.department }),
  };

  const [employees, total] = await prisma.$transaction([
    prisma.employee.findMany({ where, skip, take: limit, orderBy }),
    prisma.employee.count({ where }),
  ]);
  return paginatedResponse(res, { data: employees, page, limit, total });
});

exports.getEmployee = asyncHandler(async (req, res) => {
  const employee = await prisma.employee.findFirst({
    where:   { id: req.params.id, businessId: req.businessId },
    include: { user: { select: { email: true, role: true, isActive: true } } },
  });
  if (!employee) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });
  return successResponse(res, { data: employee });
});

exports.createEmployee = asyncHandler(async (req, res) => {
  const empBody = { ...req.body };
  if (empBody.baseSalary !== undefined) empBody.baseSalary = toFloat(empBody.baseSalary);
  const employee = await prisma.employee.create({
    data: { businessId: req.businessId, ...empBody },
  });
  await req.audit({ module: 'workforce', action: 'CREATE', entityType: 'Employee', entityId: employee.id, description: `Created employee: ${employee.name}` });
  return successResponse(res, { status: HTTP.CREATED, message: 'Employee created.', data: employee });
});

exports.updateEmployee = asyncHandler(async (req, res) => {
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });

  const updateBody = { ...req.body };
  if (updateBody.baseSalary !== undefined) updateBody.baseSalary = toFloat(updateBody.baseSalary);
  const employee = await prisma.employee.update({ where: { id: req.params.id }, data: updateBody });
  await req.audit({ module: 'workforce', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, oldData: existing, newData: employee });
  return successResponse(res, { message: 'Employee updated.', data: employee });
});

exports.deleteEmployee = asyncHandler(async (req, res) => {
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });
  await prisma.employee.update({ where: { id: req.params.id }, data: { isActive: false } });
  return successResponse(res, { message: 'Employee deactivated.' });
});

// ══════════════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════════════

exports.listAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const dateFilter = getDateRange(req.query, 'date');

  const where = {
    employee: { businessId: req.businessId },
    ...dateFilter,
    ...(req.query.employeeId && { employeeId: req.query.employeeId }),
    ...(req.query.status     && { status:     req.query.status }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.attendance.findMany({
      where, skip, take: limit,
      orderBy: { date: 'desc' },
      include: { employee: { select: { id: true, name: true, department: true } } },
    }),
    prisma.attendance.count({ where }),
  ]);
  return paginatedResponse(res, { data: records, page, limit, total });
});

exports.markAttendance = asyncHandler(async (req, res) => {
  const { employeeId, date, checkIn, checkOut, status, notes } = req.body;

  // Verify employee belongs to this business
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, businessId: req.businessId } });
  if (!employee) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });

  const hoursWorked = checkIn && checkOut
    ? parseFloat(((new Date(checkOut) - new Date(checkIn)) / 3600000).toFixed(2))
    : null;

  const record = await prisma.attendance.upsert({
    where:  { employeeId_date: { employeeId, date: new Date(date) } },
    create: { employeeId, date: new Date(date), checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null, hoursWorked, status: status || 'PRESENT', notes },
    update: { checkIn: checkIn ? new Date(checkIn) : undefined, checkOut: checkOut ? new Date(checkOut) : undefined, hoursWorked, status, notes },
    include:{ employee: { select: { name: true } } },
  });

  return successResponse(res, { status: HTTP.CREATED, message: 'Attendance recorded.', data: record });
});

exports.bulkMarkAttendance = asyncHandler(async (req, res) => {
  const { date, records } = req.body; // records: [{ employeeId, status, checkIn, checkOut }]

  const results = await Promise.allSettled(
    records.map(({ employeeId, status, checkIn, checkOut, notes }) =>
      prisma.attendance.upsert({
        where:  { employeeId_date: { employeeId, date: new Date(date) } },
        create: { employeeId, date: new Date(date), status, checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null, notes },
        update: { status, checkIn: checkIn ? new Date(checkIn) : undefined, checkOut: checkOut ? new Date(checkOut) : undefined, notes },
      })
    )
  );

  const success = results.filter((r) => r.status === 'fulfilled').length;
  return successResponse(res, { message: `Attendance marked for ${success}/${records.length} employees.` });
});

exports.getAttendanceSummary = asyncHandler(async (req, res) => {
  const { month, year, employeeId } = req.query;

  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 0);

  const where = {
    employee: { businessId: req.businessId },
    date:     { gte: startDate, lte: endDate },
    ...(employeeId && { employeeId }),
  };

  const records = await prisma.attendance.groupBy({
    by:    ['employeeId', 'status'],
    where,
    _count: { status: true },
  });

  return successResponse(res, { data: records });
});

// ══════════════════════════════════════════════════════════════
// LEAVE REQUESTS
// ══════════════════════════════════════════════════════════════

exports.listLeaveRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {
    employee: { businessId: req.businessId },
    ...(req.query.employeeId && { employeeId: req.query.employeeId }),
    ...(req.query.status     && { status:     req.query.status }),
    ...(req.query.leaveType  && { leaveType:  req.query.leaveType }),
  };

  const [requests, total] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { id: true, name: true, department: true } } },
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  return paginatedResponse(res, { data: requests, page, limit, total });
});

exports.createLeaveRequest = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, startDate, endDate, reason } = req.body;

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, businessId: req.businessId } });
  if (!employee) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const request = await prisma.leaveRequest.create({
    data: { employeeId, leaveType, startDate: start, endDate: end, totalDays, reason, status: 'PENDING' },
    include: { employee: { select: { name: true } } },
  });

  // Notify admins/HR
  const admins = await prisma.user.findMany({
    where:  { businessId: req.businessId, role: { in: ['ADMIN','HR','SUPER_ADMIN'] }, isActive: true },
    select: { email: true },
  });

  await Promise.allSettled(admins.map((a) =>
    emails.leaveRequestNotification({
      managerEmail: a.email,
      employeeName: employee.name,
      leaveType, startDate, endDate,
      totalDays,
      businessId: req.businessId,
    })
  ));

  return successResponse(res, { status: HTTP.CREATED, message: 'Leave request submitted.', data: request });
});

exports.updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status, rejectedReason } = req.body;
  if (!['APPROVED','REJECTED','CANCELLED'].includes(status)) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Invalid status.' });
  }

  const request = await prisma.leaveRequest.findFirst({
    where:   { id: req.params.id },
    include: { employee: { select: { businessId: true } } },
  });
  if (!request || request.employee.businessId !== req.businessId) {
    return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Leave request not found.' });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data:  {
      status,
      approvedBy:     status === 'APPROVED' ? req.user.id : null,
      approvedAt:     status === 'APPROVED' ? new Date() : null,
      rejectedReason: status === 'REJECTED' ? rejectedReason : null,
    },
  });

  await req.audit({ module: 'workforce', action: `LEAVE_${status}`, entityType: 'LeaveRequest', entityId: req.params.id });
  return successResponse(res, { message: `Leave request ${status.toLowerCase()}.`, data: updated });
});

// ══════════════════════════════════════════════════════════════
// SALARY
// ══════════════════════════════════════════════════════════════

exports.listSalaries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    employee: { businessId: req.businessId },
    ...(req.query.month      && { month:      parseInt(req.query.month) }),
    ...(req.query.year       && { year:       parseInt(req.query.year) }),
    ...(req.query.employeeId && { employeeId: req.query.employeeId }),
    ...(req.query.status     && { status:     req.query.status }),
  };

  const [salaries, total] = await prisma.$transaction([
    prisma.salary.findMany({
      where, skip, take: limit,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { employee: { select: { id: true, name: true, department: true } } },
    }),
    prisma.salary.count({ where }),
  ]);
  return paginatedResponse(res, { data: salaries, page, limit, total });
});

exports.createSalary = asyncHandler(async (req, res) => {
  const { employeeId, month, year, notes } = req.body;
  const baseSalary  = toFloat(req.body.baseSalary);
  const allowances  = toFloat(req.body.allowances  || 0);
  const bonus       = toFloat(req.body.bonus       || 0);
  const deductions  = toFloat(req.body.deductions  || 0);
  const tax         = toFloat(req.body.tax         || 0);
  const workingDays = parseInt(req.body.workingDays || 0, 10);
  const presentDays = toFloat(req.body.presentDays || 0);

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, businessId: req.businessId } });
  if (!employee) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Employee not found.' });

  const netSalary = parseFloat((baseSalary + allowances + bonus - deductions - tax).toFixed(2));

  const salary = await prisma.salary.create({
    data: { employeeId, month, year, baseSalary, allowances, bonus, deductions, tax, netSalary, workingDays: workingDays || 0, presentDays: presentDays || 0, notes, status: 'PENDING' },
  });

  return successResponse(res, { status: HTTP.CREATED, message: 'Salary record created.', data: salary });
});

exports.markSalaryPaid = asyncHandler(async (req, res) => {
  const { paymentMethod, reference } = req.body;

  const salary = await prisma.salary.findFirst({
    where:   { id: req.params.id },
    include: { employee: { select: { businessId: true, name: true } } },
  });
  if (!salary || salary.employee.businessId !== req.businessId) {
    return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Salary record not found.' });
  }
  if (salary.status === 'PAID') return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Already marked as paid.' });

  const updated = await prisma.salary.update({
    where: { id: req.params.id },
    data:  { status: 'PAID', paidAt: new Date(), paymentMethod, reference },
  });

  // Auto-create finance expense
  await prisma.finance.create({
    data: {
      businessId:    req.businessId,
      type:          'EXPENSE',
      category:      'Salary',
      amount:        salary.netSalary,
      date:          new Date(),
      description:   `Salary for ${salary.employee.name} - ${salary.month}/${salary.year}`,
      paymentMethod,
      createdBy:     req.user.id,
    },
  });

  return successResponse(res, { message: 'Salary marked as paid.', data: updated });
});
