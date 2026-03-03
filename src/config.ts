export const SERVER_NAME = 'mayao-mcp-server';
export const SERVER_VERSION = '0.1.0';
export const DEFAULT_PORT = Number(process.env.PORT || 3001);
export const DEFAULT_BASE_URL = process.env.MCP_BASE_URL || `http://localhost:${DEFAULT_PORT}`;
export const MCP_BODY_LIMIT = process.env.MCP_BODY_LIMIT || '128kb';
export const MCP_SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS || 1000 * 60 * 15);
export const MCP_RATE_LIMIT_WINDOW_MS = Number(process.env.MCP_RATE_LIMIT_WINDOW_MS || 60_000);
export const MCP_RATE_LIMIT_MAX_REQUESTS = Number(process.env.MCP_RATE_LIMIT_MAX_REQUESTS || 60);
export const MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS || '';
export const MCP_AUDIT_LOG_ENABLED = process.env.MCP_AUDIT_LOG_ENABLED !== 'false';

export const COMPONENTS_INDEX_URI = 'mayao://components/index';
export const COMPONENT_URI_TEMPLATE = 'mayao://components/{slug}';
export const ONBOARDING_INDEX_URI = 'mayao://onboarding/index';
export const ONBOARDING_URI_TEMPLATE = 'mayao://onboarding/{service}';

export const ONBOARDING_ROUTE_BY_KEY: Record<string, string> = {
  intro: '/onboarding/intro',
  ektp: '/onboarding/ektp',
  crt: '/onboarding/crt',
  lk: '/onboarding/lk',
  videoanalytics: '/onboarding/videoanalytics',
  epl: '/onboarding/epl',
};
