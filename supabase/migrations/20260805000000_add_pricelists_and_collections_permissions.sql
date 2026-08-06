-- Agrega permisos de cobranzas (Ver todas) y listas de precios (propia/todas)
INSERT INTO permissions (key, description) VALUES
  ('collections.read.all', 'Ver todas las cobranzas de la organización'),
  ('pricelists.read', 'Ver listas de precios propias'),
  ('pricelists.read.all', 'Ver todas las listas de precios de la organización')
ON CONFLICT (key) DO NOTHING;

-- Agrega columna de propietario a price_lists para filtrado own/all
ALTER TABLE price_lists
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

