/* ============================================================
   config.js — Supabase credentials
   Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY
   with your actual values from Supabase → Settings → API
   ============================================================ */
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const BRANCHES = [
  'DR','DAN','BNG','HO','VAPI','DAHEJ','MNG','CHENNAI',
  'HYD','TUTICORIN','MORBI','KPM','RAIPUR','SURAT','CAL','NAGPUR','CHENNAI (P)'
];

const MONTHS = [
  'April 2025','May 2025','June 2025','July 2025','August 2025',
  'September 2025','October 2025','November 2025','December 2025',
  'January 2026','February 2026','March 2026'
];

const BRANCH_STATE_MAP = {
  'DR':'Karnataka','DAN':'Karnataka','BNG':'Karnataka','HO':'Karnataka',
  'MNG':'Karnataka','KPM':'Karnataka','VAPI':'Gujarat','DAHEJ':'Gujarat',
  'MORBI':'Gujarat','SURAT':'Gujarat','CHENNAI':'Tamil Nadu',
  'CHENNAI (P)':'Tamil Nadu','TUTICORIN':'Tamil Nadu','HYD':'Telangana',
  'RAIPUR':'Chhattisgarh','CAL':'West Bengal','NAGPUR':'Maharashtra'
};
