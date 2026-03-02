import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { componentLookupSchema } from '../schemas/common.js';
import { getComponentByNameOrSlug } from '../services/components.js';

export const registerGetComponentDocTool = (server: McpServer) => {
  server.tool('get_component_doc', componentLookupSchema.shape, async (input) => {
    const { nameOrSlug } = componentLookupSchema.parse(input);
    const component = getComponentByNameOrSlug(nameOrSlug);

    if (!component) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'not_found',
                message: `Component "${nameOrSlug}" was not found.`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: `Documentation for ${component.name}.`,
              component,
              sourceRoutes: [component.route],
            },
            null,
            2,
          ),
        },
      ],
    };
  });
};
