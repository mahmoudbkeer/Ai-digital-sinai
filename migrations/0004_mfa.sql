ALTER TABLE user_security ADD COLUMN mfa_secret TEXT;
ALTER TABLE user_security ADD COLUMN mfa_pending_secret TEXT;
ALTER TABLE user_security ADD COLUMN mfa_verified_at INTEGER;
