-- Permiso para el catálogo de distribuidores.
-- Permite ver stock y el precio de distribuidor (costo + margen configurable por org)
-- en la ruta /org/[orgSlug]/catalogo-distribuidor, sin acceso al resto del sistema.
INSERT INTO permissions (key, description)
VALUES ('distributor.catalog', 'Permite ver el catálogo con stock y precio de distribuidor')
ON CONFLICT (key) DO NOTHING;