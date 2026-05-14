-- Ejecuta este SQL en Supabase Dashboard → SQL Editor
ALTER TABLE events ADD COLUMN IF NOT EXISTS manager_email text;
