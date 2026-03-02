import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { componentSearchSchema } from '../schemas/common.js';
import { searchComponents } from '../services/components.js';
import { buildComponentSummary } from '../transforms/componentTransform.js';

export const registerSearchComponentsTool = (server: McpServer) => {
  server.tool('search_components', componentSearchSchema.shape, async (input) => {
    const { query } = componentSearchSchema.parse(input);
    const results = searchComponents(query).map(({ component, score }) => ({
      ...buildComponentSummary(component),
      score,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: `Found ${results.length} component matches for "${query}".`,
              query,
              items: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  });
};
