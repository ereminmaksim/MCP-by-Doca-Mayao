import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { SERVER_NAME, SERVER_VERSION } from './config.js';
import { registerComponentResources } from './resources/components.js';
import { registerOnboardingResources } from './resources/onboarding.js';
import { registerGetComponentDocTool } from './tools/getComponentDoc.js';
import { registerGetOnboardingGuideTool } from './tools/getOnboardingGuide.js';
import { registerListComponentsTool } from './tools/listComponents.js';
import { registerCompareComponentsTool } from './tools/compareComponents.js';
import { registerRecommendComponentTool } from './tools/recommendComponent.js';
import { registerSearchComponentsTool } from './tools/searchComponents.js';
import { registerSearchDocsTool } from './tools/searchDocs.js';

export const createMayaoMcpServer = () => {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerComponentResources(server);
  registerOnboardingResources(server);

  registerListComponentsTool(server);
  registerGetComponentDocTool(server);
  registerSearchComponentsTool(server);
  registerRecommendComponentTool(server);
  registerCompareComponentsTool(server);
  registerGetOnboardingGuideTool(server);
  registerSearchDocsTool(server);

  return server;
};
