ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hours_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (publication_status IN ('PENDING','APPROVED','REJECTED'));
CREATE INDEX IF NOT EXISTS idx_businesses_directory ON businesses(publication_status, status, category);
