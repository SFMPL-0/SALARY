# Salary & HR System
### Supabase + GitHub Pages Edition | FY 2026-27

---

## FILES IN THIS FOLDER

| File | Purpose |
|------|---------|
| `index.html` | Login page (Admin + Branch users) |
| `admin.html` | Full salary management system |
| `admin.js` | All admin logic (Supabase queries) |
| `attendance.html` | Branch-only attendance portal |
| `config.js` | **Your Supabase URL + Key go here** |
| `supabase-schema.sql` | Run once in Supabase to create all tables |
| `README.md` | This file |

---

## STEP 1 — CREATE SUPABASE PROJECT

1. Go to **https://supabase.com** → Sign up (free)
2. Click **"New project"**
3. Name: `sfm-salary` | Password: (save this!) | Region: **Southeast Asia (Singapore)**
4. Wait ~2 minutes for project to be ready

---

## STEP 2 — RUN THE DATABASE SCHEMA

1. In Supabase → left sidebar → **SQL Editor**
2. Click **"New query"**
3. Open `supabase-schema.sql` from this folder
4. Copy ALL the content → paste into the SQL editor
5. Click **"Run"** (green button)
6. You should see: `Success. No rows returned`

✅ All tables are now created.

---

## STEP 3 — GET YOUR SUPABASE CREDENTIALS

1. In Supabase → left sidebar → **Settings** → **API**
2. Copy these two values:

| What | Where to find it |
|------|----------------|
| **Project URL** | Under "Project URL" — looks like `https://xyzabcdef.supabase.co` |
| **anon public key** | Under "Project API keys" → `anon` `public` |

---

## STEP 4 — UPDATE config.js

