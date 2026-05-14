// Supabase configuration
// Replace these values with your actual Supabase project credentials
// Get them from: https://supabase.com/dashboard → your project → Settings → API
const SUPABASE_URL = window.ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || '';

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// Returns true if Supabase is configured
function isSupabaseReady() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ── Restaurants ──────────────────────────────────────────────

async function dbGetRestaurants() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('restaurants').select('name').order('name');
  if (error) { console.error('dbGetRestaurants:', error); return null; }
  return data.map(r => r.name);
}

async function dbAddRestaurant(name) {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('restaurants').insert({ name });
  if (error) { console.error('dbAddRestaurant:', error); return false; }
  return true;
}

async function dbRemoveRestaurant(name) {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('restaurants').delete().eq('name', name);
  if (error) { console.error('dbRemoveRestaurant:', error); return false; }
  return true;
}

// ── Events ───────────────────────────────────────────────────

async function dbGetEvents() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('events').select('*').order('date', { ascending: false });
  if (error) { console.error('dbGetEvents:', error); return null; }
  return data;
}

async function dbCreateEvent(ev) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('events').insert(ev).select().single();
  if (error) { console.error('dbCreateEvent:', error); return null; }
  return data;
}

async function dbUpdateEvent(id, fields) {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('events').update(fields).eq('id', id);
  if (error) { console.error('dbUpdateEvent:', error); return false; }
  return true;
}

async function dbDeleteEvent(id) {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) { console.error('dbDeleteEvent:', error); return false; }
  return true;
}

// ── File uploads ─────────────────────────────────────────────

async function dbUploadFile(eventId, lockKey, file) {
  const sb = getSupabase();
  if (!sb) return null;
  const ext = file.name.split('.').pop();
  const path = `${eventId}/${lockKey}.${ext}`;
  const { error } = await sb.storage.from('event-files').upload(path, file, { upsert: true });
  if (error) { console.error('dbUploadFile:', error); return null; }
  return { path, fileName: file.name };
}
