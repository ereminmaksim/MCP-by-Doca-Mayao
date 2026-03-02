import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { compareComponentsInputSchema } from '../schemas/common.js';
import { buildComponentPropDiff, compareComponents } from '../services/components.js';

export const registerCompareComponentsTool = (server: McpServer) => {
  server.tool('compare_components', compareComponentsInputSchema.shape, async (input) => {
    const { items } = compareComponentsInputSchema.parse(input);
    const results = compareComponents(items);
    const missing = results.filter((entry) => !entry.component).map((entry) => entry.lookup);
    const found = results.filter((entry) => entry.component).map((entry) => entry.component!);

    if (found.length < 2) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'not_enough_components',
                message: 'At least two valid components are required for comparison.',
                missing,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const diff = buildComponentPropDiff(found);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: `Compared ${found.length} MAYAO components.`,
              missing,
              sharedProps: diff.sharedProps,
              uniquePropsByComponent: diff.uniquePropsByComponent,
              compared: found.map((component) => ({
                name: component.name,
                slug: component.slug,
                description: component.description,
                route: component.route,
                props: component.props.map((prop) => ({
                  name: prop.name,
                  type: prop.type,
                  default: prop.default,
                })),
                examplesCount: component.examples.length,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  });
};
