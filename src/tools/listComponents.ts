import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { listComponents } from '../services/components.js';
import { buildComponentSummary } from '../transforms/componentTransform.js';

export const registerListComponentsTool = (server: McpServer) => {
  server.tool('list_components', async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            summary: 'Available MAYAO components.',
            items: listComponents().map(buildComponentSummary),
          },
          null,
          2,
        ),
      },
    ],
  }));
};