Open `config.js` and replace the placeholder values:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';   // ← paste your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';          // ← paste your anon key
```

Save the file.

---

## STEP 5 — DEPLOY TO GITHUB PAGES (FREE HOSTING)

### 5a. Create a GitHub account
Go to **https://github.com** → Sign up (free)

### 5b. Create a new repository
1. Click **"+"** → **"New repository"**
2. Name: `sfm-salary` (or any name)
3. Set to **Public** (required for free GitHub Pages)
4. Click **"Create repository"**

### 5c. Upload your files
1. On the repository page → click **"uploading an existing file"**
2. Drag and drop ALL 7 files from this folder:
   - `index.html`
   - `admin.html`
   - `admin.js`
   - `attendance.html`
   - `config.js`
   - `supabase-schema.sql` *(optional, just for backup)*
   - `README.md` *(optional)*
3. Scroll down → click **"Commit changes"**

### 5d. Enable GitHub Pages
1. In your repository → click **"Settings"** tab
2. Left sidebar → **"Pages"**
3. Under "Branch" → select **`main`** → folder: **`/ (root)`**
4. Click **"Save"**
5. Wait ~1 minute

### 5e. Get your URL
GitHub will show your site URL:
```
https://YOUR-GITHUB-USERNAME.github.io/sfm-salary/
```

**Bookmark this URL — this is your system!**

---

## STEP 6 — FIRST LOGIN

Open your GitHub Pages URL. You'll see the login page.

### Default Admin Login:
- **Username:** `admin`
- **Password:** `admin123`

⚠️ **CHANGE THIS IMMEDIATELY** after first login:
- Go to **Admin Users** in sidebar → Add a new admin with your own username/password
- Then deactivate the default `admin` account

---

## STEP 7 — SET UP BRANCH ATTENDANCE ACCESS

For each branch that needs attendance access:

1. Login as Admin → sidebar → **"Manage Branch Access"**
2. Find the branch → click **"Set PIN"**
3. Enter a PIN (e.g., `1234` or `BNG001`)
4. Share the branch code + PIN with the branch staff

Branch users login at the same URL → click **"Branch Login"** tab

---

## STEP 8 — IMPORT YOUR EMPLOYEES

1. Admin → sidebar → **"CSV Import"**
2. Click **"Download Employee Template"** → fill in your employee data
3. Upload the filled CSV → click **"Import Employees"**

### CSV Column Guide:
| Column | Example | Notes |
|--------|---------|-------|
| emp_id | BNG001 | Must be unique |
| name | John Doe | Full name |
| branch | BNG | Must match branch codes |
| designation | Manager | Optional |
| department | Operations | Optional |
| status | Active | Active / Inactive / Resigned |
| join_date | 2020-01-15 | YYYY-MM-DD format |
| basic | 20000 | Numbers only, no ₹ sign |
| da | 2000 | |
| hra | 5000 | |
| conveyance | 1600 | |
| fooding | 1000 | |
| other_allowance | 500 | |
| pf_applicable | Basic Salary | "Basic Salary" / "No" / "Custom" |
| esi_applicable | Yes | "Yes" / "No" |
| custom_pf_salary | 0 | Only if pf_applicable = Custom |
| pan | ABCDE1234F | Uppercase |
| uan | 100123456789 | Optional |
| esi_number | 1234567890 | Optional |
| phone | 9876543210 | |
| email | john@email.com | Optional |
| bank_account | 1234567890 | For bank transfer report |
| ifsc | SBIN0001234 | Uppercase |

---

## BRANCH CODES REFERENCE

| Code | State |
|------|-------|
| DR | Karnataka |
| DAN | Karnataka |
| BNG | Karnataka |
| HO | Karnataka |
| MNG | Karnataka |
| KPM | Karnataka |
| VAPI | Gujarat |
| DAHEJ | Gujarat |
| MORBI | Gujarat |
| SURAT | Gujarat |
| CHENNAI | Tamil Nadu |
| CHENNAI (P) | Tamil Nadu |
| TUTICORIN | Tamil Nadu |
| HYD | Telangana |
| RAIPUR | Chhattisgarh |
| CAL | West Bengal |
| NAGPUR | Maharashtra |

---

## ATTENDANCE RULES

- **Working days:** Monday to Saturday only
- **Sunday:** Automatically resets the streak (no lockout on Monday)
- **Miss one working day:** Branch is locked out the next working day
- **Admin unlock:** Go to Manage Branch Access → click **"Unlock"** next to the locked branch
- Branch users can only see and submit attendance — no salary access

---

## MASTER SETTINGS (do this first after setup)

Admin → **Master Settings** → update:
- Company Name, GST No., Address
- PAN / TAN of Deductor (for Form 16)
- PF / ESI percentages (defaults are correct for FY 2026-27)
- Professional Tax state (per-branch PT is auto-applied using branch state map)

---

## MONTHLY WORKFLOW

```
1. Branch staff submit daily attendance (Mon–Sat)
2. Admin → Bulk Salary Entry → select month + branch → Load → set days present → Save All
   OR use attendance data to auto-fill days
3. Admin → Monthly Report → verify
4. Admin → Bank Transfer → generate + download CSV for bank upload
5. Admin → Payslip → generate and print for each employee
6. Admin → PF & ESI Summary → for statutory filings
```

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|---------|
| Login not working | Check config.js URL and anon key are correct |
| "relation does not exist" error | Re-run supabase-schema.sql in SQL Editor |
| Branch can't login | Go to Manage Branch Access → Set PIN for that branch |
| Attendance locked | Admin → Manage Branch Access → Unlock the branch |
| Data not saving | Check Supabase free tier limits (500MB, 50k rows) |
| GitHub Pages not loading | Wait 5 min after enabling; check Settings → Pages for errors |

---

## SUPABASE FREE TIER LIMITS

| Resource | Limit | Your usage estimate |
|----------|-------|---------------------|
| Database | 500 MB | ~50,000+ salary records |
| Rows | Unlimited | ✅ |
| API calls | 500k/month | ✅ plenty |
| Bandwidth | 5 GB/month | ✅ plenty |

The free tier is more than enough for this system.

---

## SECURITY NOTES

- The `anon` key in `config.js` is visible to anyone who views the source
- Authentication is handled in JavaScript (username/password check against Supabase)
- Row Level Security is enabled with permissive policies — sufficient for internal use
- For extra security, consider making the GitHub repo **private** and using GitHub Pages with a custom domain
- Never share your **service_role** key (different from anon key) publicly

---

## SUPPORT

System built for: **SUNRISE FREIGHT MOVERS PRIVATE LIMITED**
FY: April 2025 – March 2026
Version: 2.0 (Supabase Edition)
