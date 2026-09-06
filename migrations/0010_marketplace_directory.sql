ALTER TABLE businesses ADD COLUMN phone TEXT;
ALTER TABLE businesses ADD COLUMN whatsapp TEXT;
ALTER TABLE businesses ADD COLUMN image_url TEXT;
ALTER TABLE businesses ADD COLUMN hours_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (publication_status IN ('PENDING','APPROVED','REJECTED'));
CREATE INDEX IF NOT EXISTS idx_businesses_directory ON businesses(publication_status, status, category);
