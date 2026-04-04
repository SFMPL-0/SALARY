// ============================================================
// admin.js — SFM Salary System (Supabase Edition)
// ============================================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth check
const user = JSON.parse(sessionStorage.getItem('sfm_user') || 'null');
if (!user || user.type !== 'admin') { window.location.href = 'index.html'; }

let allEmployees = [];
let allSettings = {};
let currentEditEmpId = null;
let lastCalcSalary = null;
let bulkEmployees = [];
let bonusEmployees = [];
let revEmployees = [];
let bankCsvData = '', bankCsvFilename = '';
let pinBranchTarget = '';

// ============================================================
// UTILS
// ============================================================
function fmt(n) { return '₹' + (parseFloat(n)||0).toLocaleString('en-IN', {minimumFractionDigits:0, maximumFractionDigits:0}); }
function safeNum(v) { return parseFloat(v) || 0; }
function ol(on, txt='Loading...') { const el=document.getElementById('loadingOverlay'); el.classList.toggle('show',on); document.getElementById('loadingText').textContent=txt; }
function toast(msg, type='info') {
  const d = document.createElement('div');
  d.className = 't-msg ' + type;
  const icons = {success:'check-circle',error:'times-circle',warning:'exclamation-triangle',info:'info-circle'};
  d.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i>${msg}`;
  document.getElementById('toastContainer').appendChild(d);
  setTimeout(() => d.remove(), 3500);
}
function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ============================================================
// PAGE NAV
// ============================================================
function showPage(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById('page-' + page);
  if (sec) sec.classList.add('active');
  const link = [...document.querySelectorAll('.sb-link')].find(l => l.getAttribute('onclick') && l.getAttribute('onclick').includes("'"+page+"'"));
  if (link) link.classList.add('active');

  // Lazy-load per page
  if (page === 'dashboard') loadDashboard();
  if (page === 'employees') loadEmployees();
  if (page === 'salary') populateSalaryPage();
  if (page === 'settings') loadSettings();
  if (page === 'branches') loadBranches();
  if (page === 'users') loadAdminUsers();
  if (page === 'auditlog') loadAuditLog();
  if (page === 'att_manage') loadBranchAccessTable();
  if (page === 'leave') { populateLeavePage(); }
  if (page === 'payslip') populatePayslipPage();
  if (['bulk','bonus','revision','leave','monthly','yearly','pfesi','gratuity','bank','att_overview'].includes(page)) populateBranchDropdowns();
  populateMonthSelects();
}

// ============================================================
// INIT
// ============================================================
window.onload = async function() {
  document.getElementById('currentUser').textContent = user.name + ' (' + user.role + ')';
  await loadSettings();
  populateMonthSelects();
  populateBranchDropdowns();
  loadDashboard();
};

function populateMonthSelects() {
  ['salMonth','psMonth','reportMonth','bulkMonth','bonusMonth','revEffMonth','lvMonth','lvFilterMonth','bankMonth','pfesiMonth','deptReportMonth'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const hasAll = id === 'lvFilterMonth' || id === 'pfesiMonth';
    el.innerHTML = (hasAll ? '<option value="All">All Months</option>' : '') + MONTHS.map(m => `<option>${m}</option>`).join('');
  });
}

async function populateBranchDropdowns() {
  const ids = ['bulkBranch','bonusBranch','revBranch','lvFilterBranch','reportBranchFilter','yearlyBranch','gratuityBranch','bankBranch','attBranchFilter','empFilterBranch'];
  const opt = BRANCHES.map(b => `<option value="${b}">${b}</option>`).join('');
  ids.forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML = '<option value="All">All Branches</option>' + opt; });
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
  const { data } = await db.from('settings').select('*');
  if (data) {
    data.forEach(r => { allSettings[r.key] = r.value; });
    ['COMPANY_NAME','GST_NO','ADDRESS_LINE1','ADDRESS_LINE2','CITY_STATE_PIN','PAN_DEDUCTOR','TAN_DEDUCTOR',
     'PF_EMP_PERCENT','PF_ER_PERCENT','ESI_EMP_PERCENT','ESI_ER_PERCENT','PF_WAGE_CAP','PT_STATE','FEB_300_MODE'].forEach(k => {
      const el = document.getElementById('cfg_'+k);
      if (el && allSettings[k] !== undefined) { el.tagName==='SELECT' ? el.value=allSettings[k] : el.value=allSettings[k]; }
    });
  }
}

async function saveSettingsNow() {
  ol(true, 'Saving settings...');
  const keys = ['COMPANY_NAME','GST_NO','ADDRESS_LINE1','ADDRESS_LINE2','CITY_STATE_PIN','PAN_DEDUCTOR','TAN_DEDUCTOR',
    'PF_EMP_PERCENT','PF_ER_PERCENT','ESI_EMP_PERCENT','ESI_ER_PERCENT','PF_WAGE_CAP','PT_STATE','FEB_300_MODE'];
  const upserts = keys.map(k => ({ key:k, value:(document.getElementById('cfg_'+k)||{}).value||'' }));
  const { error } = await db.from('settings').upsert(upserts, { onConflict: 'key' });
  ol(false);
  if (error) { toast('Error saving settings: '+error.message,'error'); return; }
  await loadSettings();
  toast('Settings saved!','success');
  await audit('Settings Updated','Master settings saved','Settings');
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  ol(true, 'Loading dashboard...');
  const [{ data: emps }, { data: salData }, { data: logs }] = await Promise.all([
    db.from('employees').select('emp_id,name,branch,designation,status'),
    db.from('salary_entries').select('net_salary,month').eq('month', MONTHS[MONTHS.length-1]),
    db.from('audit_log').select('*').order('timestamp',{ascending:false}).limit(8)
  ]);
  ol(false);

  const total = emps ? emps.length : 0;
  const active = emps ? emps.filter(e=>e.status==='Active').length : 0;
  const branchCount = emps ? new Set(emps.map(e=>e.branch)).size : 0;
  const monthlyTotal = salData ? salData.reduce((s,r)=>s+safeNum(r.net_salary),0) : 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-branches').textContent = branchCount;
  document.getElementById('stat-monthly').textContent = fmt(monthlyTotal);

  allEmployees = emps || [];

  const tb = document.getElementById('dashEmpTable');
  if (allEmployees.length) {
    tb.innerHTML = allEmployees.slice(0,15).map(e =>
      `<tr><td><code>${e.emp_id}</code></td><td>${e.name}</td><td><span class="badge-branch">${e.branch}</span></td>
      <td>${e.designation||'-'}</td><td>${badgeStatus(e.status)}</td>
      <td>
        <button class="btn btn-xs btn-outline-primary mr-1" onclick="showPage('payslip');setTimeout(()=>document.getElementById('psEmpId').value='${e.emp_id}',500)"><i class="fas fa-file-invoice"></i></button>
        <button class="btn btn-xs btn-outline-secondary" onclick="viewEmployee('${e.emp_id}')"><i class="fas fa-eye"></i></button>
      </td></tr>`
    ).join('');
  } else {
    tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No employees found. <a href="#" onclick="openAddEmployee()">Add your first employee</a></td></tr>`;
  }

  const atb = document.getElementById('dashAuditTable');
  if (logs && logs.length) {
    atb.innerHTML = logs.map(l =>
      `<tr><td style="font-size:.78rem">${l.action}</td><td style="font-size:.78rem;color:var(--muted)">${l.details||''}</td></tr>`
    ).join('');
  }
}

function badgeStatus(s) {
  if (s==='Active') return `<span class="badge-status-active">Active</span>`;
  if (s==='Resigned') return `<span class="badge-status-resigned">Resigned</span>`;
  return `<span class="badge-status-inactive">Inactive</span>`;
}

// ============================================================
// EMPLOYEES
// ============================================================
async function loadEmployees() {
  ol(true, 'Loading employees...');
  let q = db.from('employees').select('*').order('name');
  const search = (document.getElementById('empSearch')||{}).value || '';
  const branchF = (document.getElementById('empFilterBranch')||{}).value || '';
  const statusF = (document.getElementById('empFilterStatus')||{}).value || '';
  if (branchF && branchF!=='All') q = q.eq('branch', branchF);
  if (statusF) q = q.eq('status', statusF);
  const { data, error } = await q;
  ol(false);
  if (error) { toast('Error: '+error.message,'error'); return; }
  allEmployees = data || [];
  const filtered = search ? allEmployees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.emp_id.toLowerCase().includes(search.toLowerCase())) : allEmployees;

  const tb = document.getElementById('empTable');
  if (!filtered.length) { tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No employees found</td></tr>'; return; }
  tb.innerHTML = filtered.map(e => {
    const gross = safeNum(e.basic)+safeNum(e.da)+safeNum(e.hra)+safeNum(e.conveyance)+safeNum(e.fooding)+safeNum(e.other_allowance);
    return `<tr>
      <td><code>${e.emp_id}</code></td><td><strong>${e.name}</strong></td>
      <td><span class="badge-branch">${e.branch}</span></td>
      <td>${e.designation||'-'}</td><td>${fmt(e.basic)}</td>
      <td>${badgeStatus(e.status)}</td>
      <td>
        <button class="btn btn-xs btn-outline-primary mr-1" onclick="viewEmployee('${e.emp_id}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-xs btn-outline-warning mr-1" onclick="openEditEmployee('${e.emp_id}')"><i class="fas fa-edit"></i></button>
      </td></tr>`;
  }).join('');
}

