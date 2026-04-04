/* ============================================================
   config.js — Supabase credentials
   Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY
   with your actual values from Supabase → Settings → API
   ============================================================ */
const SUPABASE_URL = 'https://yvueitwmbjqkraxdutlt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_M7jJxdgOcUqvkLE_i89Psw_1yJuahG5';

const BRANCHES = [
  'DR','DAN','BNG','HO','VAPI','DAHEJ','MNG','CHENNAI',
  'HYD','TUTICORIN','MORBI','KPM','RAIPUR','SURAT','CAL','NAGPUR','CHENNAI (P)'
];

const MONTHS = [
  'April 2026','May 2026','June 2026','July 2026','August 2026',
  'September 2026','October 2026','November 2026','December 2026',
  'January 2027','February 2027','March 2027'
];

const BRANCH_STATE_MAP = {
  'DR':'Karnataka','DAN':'Karnataka','BNG':'Karnataka','HO':'Karnataka',
  'MNG':'Karnataka','KPM':'Karnataka','VAPI':'Gujarat','DAHEJ':'Gujarat',
  'MORBI':'Gujarat','SURAT':'Gujarat','CHENNAI':'Tamil Nadu',
  'CHENNAI (P)':'Tamil Nadu','TUTICORIN':'Tamil Nadu','HYD':'Telangana',
  'RAIPUR':'Chhattisgarh','CAL':'West Bengal','NAGPUR':'Maharashtra'
};
