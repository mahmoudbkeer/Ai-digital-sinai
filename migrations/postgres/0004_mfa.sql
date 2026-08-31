ALTER TABLE user_security ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE user_security ADD COLUMN IF NOT EXISTS mfa_pending_secret TEXT;
ALTER TABLE user_security ADD COLUMN IF NOT EXISTS mfa_verified_at BIGINT;
