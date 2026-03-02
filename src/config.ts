export const SERVER_NAME = 'mayao-mcp-server';
export const SERVER_VERSION = '0.1.0';
export const DEFAULT_PORT = Number(process.env.PORT || 3001);
export const DEFAULT_BASE_URL = process.env.MCP_BASE_URL || `http://localhost:${DEFAULT_PORT}`;

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
