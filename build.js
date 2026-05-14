// Build script: generates env.js from environment variables.
// Runs during Vercel build so credentials never need to be committed.
const fs = require('fs');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('[build] SUPABASE_URL or SUPABASE_ANON_KEY not set — app will use localStorage fallback.');
}

const content = `window.ENV = {
  SUPABASE_URL: '${url}',
  SUPABASE_ANON_KEY: '${key}',
};
`;

fs.writeFileSync('env.js', content);
console.log('[build] env.js generated.');
