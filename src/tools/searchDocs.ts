import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { searchDocsInputSchema } from '../schemas/common.js';
import { searchDocs } from '../services/search.js';

export const registerSearchDocsTool = (server: McpServer) => {
  server.tool('search_docs', searchDocsInputSchema.shape, async (input) => {
    const { query, domain } = searchDocsInputSchema.parse(input);
    const results = searchDocs(query, domain);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: `Found ${results.length} documentation matches for "${query}".`,
              query,
              domain,
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
