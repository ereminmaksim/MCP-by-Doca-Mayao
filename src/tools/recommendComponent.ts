import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { recommendComponentInputSchema } from '../schemas/common.js';
import { recommendComponents } from '../services/components.js';

export const registerRecommendComponentTool = (server: McpServer) => {
  server.tool('recommend_component', recommendComponentInputSchema.shape, async (input) => {
    const { task, constraints } = recommendComponentInputSchema.parse(input);
    const results = recommendComponents(task, constraints).map(({ component, score, reason }) => ({
      name: component.name,
      slug: component.slug,
      description: component.description,
      route: component.route,
      score,
      reason,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              summary: `Recommended ${results.length} component candidates for the task.`,
              task,
              constraints,
              recommended: results,
              sourceRoutes: results.map((item) => item.route),
            },
            null,
            2,
          ),
        },
      ],
    };
  });
};
