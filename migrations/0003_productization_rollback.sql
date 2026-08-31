DROP TABLE IF EXISTS marketing_campaign_actions;
DROP TABLE IF EXISTS recommendation_events;
DROP TABLE IF EXISTS forecast_outputs;
DROP TABLE IF EXISTS ai_insights;
DROP TABLE IF EXISTS tenant_configurations;
DELETE FROM schema_migrations WHERE version = 3;
