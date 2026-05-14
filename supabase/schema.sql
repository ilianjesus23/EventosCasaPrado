-- ============================================================
-- EventosCasaPrado — Schema de Supabase
-- Ejecuta este SQL en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Tabla de restaurantes
CREATE TABLE IF NOT EXISTS restaurants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Tabla de eventos
CREATE TABLE IF NOT EXISTS events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  restaurant text,
  date       date,
  type       text DEFAULT 'Corporativo',
  manager    text,
  guests     text,
  food       text,
  drinks     text,
  notes      text,
  locks      jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS)
-- Sin autenticación por ahora: acceso público de lectura y escritura.
-- ============================================================

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Política: acceso total público (sin auth)
CREATE POLICY "public_all" ON restaurants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON events     FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Storage bucket para archivos adjuntos de candados
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-files', 'event-files', false)
ON CONFLICT (id) DO NOTHING;

-- Política de storage: acceso público de lectura y escritura
CREATE POLICY "public_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'event-files');

CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-files');

CREATE POLICY "public_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'event-files');

-- ============================================================
-- Datos iniciales de restaurantes (opcional — puedes modificarlos)
-- ============================================================
INSERT INTO restaurants (name) VALUES
  ('La Hacienda'),
  ('El Rincón Mexicano'),
  ('Bistrot Central'),
  ('Mar Abierto')
ON CONFLICT (name) DO NOTHING;