async function openAddEmployee() {
  currentEditEmpId = null;
  ['emp_name','emp_designation','emp_department','emp_pan','emp_uan','emp_esiNumber','emp_phone','emp_email',
   'emp_bankAccount','emp_ifsc','emp_addr1','emp_addr2','emp_city','emp_state','emp_pin'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  ['emp_basic','emp_da','emp_hra','emp_conveyance','emp_fooding','emp_otherAllowance','emp_customPfSalary'].forEach(id => { const el=document.getElementById(id); if(el) el.value=0; });
  document.getElementById('emp_status').value = 'Active';
  document.getElementById('emp_pfApplicable').value = 'Basic Salary';
  document.getElementById('emp_esiApplicable').value = 'Yes';
  document.getElementById('empIdPreview').style.display = 'none';

  // Populate branch dropdown
  const bd = document.getElementById('emp_branch');
  bd.innerHTML = '<option value="">-- Select --</option>' + BRANCHES.map(b => `<option>${b}</option>`).join('');
  document.getElementById('addEmployeeModal').querySelector('.modal-title').innerHTML = '<i class="fas fa-user-plus mr-2"></i>Add Employee';
  $('#addEmployeeModal').modal('show');
}

async function openEditEmployee(empId) {
  const emp = allEmployees.find(e => e.emp_id === empId);
  if (!emp) { toast('Employee not found','error'); return; }
  currentEditEmpId = empId;

  const fieldMap = {
    emp_name:'name',emp_designation:'designation',emp_department:'department',emp_pan:'pan',
    emp_uan:'uan',emp_esiNumber:'esi_number',emp_phone:'phone',emp_email:'email',
    emp_bankAccount:'bank_account',emp_ifsc:'ifsc',emp_addr1:'addr1',emp_addr2:'addr2',
    emp_city:'city',emp_state:'state',emp_pin:'pin',
    emp_basic:'basic',emp_da:'da',emp_hra:'hra',emp_conveyance:'conveyance',
    emp_fooding:'fooding',emp_otherAllowance:'other_allowance',emp_customPfSalary:'custom_pf_salary'
  };
  Object.entries(fieldMap).forEach(([elId, field]) => {
    const el = document.getElementById(elId); if(el) el.value = emp[field] || '';
  });
  document.getElementById('emp_status').value = emp.status || 'Active';
  document.getElementById('emp_pfApplicable').value = emp.pf_applicable || 'Basic Salary';
  document.getElementById('emp_esiApplicable').value = emp.esi_applicable || 'Yes';
  if (emp.join_date) document.getElementById('emp_joinDate').value = emp.join_date;

  const bd = document.getElementById('emp_branch');
  bd.innerHTML = '<option value="">-- Select --</option>' + BRANCHES.map(b => `<option${b===emp.branch?' selected':''}>${b}</option>`).join('');

  document.getElementById('empIdPreviewVal').textContent = empId;
  document.getElementById('empIdPreview').style.display = 'block';
  document.getElementById('addEmployeeModal').querySelector('.modal-title').innerHTML = '<i class="fas fa-edit mr-2"></i>Edit Employee — ' + empId;
  $('#addEmployeeModal').modal('show');
}

function toggleCustomPf() {
  const v = document.getElementById('emp_pfApplicable').value;
  document.getElementById('customPfField').style.display = v === 'Custom' ? 'block' : 'none';
}

async function previewEmpId() {
  const branch = document.getElementById('emp_branch').value;
  if (!branch || currentEditEmpId) return;
  // Get count for this branch to generate ID
  const { count } = await db.from('employees').select('*', {count:'exact',head:true}).eq('branch', branch);
  const nextNum = (count||0) + 1;
  const nextId = branch.replace(/\s/g,'') + String(nextNum).padStart(3,'0');
  document.getElementById('empIdPreviewVal').textContent = nextId;
  document.getElementById('empIdPreview').style.display = 'block';
}

async function submitAddEmployee() {
  const g = id => (document.getElementById(id)||{}).value || '';
  const name = g('emp_name').trim();
  const branch = g('emp_branch');
  if (!name) { toast('Employee name is required','warning'); return; }
  if (!branch) { toast('Branch is required','warning'); return; }

  ol(true, currentEditEmpId ? 'Updating employee...' : 'Adding employee...');

  let empId = currentEditEmpId;
  if (!empId) {
    const { count } = await db.from('employees').select('*',{count:'exact',head:true}).eq('branch', branch);
    empId = branch.replace(/\s/g,'') + String((count||0)+1).padStart(3,'0');
  }

  const empData = {
    emp_id:empId, name, branch,
    designation:g('emp_designation'), department:g('emp_department'),
    status:g('emp_status'), join_date:g('emp_joinDate')||null,
    basic:safeNum(g('emp_basic')), da:safeNum(g('emp_da')),
    hra:safeNum(g('emp_hra')), conveyance:safeNum(g('emp_conveyance')),
    fooding:safeNum(g('emp_fooding')), other_allowance:safeNum(g('emp_otherAllowance')),
    pf_applicable:g('emp_pfApplicable'), esi_applicable:g('emp_esiApplicable'),
    custom_pf_salary:safeNum(g('emp_customPfSalary')),
    pan:g('emp_pan').toUpperCase(), uan:g('emp_uan'), esi_number:g('emp_esiNumber'),
    phone:g('emp_phone'), email:g('emp_email'),
    bank_account:g('emp_bankAccount'), ifsc:g('emp_ifsc').toUpperCase(),
    addr1:g('emp_addr1'), addr2:g('emp_addr2'), city:g('emp_city'),
    state:g('emp_state'), pin:g('emp_pin'),
    updated_at: new Date().toISOString()
  };

  const { error } = await db.from('employees').upsert(empData, { onConflict:'emp_id' });
  ol(false);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast((currentEditEmpId?'Employee updated!':'Employee '+empId+' added!'),'success');
  $('#addEmployeeModal').modal('hide');
  await audit((currentEditEmpId?'Employee Updated':'Employee Added'), empId+' — '+name, 'Employees');
  loadEmployees();
  loadDashboard();
}

async function viewEmployee(empId) {
  const emp = allEmployees.find(e => e.emp_id===empId) || (await db.from('employees').select('*').eq('emp_id',empId).single()).data;
  if (!emp) { toast('Employee not found','error'); return; }
  const gross = safeNum(emp.basic)+safeNum(emp.da)+safeNum(emp.hra)+safeNum(emp.conveyance)+safeNum(emp.fooding)+safeNum(emp.other_allowance);
  const addrStr = [emp.addr1,emp.addr2,emp.city,emp.state,emp.pin].filter(Boolean).join(', ');
  document.getElementById('viewEmployeeBody').innerHTML = `
    <div class="row">
      <div class="col-md-6"><table class="table table-sm">
        <tr><th>ID</th><td><code>${emp.emp_id}</code></td></tr>
        <tr><th>Name</th><td><strong>${emp.name}</strong></td></tr>
        <tr><th>Branch</th><td><span class="badge-branch">${emp.branch}</span></td></tr>
        <tr><th>Designation</th><td>${emp.designation||'-'}</td></tr>
        <tr><th>Department</th><td>${emp.department||'-'}</td></tr>
        <tr><th>Status</th><td>${badgeStatus(emp.status)}</td></tr>
        <tr><th>Phone</th><td>${emp.phone||'-'}</td></tr>
        <tr><th>Address</th><td>${addrStr||'-'}</td></tr>
      </table></div>
      <div class="col-md-6"><table class="table table-sm">
        <tr><th>Basic</th><td>${fmt(emp.basic)}</td></tr>
        <tr><th>DA</th><td>${fmt(emp.da)}</td></tr>
        <tr><th>HRA</th><td>${fmt(emp.hra)}</td></tr>
        <tr><th>Conveyance</th><td>${fmt(emp.conveyance)}</td></tr>
        <tr><th>Fooding</th><td>${fmt(emp.fooding)}</td></tr>
        <tr><th>Others</th><td>${fmt(emp.other_allowance)}</td></tr>
        <tr><th>Gross</th><td><strong>${fmt(gross)}</strong></td></tr>
        <tr><th>PF Mode</th><td>${emp.pf_applicable}</td></tr>
        <tr><th>Bank A/C</th><td>${emp.bank_account||'-'}</td></tr>
        <tr><th>IFSC</th><td>${emp.ifsc||'-'}</td></tr>
      </table></div>
    </div>
    <div class="mt-2">
      <button class="btn btn-sm btn-success mr-2" onclick="$('#viewEmployeeModal').modal('hide');showPage('salary');setTimeout(()=>document.getElementById('salEmpId').value='${emp.emp_id}',500)"><i class="fas fa-money-bill-wave mr-1"></i>Process Salary</button>
      <button class="btn btn-sm btn-info mr-2" onclick="$('#viewEmployeeModal').modal('hide');showPage('payslip');setTimeout(()=>document.getElementById('psEmpId').value='${emp.emp_id}',500)"><i class="fas fa-file-invoice mr-1"></i>Payslip</button>
      <button class="btn btn-sm btn-warning" onclick="$('#viewEmployeeModal').modal('hide');openEditEmployee('${emp.emp_id}')"><i class="fas fa-edit mr-1"></i>Edit</button>
    </div>`;
  $('#viewEmployeeModal').modal('show');
}

// ============================================================
// SALARY CALCULATIONS
// ============================================================
function calcPT(gross, state, month, settings) {
  const feb300 = (settings.FEB_300_MODE||'Yes') === 'Yes';
  const isFeb = month && month.toLowerCase().includes('february');
  const isMar = month && month.toLowerCase().includes('march');
  const isSep = month && month.toLowerCase().includes('september');

  switch(state) {
    case 'Karnataka':
      if (gross < 15000) return 0;
      if (gross < 25000) return 150;
      return (isFeb&&feb300) ? 300 : 200;
    case 'Maharashtra':
      if (gross <= 7500) return 0;
      if (gross <= 10000) return 175;
      return (isFeb&&feb300) ? 300 : 200;
    case 'Tamil Nadu':
      return (isSep||isMar) ? (gross<21000?0:208) : 0;
    case 'Gujarat':
      if (gross < 6000) return 0;
      if (gross < 9000) return 80;
      if (gross < 12000) return 150;
      return 200;
    case 'Telangana':
      if (gross < 15000) return 0;
      if (gross < 20000) return 150;
      return 200;
    case 'West Bengal':
      if (gross < 10000) return 0;
      if (gross < 15000) return 110;
      if (gross < 25000) return 130;
      if (gross < 40000) return 150;
      return 200;
    case 'Chhattisgarh':
      return gross < 15000 ? 0 : 200;

    default: return gross < 15000 ? 0 : 200;
  }
}

async function populateSalaryPage() {
  const { data } = await db.from('employees').select('emp_id,name,branch,status').eq('status','Active').order('name');
  const sel = document.getElementById('salEmpId');
  if (sel && data) sel.innerHTML = '<option value="">-- Select Employee --</option>' + data.map(e => `<option value="${e.emp_id}">${e.emp_id} — ${e.name} (${e.branch})</option>`).join('');
}

async function calculateSalaryNow() {
  const month = document.getElementById('salMonth').value;
  const empId = document.getElementById('salEmpId').value;
  const workDays = safeNum(document.getElementById('salWorkDays').value);
  const totalDays = safeNum(document.getElementById('salTotalDays').value) || 30;
  const manualPT = document.getElementById('salPT').value;
  if (!empId) { toast('Please select an employee','warning'); return; }
  if (!workDays && workDays!==0) { toast('Please enter working days','warning'); return; }

  ol(true, 'Calculating...');
  const { data: emp } = await db.from('employees').select('*').eq('emp_id', empId).single();
  ol(false);
  if (!emp) { toast('Employee not found','error'); return; }

  const ratio = totalDays > 0 ? workDays / totalDays : 1;
  const basic = Math.round(safeNum(emp.basic) * ratio);
  const da = Math.round(safeNum(emp.da) * ratio);
  const hra = Math.round(safeNum(emp.hra) * ratio);
  const conv = Math.round(safeNum(emp.conveyance) * ratio);
  const food = Math.round(safeNum(emp.fooding) * ratio);
  const others = Math.round(safeNum(emp.other_allowance) * ratio);
  const gross = basic + da + hra + conv + food + others;

  // PF
  const pfCap = safeNum(allSettings.PF_WAGE_CAP) || 15000;
  const pfEmpPct = safeNum(allSettings.PF_EMP_PERCENT) || 12;
  const pfErPct = safeNum(allSettings.PF_ER_PERCENT) || 13.61;
  let pfSalary = 0, pfEmployee = 0, pfEmployer = 0;
  if (emp.pf_applicable === 'No') { pfSalary = 0; }
  else if (emp.pf_applicable === 'Custom') { pfSalary = Math.min(safeNum(emp.custom_pf_salary), pfCap); }
  else { pfSalary = Math.min(safeNum(emp.basic), pfCap); } // Always on full basic
  pfEmployee = Math.round(pfSalary * pfEmpPct / 100);
  pfEmployer = Math.round(pfSalary * pfErPct / 100);

  // ESI
  const esiEmpPct = safeNum(allSettings.ESI_EMP_PERCENT) || 0.75;
  const esiErPct = safeNum(allSettings.ESI_ER_PERCENT) || 3.25;
  let esiEmployee = 0, esiEmployer = 0;
  if (emp.esi_applicable === 'Yes' && gross <= 21000) {
    esiEmployee = Math.round(gross * esiEmpPct / 100);
    esiEmployer = Math.round(gross * esiErPct / 100);
  }

  // PT
  const state = BRANCH_STATE_MAP[emp.branch] || allSettings.PT_STATE || 'Maharashtra';
  const pt = manualPT !== '' ? safeNum(manualPT) : calcPT(gross, state, month, allSettings);

  const totalDed = pfEmployee + esiEmployee + pt;
  const net = gross - totalDed;

  lastCalcSalary = { empId, name:emp.name, branch:emp.branch, month, workDays, totalDays,
    basic, da, hra, conv, food, others, gross,
    pfSalary, pfEmployee, pfEmployer, esiEmployee, esiEmployer, pt, totalDed, net,
    pfMode:emp.pf_applicable, pfEmpPct, pfErPct, esiEmpPct, esiErPct, ptState:state };

  const box = document.getElementById('salaryResultBox');
  box.innerHTML = `
    <div class="mb-3"><strong>${emp.name}</strong> <span class="badge-branch ml-2">${emp.branch}</span><br>
    <small class="text-muted">${month} | Days: ${workDays}/${totalDays}</small></div>
    <div class="row">
      <div class="col-md-6">
        <div class="calc-box mb-3">
          <div class="section-title mb-2">Earnings</div>
          <div class="calc-row"><span>Basic</span><span>${fmt(basic)}</span></div>
          <div class="calc-row"><span>DA</span><span>${fmt(da)}</span></div>
          <div class="calc-row"><span>HRA</span><span>${fmt(hra)}</span></div>
          <div class="calc-row"><span>Conveyance</span><span>${fmt(conv)}</span></div>
          <div class="calc-row"><span>Fooding</span><span>${fmt(food)}</span></div>
          <div class="calc-row"><span>Others</span><span>${fmt(others)}</span></div>
          <div class="calc-row calc-total"><span>Gross</span><span>${fmt(gross)}</span></div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="calc-box mb-3">
          <div class="section-title mb-2">Deductions</div>
          <div class="calc-row"><span>PF ${pfEmpPct}% (${emp.pf_applicable}: ${fmt(pfSalary)})</span><span>${fmt(pfEmployee)}</span></div>
          <div class="calc-row"><span>ESI ${esiEmpPct}%</span><span>${fmt(esiEmployee)}</span></div>
          <div class="calc-row"><span>PT (${state})</span><span>${fmt(pt)}</span></div>
          <div class="calc-row calc-total"><span>Total Deductions</span><span>${fmt(totalDed)}</span></div>
        </div>
        <div class="calc-box" style="background:#f0fdf4;border-color:#86efac">
          <div class="section-title mb-2" style="color:#166534">Company Contributions</div>
          <div class="calc-row"><span>Co. PF (${pfErPct}%)</span><span>${fmt(pfEmployer)}</span></div>
          <div class="calc-row"><span>Co. ESI (${esiErPct}%)</span><span>${fmt(esiEmployer)}</span></div>
        </div>
      </div>
    </div>
    <div class="alert alert-primary mt-3 d-flex justify-content-between align-items-center">
      <strong style="font-size:1.05rem">Net Salary: ${fmt(net)}</strong>
      <button class="btn btn-success btn-sm" onclick="saveSalaryEntry()"><i class="fas fa-save mr-1"></i>Save Salary</button>
    </div>`;
}

async function saveSalaryEntry() {
  if (!lastCalcSalary) { toast('Calculate salary first','warning'); return; }
  ol(true, 'Saving salary...');
  const r = lastCalcSalary;
  const { error } = await db.from('salary_entries').upsert({
    month:r.month, emp_id:r.empId, branch:r.branch, name:r.name,
    basic:r.basic, da:r.da, hra:r.hra, conveyance:r.conv, fooding:r.food, others:r.others,
    gross:r.gross, days_present:r.workDays, total_days:r.totalDays,
    pf_salary:r.pfSalary, pf_emp:r.pfEmployee, esi_emp:r.esiEmployee,
    professional_tax:r.pt, total_deductions:r.totalDed, net_salary:r.net,
    co_pf:r.pfEmployer, co_esi:r.esiEmployer, bonus:0,
    status:'Paid', payment_date:new Date().toISOString().split('T')[0], processed_by:user.name
  }, { onConflict:'month,emp_id' });
  ol(false);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast('Salary saved for '+r.name,'success');
  await audit('Salary Saved', r.empId+' | '+r.month+' | Net: '+r.net, 'Salary');
}

// ============================================================
// BULK SALARY
// ============================================================
async function loadBulkEmployees() {
  const month = document.getElementById('bulkMonth').value;
  const branch = document.getElementById('bulkBranch').value;
  if (!month) { toast('Select a month','warning'); return; }
  ol(true, 'Loading employees...');
  let q = db.from('employees').select('*').eq('status','Active').order('name');
  if (branch && branch!=='All') q = q.eq('branch', branch);
  const { data: emps } = await q;
  const { data: existing } = await db.from('salary_entries').select('emp_id').eq('month', month);
  ol(false);
  const existingIds = new Set((existing||[]).map(r=>r.emp_id));
  bulkEmployees = (emps||[]).map(e => ({ ...e, alreadySaved: existingIds.has(e.emp_id), daysPresent: '' }));
  const tbody = document.getElementById('bulkEmpBody');
  const totalDays = safeNum(document.getElementById('bulkTotalDays').value)||30;
  tbody.innerHTML = bulkEmployees.map((e,i) => {
    const gross = safeNum(e.basic)+safeNum(e.da)+safeNum(e.hra)+safeNum(e.conveyance)+safeNum(e.fooding)+safeNum(e.other_allowance);
    return `<tr style="${e.alreadySaved?'background:#f0fdf4;':''}">
      <td><input type="checkbox" class="bulk-chk" data-idx="${i}" ${e.alreadySaved?'disabled':'checked'}></td>
      <td><code>${e.emp_id}</code></td><td>${e.name}${e.alreadySaved?'<small class="text-success ml-1">(Saved)</small>':''}</td>
      <td><span class="badge-branch">${e.branch}</span></td>
      <td>${fmt(e.basic)}</td><td>${fmt(gross)}</td>
      <td>${e.alreadySaved?'—':`<input type="number" class="form-control form-control-sm bulk-days" data-idx="${i}" value="${totalDays}" min="0" max="${totalDays}" style="width:80px">`}</td>
      <td id="bulk-net-${i}">${e.alreadySaved?'—':'—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('bulkSummaryLine').textContent = `${bulkEmployees.length} employees loaded (${existingIds.size} already saved)`;
  document.getElementById('bulkTableSection').style.display = 'block';
}

function fillAllDays() {
  const days = document.getElementById('bulkFillAll').value;
  if (!days) return;
  document.querySelectorAll('.bulk-days').forEach(inp => { inp.value = days; });
}

function toggleBulkAll(chk) { document.querySelectorAll('.bulk-chk:not(:disabled)').forEach(c => c.checked=chk.checked); }

async function submitBulkSalary() {
  const month = document.getElementById('bulkMonth').value;
  const totalDays = safeNum(document.getElementById('bulkTotalDays').value)||30;
  ol(true, 'Saving bulk salaries...');
  const records = [];
  document.querySelectorAll('.bulk-chk:not(:disabled):checked').forEach(chk => {
    const i = parseInt(chk.dataset.idx);
    const e = bulkEmployees[i];
    const daysInp = document.querySelector(`.bulk-days[data-idx="${i}"]`);
    if (!daysInp) return;
    const workDays = safeNum(daysInp.value);
    const ratio = totalDays > 0 ? workDays/totalDays : 1;
    const basic=Math.round(safeNum(e.basic)*ratio), da=Math.round(safeNum(e.da)*ratio),
          hra=Math.round(safeNum(e.hra)*ratio), conv=Math.round(safeNum(e.conveyance)*ratio),
          food=Math.round(safeNum(e.fooding)*ratio), others=Math.round(safeNum(e.other_allowance)*ratio);
    const gross=basic+da+hra+conv+food+others;
    const pfCap=safeNum(allSettings.PF_WAGE_CAP)||15000, pfEmpPct=safeNum(allSettings.PF_EMP_PERCENT)||12, pfErPct=safeNum(allSettings.PF_ER_PERCENT)||13.61;
    const pfSalary=e.pf_applicable==='No'?0:e.pf_applicable==='Custom'?Math.min(safeNum(e.custom_pf_salary),pfCap):Math.min(safeNum(e.basic),pfCap);
    const pfEmp=Math.round(pfSalary*pfEmpPct/100), pfEr=Math.round(pfSalary*pfErPct/100);
    const esiEmpPct=safeNum(allSettings.ESI_EMP_PERCENT)||0.75, esiErPct=safeNum(allSettings.ESI_ER_PERCENT)||3.25;
    const esiEmp=(e.esi_applicable==='Yes'&&gross<=21000)?Math.round(gross*esiEmpPct/100):0;
    const esiEr=(e.esi_applicable==='Yes'&&gross<=21000)?Math.round(gross*esiErPct/100):0;
    const state=BRANCH_STATE_MAP[e.branch]||allSettings.PT_STATE||'Maharashtra';
    const pt=calcPT(gross,state,month,allSettings);
    const totalDed=pfEmp+esiEmp+pt;
    const net=gross-totalDed;
    records.push({ month, emp_id:e.emp_id, branch:e.branch, name:e.name,
      basic,da,hra,conveyance:conv,fooding:food,others,gross,
      days_present:workDays,total_days:totalDays,pf_salary:pfSalary,pf_emp:pfEmp,esi_emp:esiEmp,
      professional_tax:pt,total_deductions:totalDed,net_salary:net,co_pf:pfEr,co_esi:esiEr,bonus:0,
      status:'Paid',payment_date:new Date().toISOString().split('T')[0],processed_by:user.name });
  });
  if (!records.length) { ol(false); toast('No employees selected','warning'); return; }
  const { error } = await db.from('salary_entries').upsert(records, { onConflict:'month,emp_id' });
  ol(false);
  if (error) { toast('Error: '+error.message,'error'); return; }
  toast(`${records.length} salaries saved!`,'success');
  await audit('Bulk Salary','Saved '+records.length+' salary records for '+month,'Salary');
  document.getElementById('bulkResultBox').innerHTML = `<div class="alert alert-success"><i class="fas fa-check-circle mr-2"></i><strong>${records.length} salary records saved</strong> for ${month}.</div>`;
}

// ============================================================
// BONUS
// ============================================================
async function loadBonusEmployees() {
  const month = document.getElementById('bonusMonth').value;
  const branch = document.getElementById('bonusBranch').value;
  if (!month) { toast('Select a month','warning'); return; }
  ol(true,'Loading...');
  let q = db.from('employees').select('emp_id,name,branch,basic,da,hra,conveyance,fooding,other_allowance').eq('status','Active').order('name');
  if (branch&&branch!=='All') q=q.eq('branch',branch);
  const {data} = await q;
  ol(false);
  bonusEmployees = data||[];
  document.getElementById('bonusEmpBody').innerHTML = bonusEmployees.map((e,i)=>{
    const gross=safeNum(e.basic)+safeNum(e.da)+safeNum(e.hra)+safeNum(e.conveyance)+safeNum(e.fooding)+safeNum(e.other_allowance);
    return `<tr><td><input type="checkbox" class="bonus-chk" data-idx="${i}" checked></td>
      <td><code>${e.emp_id}</code></td><td>${e.name}</td><td><span class="badge-branch">${e.branch}</span></td>
      <td>${fmt(gross)}</td>
      <td><input type="number" class="form-control form-control-sm bonus-amt" data-idx="${i}" value="0" min="0" style="width:130px"></td>
    </tr>`;
  }).join('');
  document.getElementById('bonusTableSection').style.display='block';
}
function fillAllBonus(){const amt=document.getElementById('bonusFillAll').value;document.querySelectorAll('.bonus-amt').forEach(inp=>inp.value=amt);}
function toggleBonusAll(chk){document.querySelectorAll('.bonus-chk').forEach(c=>c.checked=chk.checked);}
async function submitBonusEntry(){
  const month=document.getElementById('bonusMonth').value;
  ol(true,'Saving bonus...');
  const updates=[];
  document.querySelectorAll('.bonus-chk:checked').forEach(chk=>{
    const i=parseInt(chk.dataset.idx);
    const amt=safeNum(document.querySelector(`.bonus-amt[data-idx="${i}"]`).value);
    if(amt>0) updates.push({month,emp_id:bonusEmployees[i].emp_id,bonus:amt});
  });
  if(!updates.length){ol(false);toast('No bonus entries to save','warning');return;}
  for(const u of updates){
    await db.from('salary_entries').update({bonus:u.bonus}).eq('month',u.month).eq('emp_id',u.emp_id);
  }
  ol(false);toast(`Bonus saved for ${updates.length} employees!`,'success');
  await audit('Bonus Entry','Bonus saved for '+updates.length+' employees in '+month,'Salary');
  document.getElementById('bonusResultBox').innerHTML=`<div class="alert alert-success"><i class="fas fa-check-circle mr-2"></i>Bonus saved for ${updates.length} employees.</div>`;
}

// ============================================================
// SALARY REVISION
// ============================================================
async function loadRevisionEmployees(){
  const branch=document.getElementById('revBranch').value;
  ol(true,'Loading...');
  let q=db.from('employees').select('emp_id,name,branch,designation,basic,da,hra,conveyance,fooding,other_allowance').eq('status','Active').order('name');
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data}=await q;
  ol(false);
  revEmployees=data||[];
  document.getElementById('revEmpBody').innerHTML=revEmployees.map((e,i)=>{
    const gross=safeNum(e.basic)+safeNum(e.da)+safeNum(e.hra)+safeNum(e.conveyance)+safeNum(e.fooding)+safeNum(e.other_allowance);
    return `<tr><td><code>${e.emp_id}</code></td><td>${e.name}</td><td><span class="badge-branch">${e.branch}</span></td>
      <td>${e.designation||'-'}</td><td>${fmt(e.basic)}</td>
      <td><input type="number" class="form-control form-control-sm rev-basic" data-idx="${i}" value="${e.basic}" min="0" style="width:110px"></td>
      <td>${fmt(gross)}</td><td id="rev-new-gross-${i}">${fmt(gross)}</td>
    </tr>`;
  }).join('');
  document.getElementById('revTableSection').style.display='block';
  document.querySelectorAll('.rev-basic').forEach(inp=>inp.addEventListener('input',function(){
    const i=parseInt(this.dataset.idx);const e=revEmployees[i];
    const newBasic=safeNum(this.value);
    const ng=newBasic+safeNum(e.da)+safeNum(e.hra)+safeNum(e.conveyance)+safeNum(e.fooding)+safeNum(e.other_allowance);
    document.getElementById('rev-new-gross-'+i).textContent=fmt(ng);
  }));
}
function applyBulkPct(){
  const pct=safeNum(document.getElementById('revPctFill').value);if(!pct)return;
  document.querySelectorAll('.rev-basic').forEach((inp,i)=>{
    const cur=safeNum(revEmployees[i].basic);
    inp.value=Math.round(cur*(1+pct/100));
    inp.dispatchEvent(new Event('input'));
  });
}
async function submitRevision(){
  const note=document.getElementById('revNote').value;
  ol(true,'Saving revisions...');
  const updates=[];
  document.querySelectorAll('.rev-basic').forEach((inp,i)=>{
    const newBasic=safeNum(inp.value);
    if(newBasic!==safeNum(revEmployees[i].basic)) updates.push({emp_id:revEmployees[i].emp_id,basic:newBasic});
  });
  for(const u of updates){await db.from('employees').update({basic:u.basic,updated_at:new Date().toISOString()}).eq('emp_id',u.emp_id);}
  ol(false);toast(`${updates.length} salary revisions saved!`,'success');
  if(note&&updates.length) await audit('Salary Revision',note+' — '+updates.length+' employees','Salary');
  document.getElementById('revResultBox').innerHTML=`<div class="alert alert-success"><i class="fas fa-check-circle mr-2"></i>${updates.length} salary revisions saved.</div>`;
}

// ============================================================
// LEAVE & LOP
// ============================================================
async function populateLeavePage(){
  const{data}=await db.from('employees').select('emp_id,name,branch').eq('status','Active').order('name');
  const sel=document.getElementById('lvEmpId');
  if(sel&&data) sel.innerHTML='<option value="">-- Select Employee --</option>'+data.map(e=>`<option value="${e.emp_id}">${e.emp_id} — ${e.name} (${e.branch})</option>`).join('');
  MONTHS.forEach(m=>{
    const el=document.getElementById('lvFilterMonth');if(el&&!el.querySelector(`option[value="${m}"]`)){const o=document.createElement('option');o.value=m;o.textContent=m;el.appendChild(o);}
  });
}
async function submitLeaveEntry(){
  const month=document.getElementById('lvMonth').value;
  const empId=document.getElementById('lvEmpId').value;
  if(!empId){toast('Select an employee','warning');return;}
  const emp=((await db.from('employees').select('name,branch,basic').eq('emp_id',empId).single()).data)||{};
  const lopDays=safeNum(document.getElementById('lvLopDays').value);
  const lopAmt=emp.basic>0?Math.round((safeNum(emp.basic)/30)*lopDays):0;
  ol(true,'Saving...');
  const{error}=await db.from('leave_entries').insert({
    emp_id:empId,emp_name:emp.name||'',branch:emp.branch||'',month,
    leave_type:document.getElementById('lvLeaveType').value,
    days_taken:safeNum(document.getElementById('lvDaysTaken').value),
    lop_days:lopDays,lop_amount:lopAmt,
    remarks:document.getElementById('lvRemarks').value
  });
  ol(false);
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Leave entry saved! LOP Amount: '+fmt(lopAmt),'success');
  await audit('Leave Entry',empId+' | '+month+' | LOP: '+lopDays+' days','Leave');
  loadLeaveReport();
}
async function loadLeaveReport(){
  const month=(document.getElementById('lvFilterMonth')||{}).value;
  const branch=(document.getElementById('lvFilterBranch')||{}).value;
  let q=db.from('leave_entries').select('*').order('created_at',{ascending:false});
  if(month&&month!=='All')q=q.eq('month',month);
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data}=await q;
  const tb=document.getElementById('leaveTable');
  if(!data||!data.length){tb.innerHTML='<tr><td colspan="8" class="text-center text-muted py-4">No leave records found</td></tr>';return;}
  tb.innerHTML=data.map(r=>`<tr><td>${r.month}</td><td><code>${r.emp_id}</code></td><td>${r.emp_name}</td>
    <td><span class="badge-branch">${r.branch}</span></td><td>${r.leave_type}</td>
    <td>${r.days_taken}</td><td>${r.lop_days}</td><td>${fmt(r.lop_amount)}</td></tr>`).join('');
}

// ============================================================
// PAYSLIP
// ============================================================
async function populatePayslipPage(){
  const{data}=await db.from('employees').select('emp_id,name,branch').eq('status','Active').order('name');
  const sel=document.getElementById('psEmpId');
  if(sel&&data) sel.innerHTML='<option value="">-- Select Employee --</option>'+data.map(e=>`<option value="${e.emp_id}">${e.emp_id} — ${e.name} (${e.branch})</option>`).join('');
}
async function generatePayslip(){
  const month=document.getElementById('psMonth').value;
  const empId=document.getElementById('psEmpId').value;
  if(!empId){toast('Select an employee','warning');return;}
  ol(true,'Generating payslip...');
  const[{data:sal},{data:emp}]=await Promise.all([
    db.from('salary_entries').select('*').eq('month',month).eq('emp_id',empId).single(),
    db.from('employees').select('*').eq('emp_id',empId).single()
  ]);
  ol(false);
  if(!sal){toast('No salary record found for this month','warning');return;}
  if(!emp){toast('Employee not found','error');return;}

  const co=allSettings;
  const html=`<div class="table-card">
    <div class="table-head"><h5><i class="fas fa-file-invoice"></i>Payslip — ${month}</h5>
    <button class="btn btn-sm btn-outline-light no-print" onclick="printPayslip()"><i class="fas fa-print mr-1"></i>Print</button></div>
    <div class="p-4" id="payslip-content">
      <div style="border:2px solid #1e3a5f;border-radius:8px;overflow:hidden">
        <div style="background:#1e3a5f;color:#fff;padding:16px 20px;text-align:center">
          <div style="font-size:1.1rem;font-weight:700">${co.COMPANY_NAME||'SUNRISE FREIGHT MOVERS PRIVATE LIMITED'}</div>
          <div style="font-size:.8rem;opacity:.8">${co.ADDRESS_LINE1||''} ${co.ADDRESS_LINE2||''} ${co.CITY_STATE_PIN||''}</div>
          <div style="margin-top:8px;background:rgba(255,255,255,.15);display:inline-block;padding:4px 18px;border-radius:20px;font-size:.85rem;font-weight:700">
            SALARY SLIP — ${month.toUpperCase()}
          </div>
        </div>
        <div style="padding:16px 20px;border-bottom:1px solid #e0e0e0">
          <div class="row">
            <div class="col-md-6"><table class="table table-sm mb-0" style="font-size:.83rem">
              <tr><th style="width:40%">Employee ID</th><td><strong>${emp.emp_id}</strong></td></tr>
              <tr><th>Name</th><td><strong>${emp.name}</strong></td></tr>
              <tr><th>Branch</th><td>${emp.branch}</td></tr>
              <tr><th>Designation</th><td>${emp.designation||'-'}</td></tr>
            </table></div>
            <div class="col-md-6"><table class="table table-sm mb-0" style="font-size:.83rem">
              <tr><th style="width:40%">Join Date</th><td>${emp.join_date||'-'}</td></tr>
              <tr><th>Department</th><td>${emp.department||'-'}</td></tr>
              <tr><th>Days Present</th><td>${sal.days_present} / ${sal.total_days}</td></tr>
              <tr><th>PAN</th><td>${emp.pan||'-'}</td></tr>
            </table></div>
          </div>
        </div>
        <div style="padding:16px 20px">
          <div class="row">
            <div class="col-md-4">
              <div style="font-size:.75rem;font-weight:700;color:#1e3a5f;text-transform:uppercase;margin-bottom:8px">Earnings</div>
              <table class="table table-sm" style="font-size:.83rem">
                <tr><td>Basic</td><td class="text-right">${fmt(sal.basic)}</td></tr>
                <tr><td>DA</td><td class="text-right">${fmt(sal.da)}</td></tr>
                <tr><td>HRA</td><td class="text-right">${fmt(sal.hra)}</td></tr>
                <tr><td>Conveyance</td><td class="text-right">${fmt(sal.conveyance)}</td></tr>
                <tr><td>Fooding</td><td class="text-right">${fmt(sal.fooding)}</td></tr>
                <tr><td>Others</td><td class="text-right">${fmt(sal.others)}</td></tr>
                ${sal.bonus>0?`<tr><td>Bonus</td><td class="text-right">${fmt(sal.bonus)}</td></tr>`:''}
                <tr style="border-top:2px solid #1e3a5f"><td><strong>Gross</strong></td><td class="text-right"><strong>${fmt(sal.gross)}</strong></td></tr>
              </table>
            </div>
            <div class="col-md-4">
              <div style="font-size:.75rem;font-weight:700;color:#1e3a5f;text-transform:uppercase;margin-bottom:8px">Deductions</div>
              <table class="table table-sm" style="font-size:.83rem">
                <tr><td>PF (Emp.)</td><td class="text-right">${fmt(sal.pf_emp)}</td></tr>
                <tr><td>ESI (Emp.)</td><td class="text-right">${fmt(sal.esi_emp)}</td></tr>
                <tr><td>Prof. Tax</td><td class="text-right">${fmt(sal.professional_tax)}</td></tr>
                <tr style="border-top:2px solid #e74c3c"><td><strong>Total Ded.</strong></td><td class="text-right"><strong>${fmt(sal.total_deductions)}</strong></td></tr>
              </table>
              <div style="font-size:.75rem;font-weight:700;color:#1e3a5f;text-transform:uppercase;margin-top:12px;margin-bottom:8px">Company Contrib.</div>
              <table class="table table-sm" style="font-size:.83rem">
                <tr><td>PF (Employer)</td><td class="text-right">${fmt(sal.co_pf)}</td></tr>
                <tr><td>ESI (Employer)</td><td class="text-right">${fmt(sal.co_esi)}</td></tr>
              </table>
            </div>
            <div class="col-md-4">
              <div style="background:#1e3a5f;color:#fff;border-radius:10px;padding:20px;text-align:center">
                <div style="font-size:.78rem;opacity:.7;margin-bottom:4px">NET SALARY</div>
                <div style="font-family:'Barlow Condensed',sans-serif;font-size:2rem;font-weight:800">${fmt(sal.net_salary+(sal.bonus||0))}</div>
                <div style="font-size:.72rem;margin-top:8px;opacity:.7">UAN: ${emp.uan||'N/A'}</div>
                <div style="font-size:.72rem;opacity:.7">ESI: ${emp.esi_number||'N/A'}</div>
              </div>
              <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-top:10px;font-size:.78rem">
                <div><strong>Bank A/C:</strong> ${emp.bank_account||'N/A'}</div>
                <div><strong>IFSC:</strong> ${emp.ifsc||'N/A'}</div>
                <div><strong>Status:</strong> ${sal.status}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="background:#f8f9fa;padding:10px 20px;text-align:center;font-size:.72rem;color:#888;border-top:1px solid #e0e0e0">
          This is a computer-generated payslip. — ${co.COMPANY_NAME||'SUNRISE FREIGHT MOVERS PRIVATE LIMITED'}
        </div>
      </div>
    </div>
  </div>`;
  document.getElementById('payslipOutput').innerHTML=html;
}

function printPayslip(){
  const content=document.getElementById('payslip-content');
  if(!content)return;
  const pz=document.getElementById('payslip-print-zone');
  pz.innerHTML=content.innerHTML;
  window.print();
}

// ============================================================
// ATTENDANCE OVERVIEW
// ============================================================
async function loadAttOverview(){
  const month=document.getElementById('attMonth').value;
  const branch=document.getElementById('attBranchFilter').value;
  if(!month){toast('Select a month','warning');return;}
  const[yr,mo]=month.split('-');
  const start=`${yr}-${mo}-01`;
  const end=`${yr}-${mo}-${new Date(yr,mo,0).getDate()}`;
  ol(true,'Loading attendance...');
  let q=db.from('attendance').select('branch_code,emp_id,att_date,status').gte('att_date',start).lte('att_date',end).order('att_date');
  if(branch&&branch!=='All')q=q.eq('branch_code',branch);
  const{data}=await q;
  const{data:emps}=await db.from('employees').select('emp_id,name,branch').order('name');
  ol(false);

  if(!data||!data.length){document.getElementById('attOverviewContent').innerHTML='<div class="text-center text-muted py-5">No attendance data for this period.</div>';return;}

  // Summary by branch
  const byBranch={};
  data.forEach(r=>{
    if(!byBranch[r.branch_code])byBranch[r.branch_code]={P:0,A:0,H:0,L:0,dates:new Set()};
    byBranch[r.branch_code][r.status[0]]=(byBranch[r.branch_code][r.status[0]]||0)+1;
    byBranch[r.branch_code].dates.add(r.att_date);
  });

  const empMap={};(emps||[]).forEach(e=>empMap[e.emp_id]=e.name);

  let html=`<div class="table-card mb-3"><div class="table-head"><h5><i class="fas fa-chart-bar"></i>Branch Summary</h5></div>
    <div class="table-responsive"><table class="table table-hover mb-0">
    <thead><tr><th>Branch</th><th>Days Submitted</th><th>Present</th><th>Half Day</th><th>Absent</th><th>Leave</th></tr></thead>
    <tbody>`;
  Object.entries(byBranch).forEach(([br,s])=>{
    html+=`<tr><td><span class="badge-branch">${br}</span></td><td>${s.dates.size}</td>
      <td><span style="color:var(--green);font-weight:700">${s.P||0}</span></td>
      <td><span style="color:#d68910;font-weight:700">${s.H||0}</span></td>
      <td><span style="color:var(--red);font-weight:700">${s.A||0}</span></td>
      <td><span style="color:#7d3c98;font-weight:700">${s.L||0}</span></td></tr>`;
  });
  html+=`</tbody></table></div></div>`;

  // Detail table
  const byDate={};
  data.forEach(r=>{if(!byDate[r.att_date])byDate[r.att_date]=[];byDate[r.att_date].push(r);});
  html+=`<div class="table-card"><div class="table-head"><h5><i class="fas fa-list"></i>Daily Detail</h5></div>
    <div class="table-responsive" style="max-height:500px;overflow-y:auto"><table class="table table-sm mb-0">
    <thead><tr><th>Date</th><th>Branch</th><th>Emp ID</th><th>Name</th><th>Status</th></tr></thead><tbody>`;
  Object.keys(byDate).sort().reverse().forEach(date=>{
    const d=new Date(date+'T00:00:00');
    byDate[date].forEach(r=>{
      const sc={Present:'P',Absent:'A','Half Day':'H',Leave:'L'}[r.status]||'';
      html+=`<tr><td style="white-space:nowrap;font-size:.8rem">${d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</td>
        <td><span class="badge-branch">${r.branch_code}</span></td>
        <td><code style="font-size:.78rem">${r.emp_id}</code></td><td>${empMap[r.emp_id]||r.emp_id}</td>
        <td><span class="badge ${sc}">${r.status}</span></td></tr>`;
    });
  });
  html+=`</tbody></table></div></div>`;
  document.getElementById('attOverviewContent').innerHTML=html;
}

async function exportAttCsv(){
  const month=document.getElementById('attMonth').value;
  if(!month){toast('Select a month first','warning');return;}
  const[yr,mo]=month.split('-');
  const{data}=await db.from('attendance').select('*').gte('att_date',`${yr}-${mo}-01`).lte('att_date',`${yr}-${mo}-${new Date(yr,mo,0).getDate()}`).order('att_date');
  if(!data||!data.length){toast('No data to export','warning');return;}
  const csv='Branch,Emp ID,Date,Status\n'+data.map(r=>`${r.branch_code},${r.emp_id},${r.att_date},${r.status}`).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Attendance_${month}.csv`;a.click();
  toast('CSV downloaded!','success');
}

// ============================================================
// BRANCH ACCESS MANAGEMENT
// ============================================================
async function loadBranchAccessTable(){
  ol(true,'Loading branch access...');
  const[{data:pins},{data:sessions},{data:brs}]=await Promise.all([
    db.from('branch_users').select('*'),
    db.from('attendance_sessions').select('*'),
    db.from('branches').select('*')
  ]);
  ol(false);
  const pinMap={};(pins||[]).forEach(p=>pinMap[p.branch_code]=p);
  const sessMap={};(sessions||[]).forEach(s=>sessMap[s.branch_code]=s);

  const todayStr=new Date().toISOString().split('T')[0];
  const tb=document.getElementById('branchAccessTable');
  tb.innerHTML=BRANCHES.map(br=>{
    const pin=pinMap[br];
    const sess=sessMap[br];
    let lastSub=sess?sess.last_submitted_date:'Never';
    // Lockout check
    let locked=false;
    if(sess&&sess.last_submitted_date&&sess.last_submitted_date!==todayStr){
      const todayDow=new Date(todayStr+'T00:00:00').getDay();
      if(todayDow!==1){ // Not Monday
        const prevDay=getPrevWorkingDayAdmin(todayStr);
        if(sess.last_submitted_date!==prevDay) locked=true;
      }
    }
    return `<tr>
      <td><strong>${br}</strong></td>
      <td><small class="text-muted">${BRANCH_STATE_MAP[br]||'-'}</small></td>
      <td>${pin?'<span class="badge-status-active">PIN Set</span>':'<span class="badge-status-inactive">No PIN</span>'}</td>
      <td><small>${lastSub}</small></td>
      <td>${locked?'<span class="badge-status-inactive">🔒 Locked</span>':'<span class="badge-status-active">✅ Open</span>'}</td>
      <td>
        <button class="btn btn-xs btn-outline-primary mr-1" onclick="openSetPin('${br}')"><i class="fas fa-key"></i> ${pin?'Change':'Set'} PIN</button>
        ${locked?`<button class="btn btn-xs btn-outline-success" onclick="unlockBranch('${br}')"><i class="fas fa-unlock"></i> Unlock</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function getPrevWorkingDayAdmin(dateStr){
  const d=new Date(dateStr+'T00:00:00');
  do{d.setDate(d.getDate()-1);}while(d.getDay()===0);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function openSetPin(branch){
  pinBranchTarget=branch;
  document.getElementById('pinBranchLabel').textContent=branch;
  document.getElementById('pinInput').value='';
  $('#setPinModal').modal('show');
}
async function saveBranchPin(){
  const pin=document.getElementById('pinInput').value.trim();
  if(!pin){toast('Enter a PIN','warning');return;}
  ol(true,'Saving PIN...');
  const{error}=await db.from('branch_users').upsert({branch_code:pinBranchTarget,pin,status:'Active'},{onConflict:'branch_code'});
  ol(false);
  if(error){toast('Error: '+error.message,'error');return;}
  toast('PIN saved for '+pinBranchTarget,'success');
  $('#setPinModal').modal('hide');
  await audit('Branch PIN Set','PIN set for '+pinBranchTarget,'Attendance');
  loadBranchAccessTable();
}
async function unlockBranch(branch){
  if(!confirm('Unlock attendance for '+branch+'? This will allow them to submit today.'))return;
  ol(true,'Unlocking...');
  await db.from('attendance_sessions').upsert({branch_code:branch,last_submitted_date:getPrevWorkingDayAdmin(new Date().toISOString().split('T')[0]),updated_at:new Date().toISOString()},{onConflict:'branch_code'});
  ol(false);
  toast(branch+' attendance unlocked!','success');
  await audit('Branch Unlocked','Admin unlocked attendance for '+branch,'Attendance');
  loadBranchAccessTable();
}

// ============================================================
// MONTHLY REPORT
// ============================================================
async function loadMonthlyReport(){
  const month=document.getElementById('reportMonth').value;
  const branch=(document.getElementById('reportBranchFilter')||{}).value||'All';
  if(!month){toast('Select a month','warning');return;}
  ol(true,'Loading monthly report...');
  let q=db.from('salary_entries').select('*').eq('month',month).order('branch').order('name');
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data}=await q;
  ol(false);
  if(!data||!data.length){document.getElementById('monthlyReportContent').innerHTML='<div class="text-center text-muted py-5">No salary data for '+month+'</div>';return;}
  const total=r=>safeNum(r.net_salary)+(safeNum(r.bonus)||0);
  const grandNet=data.reduce((s,r)=>s+total(r),0);
  const grandGross=data.reduce((s,r)=>s+safeNum(r.gross),0);
  let html=`<div class="row mb-3">
    <div class="col-md-3 mb-2"><div class="stat-card"><div class="sv">${data.length}</div><div class="sl">Employees</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#27ae60"><div class="sv" style="font-size:1.2rem">${fmt(grandGross)}</div><div class="sl">Total Gross</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#8b5cf6"><div class="sv" style="font-size:1.2rem">${fmt(grandNet)}</div><div class="sl">Total Net</div></div></div>
  </div>
  <div class="table-card"><div class="table-head"><h5><i class="fas fa-table"></i>Salary Register — ${month}</h5></div>
  <div class="table-responsive"><table class="table table-hover table-sm mb-0">
    <thead><tr><th>#</th><th>Emp ID</th><th>Name</th><th>Branch</th><th>Days</th><th>Gross</th><th>PF</th><th>ESI</th><th>PT</th><th>Total Ded.</th><th>Net</th><th>Bonus</th></tr></thead>
    <tbody>`;
  data.forEach((r,i)=>{
    html+=`<tr><td>${i+1}</td><td><code style="font-size:.78rem">${r.emp_id}</code></td><td>${r.name}</td>
      <td><span class="badge-branch">${r.branch}</span></td>
      <td>${r.days_present}/${r.total_days}</td>
      <td>${fmt(r.gross)}</td><td>${fmt(r.pf_emp)}</td><td>${fmt(r.esi_emp)}</td>
      <td>${fmt(r.professional_tax)}</td><td>${fmt(r.total_deductions)}</td>
      <td><strong>${fmt(r.net_salary)}</strong></td><td>${r.bonus>0?fmt(r.bonus):'—'}</td></tr>`;
  });
  html+=`<tr style="background:var(--navy);color:#fff;font-weight:700"><td colspan="4">TOTAL</td>
    <td>—</td><td>${fmt(grandGross)}</td>
    <td>${fmt(data.reduce((s,r)=>s+safeNum(r.pf_emp),0))}</td>
    <td>${fmt(data.reduce((s,r)=>s+safeNum(r.esi_emp),0))}</td>
    <td>${fmt(data.reduce((s,r)=>s+safeNum(r.professional_tax),0))}</td>
    <td>${fmt(data.reduce((s,r)=>s+safeNum(r.total_deductions),0))}</td>
    <td>${fmt(grandNet)}</td><td>—</td></tr>
    </tbody></table></div></div>`;
  document.getElementById('monthlyReportContent').innerHTML=html;
}

async function exportMonthlyCsv(){
  const month=document.getElementById('reportMonth').value;
  if(!month){toast('Select a month first','warning');return;}
  const{data}=await db.from('salary_entries').select('*').eq('month',month).order('branch').order('name');
  if(!data||!data.length){toast('No data for this month','warning');return;}
  const headers='SL,Month,Emp ID,Branch,Name,Basic,DA,HRA,Conveyance,Fooding,Others,Gross,Days,PF Salary,PF Emp,ESI Emp,PT,Total Ded.,Net,Co.PF,Co.ESI,Bonus,Status';
  const csv=headers+'\n'+data.map((r,i)=>`${i+1},${r.month},${r.emp_id},${r.branch},"${r.name}",${r.basic},${r.da},${r.hra},${r.conveyance},${r.fooding},${r.others},${r.gross},${r.days_present},${r.pf_salary},${r.pf_emp},${r.esi_emp},${r.professional_tax},${r.total_deductions},${r.net_salary},${r.co_pf},${r.co_esi},${r.bonus||0},${r.status}`).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`SalaryRegister_${month.replace(/ /g,'_')}.csv`;a.click();
  toast('CSV downloaded!','success');
}

// ============================================================
// YEARLY REPORT
// ============================================================
async function loadYearlyReport(){
  const branch=document.getElementById('yearlyBranch').value;
  ol(true,'Loading yearly report...');
  let q=db.from('salary_entries').select('emp_id,name,branch,month,gross,net_salary,pf_emp,esi_emp,co_pf,co_esi,professional_tax,total_deductions,bonus');
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data}=await q;
  ol(false);
  if(!data||!data.length){document.getElementById('yearlyReportContent').innerHTML='<div class="text-center text-muted py-5">No data found.</div>';return;}
  // Build emp × month matrix
  const empMap={};
  data.forEach(r=>{
    if(!empMap[r.emp_id])empMap[r.emp_id]={name:r.name,branch:r.branch,months:{}};
    empMap[r.emp_id].months[r.month]=r;
  });
  let html=`<div class="table-card"><div class="table-head"><h5><i class="fas fa-chart-bar"></i>Yearly Salary Register — FY 2026-27</h5></div>
  <div class="table-responsive"><table class="table table-sm mb-0" style="font-size:.75rem">
    <thead><tr><th>Emp ID</th><th>Name</th><th>Branch</th>${MONTHS.map(m=>`<th style="white-space:nowrap">${m.split(' ')[0].substring(0,3)}</th>`).join('')}<th>Total Net</th></tr></thead>
    <tbody>`;
  Object.entries(empMap).forEach(([eid,e])=>{
    const totNet=MONTHS.reduce((s,m)=>s+safeNum((e.months[m]||{}).net_salary),0);
    html+=`<tr><td><code>${eid}</code></td><td>${e.name}</td><td><span class="badge-branch">${e.branch}</span></td>`;
    MONTHS.forEach(m=>{const r=e.months[m];html+=`<td>${r?fmt(r.net_salary).replace('₹',''):'—'}</td>`;});
    html+=`<td><strong>${fmt(totNet)}</strong></td></tr>`;
  });
  html+=`</tbody></table></div></div>`;
  document.getElementById('yearlyReportContent').innerHTML=html;
}

// ============================================================
// PF & ESI SUMMARY
// ============================================================
async function loadPfEsi(){
  const month=(document.getElementById('pfesiMonth')||{}).value||'All';
  ol(true,'Loading PF/ESI...');
  let q=db.from('salary_entries').select('month,emp_id,name,branch,pf_salary,pf_emp,co_pf,esi_emp,co_esi,gross');
  if(month&&month!=='All')q=q.eq('month',month);
  const{data}=await q;
  ol(false);
  if(!data||!data.length){document.getElementById('pfesiContent').innerHTML='<div class="text-center text-muted py-5">No data found.</div>';return;}
  const totPfEmp=data.reduce((s,r)=>s+safeNum(r.pf_emp),0);
  const totPfEr=data.reduce((s,r)=>s+safeNum(r.co_pf),0);
  const totEsiEmp=data.reduce((s,r)=>s+safeNum(r.esi_emp),0);
  const totEsiEr=data.reduce((s,r)=>s+safeNum(r.co_esi),0);
  let html=`<div class="row mb-3">
    <div class="col-md-3 mb-2"><div class="stat-card"><div class="sv" style="font-size:1.1rem">${fmt(totPfEmp)}</div><div class="sl">PF Employee Total</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#27ae60"><div class="sv" style="font-size:1.1rem">${fmt(totPfEr)}</div><div class="sl">PF Employer Total</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#f39c12"><div class="sv" style="font-size:1.1rem">${fmt(totPfEmp+totPfEr)}</div><div class="sl">PF Grand Total</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#8b5cf6"><div class="sv" style="font-size:1.1rem">${fmt(totEsiEmp+totEsiEr)}</div><div class="sl">ESI Grand Total</div></div></div>
  </div>
  <div class="table-card"><div class="table-head"><h5><i class="fas fa-shield-alt"></i>PF &amp; ESI Detail</h5></div>
  <div class="table-responsive"><table class="table table-hover table-sm mb-0">
    <thead><tr><th>Month</th><th>Emp ID</th><th>Name</th><th>Branch</th><th>Gross</th><th>PF Wage</th><th>PF Emp.</th><th>PF Employer</th><th>ESI Emp.</th><th>ESI Employer</th></tr></thead>
    <tbody>`;
  data.forEach(r=>{
    html+=`<tr><td>${r.month}</td><td><code style="font-size:.78rem">${r.emp_id}</code></td><td>${r.name}</td>
      <td><span class="badge-branch">${r.branch}</span></td>
      <td>${fmt(r.gross)}</td><td>${fmt(r.pf_salary)}</td><td>${fmt(r.pf_emp)}</td>
      <td>${fmt(r.co_pf)}</td><td>${fmt(r.esi_emp)}</td><td>${fmt(r.co_esi)}</td></tr>`;
  });
  html+=`</tbody></table></div></div>`;
  document.getElementById('pfesiContent').innerHTML=html;
}

// ============================================================
// GRATUITY
// ============================================================
async function loadGratuity(){
  const branch=(document.getElementById('gratuityBranch')||{}).value||'All';
  ol(true,'Calculating gratuity...');
  let q=db.from('employees').select('emp_id,name,branch,designation,basic,da,join_date,status');
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data}=await q;
  ol(false);
  if(!data||!data.length){document.getElementById('gratuityContent').innerHTML='<div class="text-center text-muted py-5">No employee data.</div>';return;}
  const now=new Date();
  const records=data.filter(e=>e.join_date).map(e=>{
    const jd=new Date(e.join_date);
    const yrs=(now-jd)/(1000*60*60*24*365.25);
    const cmpYrs=Math.floor(yrs);
    const eligible=yrs>=5;
    const base=safeNum(e.basic)+safeNum(e.da);
    const grat=eligible?Math.round(base*(15/26)*cmpYrs):0;
    return{...e,yrs:yrs.toFixed(2),cmpYrs,eligible,base,grat,proj5:Math.round(base*(15/26)*5)};
  }).sort((a,b)=>parseFloat(b.yrs)-parseFloat(a.yrs));

  const totLiability=records.reduce((s,r)=>s+r.grat,0);
  let html=`<div class="row mb-3"><div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#d4ac0d"><div class="sv" style="font-size:1.1rem">${fmt(totLiability)}</div><div class="sl">Total Gratuity Liability</div></div></div></div>
  <div class="table-card"><div class="table-head"><h5><i class="fas fa-medal"></i>Gratuity Tracker</h5></div>
  <div class="table-responsive"><table class="table table-hover table-sm mb-0">
    <thead><tr><th>Emp ID</th><th>Name</th><th>Branch</th><th>Designation</th><th>Join Date</th><th>Years</th><th>Basic+DA</th><th>Eligible</th><th>Gratuity</th><th>5-yr Projection</th></tr></thead>
    <tbody>`;
  records.forEach(r=>{
    html+=`<tr>
      <td><code style="font-size:.78rem">${r.emp_id}</code></td><td>${r.name}</td>
      <td><span class="badge-branch">${r.branch}</span></td><td>${r.designation||'-'}</td>
      <td>${r.join_date}</td><td><strong>${r.yrs}</strong></td>
      <td>${fmt(r.base)}</td>
      <td>${r.eligible?'<span class="badge-status-active">Yes</span>':'<span class="badge-status-inactive">No (< 5yr)</span>'}</td>
      <td style="color:${r.eligible?'#27ae60':'#aaa'};font-weight:${r.eligible?700:400}">${r.eligible?fmt(r.grat):'—'}</td>
      <td style="color:#2980b9">${fmt(r.proj5)}</td>
    </tr>`;
  });
  html+=`</tbody></table></div></div>`;
  document.getElementById('gratuityContent').innerHTML=html;
}

// ============================================================
// BANK TRANSFER
// ============================================================
async function loadBankData(){
  const month=document.getElementById('bankMonth').value;
  const branch=document.getElementById('bankBranch').value||'All';
  if(!month){toast('Select a month','warning');return;}
  ol(true,'Generating bank statement...');
  let q=db.from('salary_entries').select('emp_id,name,branch,net_salary,bonus').eq('month',month).order('branch').order('name');
  if(branch&&branch!=='All')q=q.eq('branch',branch);
  const{data:sal}=await q;
  const empIds=(sal||[]).map(r=>r.emp_id);
  const{data:emps}=await db.from('employees').select('emp_id,bank_account,ifsc').in('emp_id',empIds);
  ol(false);
  if(!sal||!sal.length){document.getElementById('bankContent').innerHTML='<div class="alert alert-warning">No salary data for '+month+'</div>';return;}
  const empMap={};(emps||[]).forEach(e=>empMap[e.emp_id]=e);
  const records=sal.map((r,i)=>{
    const emp=empMap[r.emp_id]||{};
    return{...r,bank_account:emp.bank_account||'N/A',ifsc:emp.ifsc||'N/A',net:safeNum(r.net_salary)+safeNum(r.bonus),sl:i+1};
  });
  const totalAmt=records.reduce((s,r)=>s+r.net,0);
  const missing=records.filter(r=>r.bank_account==='N/A').length;
  bankCsvData='SL,Emp ID,Name,Branch,Bank Account,IFSC,Net Amount\n'+records.map(r=>`${r.sl},${r.emp_id},"${r.name}",${r.branch},${r.bank_account},${r.ifsc},${r.net}`).join('\n');
  bankCsvFilename=`BankTransfer_${month.replace(/ /g,'_')}.csv`;
  document.getElementById('btnDownloadBank').style.display='';

  let html=`<div class="row mb-3">
    <div class="col-md-3 mb-2"><div class="stat-card"><div class="sv">${records.length}</div><div class="sl">Employees</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#27ae60"><div class="sv" style="font-size:1.1rem">${fmt(totalAmt)}</div><div class="sl">Total Transfer</div></div></div>
    <div class="col-md-3 mb-2"><div class="stat-card" style="border-left-color:#e74c3c"><div class="sv">${missing}</div><div class="sl">Missing Bank Details</div></div></div>
  </div>
  ${missing>0?`<div class="alert alert-warning py-2 mb-3" style="font-size:.83rem"><i class="fas fa-exclamation-triangle mr-2"></i><strong>${missing} employees</strong> missing bank details. Update in Employee Master.</div>`:''}
  <div class="table-card"><div class="table-head"><h5><i class="fas fa-university"></i>NEFT/RTGS Transfer List — ${month}</h5></div>
  <div class="table-responsive"><table class="table table-hover table-sm mb-0">
    <thead><tr><th>#</th><th>Emp ID</th><th>Name</th><th>Branch</th><th>Bank Account</th><th>IFSC</th><th>Net Amount</th></tr></thead>
    <tbody>`;
  records.forEach(r=>{
    const miss=r.bank_account==='N/A';
    html+=`<tr${miss?' style="background:#fff3cd"':''}>
      <td>${r.sl}</td><td><code style="font-size:.78rem">${r.emp_id}</code></td><td>${r.name}</td>
      <td><span class="badge-branch">${r.branch}</span></td>
      <td>${miss?'<span class="text-danger"><i class="fas fa-exclamation-circle"></i> Missing</span>':r.bank_account}</td>
      <td>${r.ifsc}</td><td><strong>${fmt(r.net)}</strong></td></tr>`;
  });
  html+=`<tr style="background:var(--navy);color:#fff;font-weight:700"><td colspan="6">TOTAL</td><td>${fmt(totalAmt)}</td></tr>
    </tbody></table></div></div>`;
  document.getElementById('bankContent').innerHTML=html;
}
function downloadBankCsv(){if(!bankCsvData){toast('Generate statement first','warning');return;}const blob=new Blob([bankCsvData],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=bankCsvFilename;a.click();toast('CSV downloaded!','success');}

// ============================================================
// BRANCHES
// ============================================================
async function loadBranches(){
  const{data}=await db.from('branches').select('*').order('code');
  const tb=document.getElementById('branchTable');
  if(!data||!data.length){tb.innerHTML='<tr><td colspan="3" class="text-center text-muted py-4">No branches</td></tr>';return;}
  tb.innerHTML=data.map(b=>`<tr><td><strong>${b.code}</strong></td><td>${b.state}</td>
    <td><span class="${b.status==='Active'?'badge-status-active':'badge-status-inactive'}">${b.status}</span></td></tr>`).join('');
}

// ============================================================
// ADMIN USERS
// ============================================================
async function loadAdminUsers(){
  const{data}=await db.from('admins').select('*').order('created_at',{ascending:false});
  const tb=document.getElementById('usersTable');
  if(!data||!data.length){tb.innerHTML='<tr><td colspan="6" class="text-center text-muted py-4">No admins found</td></tr>';return;}
  tb.innerHTML=data.map(a=>`<tr>
    <td><strong>${a.username}</strong></td><td>${a.full_name}</td>
    <td><span class="badge-branch">${a.role}</span></td>
    <td><span class="${a.status==='Active'?'badge-status-active':'badge-status-inactive'}">${a.status}</span></td>
    <td style="font-size:.78rem">${new Date(a.created_at).toLocaleDateString('en-IN')}</td>
    <td>
      ${a.username!==user.username?`<button class="btn btn-xs btn-outline-danger" onclick="deactivateAdmin('${a.id}','${a.username}')"><i class="fas fa-ban"></i></button>`:'<small class="text-muted">(you)</small>'}
    </td></tr>`).join('');
}

function openAddAdmin(){$('#addAdminModal').modal('show');}
async function submitAddAdmin(){
  const name=document.getElementById('newAdminName').value.trim();
  const username=document.getElementById('newAdminUsername').value.trim();
  const pass=document.getElementById('newAdminPassword').value;
  const role=document.getElementById('newAdminRole').value;
  if(!name||!username||!pass){toast('All fields required','warning');return;}
  ol(true,'Adding admin...');
  const{error}=await db.from('admins').insert({username,password_hash:pass,full_name:name,role,status:'Active'});
  ol(false);
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Admin '+username+' added!','success');
  $('#addAdminModal').modal('hide');
  await audit('Admin Added',username+' ('+role+')','Users');
  loadAdminUsers();
}
async function deactivateAdmin(id,username){
  if(!confirm('Deactivate admin "'+username+'"?'))return;
  await db.from('admins').update({status:'Inactive'}).eq('id',id);
  toast('Admin deactivated','success');
  await audit('Admin Deactivated',username,'Users');
  loadAdminUsers();
}

// ============================================================
// AUDIT LOG
// ============================================================
async function loadAuditLog(){
  const from=document.getElementById('auditFromDate').value;
  const to=document.getElementById('auditToDate').value;
  let q=db.from('audit_log').select('*').order('timestamp',{ascending:false}).limit(200);
  if(from)q=q.gte('timestamp',from);
  if(to)q=q.lte('timestamp',to+'T23:59:59');
  const{data}=await q;
  const tb=document.getElementById('auditTable');
  if(!data||!data.length){tb.innerHTML='<tr><td colspan="5" class="text-center text-muted py-4">No audit records found</td></tr>';return;}
  tb.innerHTML=data.map(l=>`<tr>
    <td style="font-size:.78rem;white-space:nowrap">${new Date(l.timestamp).toLocaleString('en-IN')}</td>
    <td style="font-size:.8rem">${l.user_name||'-'}</td>
    <td>${l.action}</td>
    <td style="font-size:.8rem;color:var(--muted)">${l.details||''}</td>
    <td><span class="badge-branch">${l.module||'-'}</span></td>
  </tr>`).join('');
}

async function audit(action,details,module){
  await db.from('audit_log').insert({user_name:user.name,action,details,module});
}

// ============================================================
// CSV IMPORT / EXPORT
// ============================================================
function downloadEmpTemplate(){
  const headers='emp_id,name,branch,designation,department,status,join_date,basic,da,hra,conveyance,fooding,other_allowance,pf_applicable,esi_applicable,custom_pf_salary,pan,uan,esi_number,phone,email,bank_account,ifsc,addr1,addr2,city,state,pin';
  const sample='EMP001,John Doe,BNG,Manager,Operations,Active,2020-01-01,20000,2000,5000,1600,1000,500,Basic Salary,Yes,0,ABCDE1234F,1234567890,1234567890,9876543210,john@example.com,1234567890,SBIN0001234,123 Main St,,Bengaluru,Karnataka,560001';
  const csv=headers+'\n'+sample;
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Employee_Import_Template.csv';a.click();
  toast('Template downloaded!','success');
}

function parseAndImportCsv(){
  const file=document.getElementById('importFile').files[0];
  if(!file){toast('Select a CSV file','warning');return;}
  const reader=new FileReader();
  reader.onload=async function(e){
    const text=e.target.result;
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
    if(lines.length<2){toast('CSV is empty','error');return;}
    const headers=lines[0].split(',').map(h=>h.trim());
    const rows=lines.slice(1).map(line=>{
      const vals=[];let cur='',inQ=false;
      for(const ch of line){if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=ch;}
      vals.push(cur.trim());
      const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||'');
      return obj;
    });

    // Preview
    document.getElementById('importPreview').style.display='block';
    document.getElementById('importPreview').innerHTML=`<strong>${rows.length} employees to import:</strong><br>${rows.slice(0,5).map(r=>r.name+' ('+r.emp_id+')').join('<br>')}${rows.length>5?'<br>...and '+(rows.length-5)+' more':''}`;

    if(!confirm(`Import ${rows.length} employees? Existing employees with same emp_id will be updated.`))return;
    ol(true,'Importing employees...');
    const toUpsert=rows.map(r=>({
      emp_id:r.emp_id||'',name:r.name||'',branch:r.branch||'',
      designation:r.designation||'',department:r.department||'',
      status:r.status||'Active',join_date:r.join_date||null,
      basic:safeNum(r.basic),da:safeNum(r.da),hra:safeNum(r.hra),
      conveyance:safeNum(r.conveyance),fooding:safeNum(r.fooding),
      other_allowance:safeNum(r.other_allowance),
      pf_applicable:r.pf_applicable||'Basic Salary',esi_applicable:r.esi_applicable||'Yes',
      custom_pf_salary:safeNum(r.custom_pf_salary),
      pan:(r.pan||'').toUpperCase(),uan:r.uan||'',esi_number:r.esi_number||'',
      phone:r.phone||'',email:r.email||'',bank_account:r.bank_account||'',
      ifsc:(r.ifsc||'').toUpperCase(),addr1:r.addr1||'',addr2:r.addr2||'',
      city:r.city||'',state:r.state||'',pin:r.pin||'',
      updated_at:new Date().toISOString()
    })).filter(r=>r.emp_id&&r.name);

    const{error}=await db.from('employees').upsert(toUpsert,{onConflict:'emp_id'});
    ol(false);
    if(error){toast('Import error: '+error.message,'error');return;}
    toast(`${toUpsert.length} employees imported successfully!`,'success');
    await audit('CSV Import',toUpsert.length+' employees imported','Employees');
    loadEmployees();
  };
  reader.readAsText(file);
}

async function exportEmpCsv(){
  const{data}=await db.from('employees').select('*').order('branch').order('name');
  if(!data||!data.length){toast('No employees to export','warning');return;}
  const headers='emp_id,name,branch,designation,department,status,join_date,basic,da,hra,conveyance,fooding,other_allowance,pf_applicable,esi_applicable,pan,uan,esi_number,phone,email,bank_account,ifsc';
  const csv=headers+'\n'+data.map(e=>`${e.emp_id},"${e.name}",${e.branch},"${e.designation||''}","${e.department||''}",${e.status},${e.join_date||''},${e.basic},${e.da},${e.hra},${e.conveyance},${e.fooding},${e.other_allowance},${e.pf_applicable},${e.esi_applicable},${e.pan||''},${e.uan||''},${e.esi_number||''},${e.phone||''},${e.email||''},${e.bank_account||''},${e.ifsc||''}`).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Employees_Export.csv';a.click();
  toast('Employee list exported!','success');
}
