import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { onboardingLookupSchema } from '../schemas/common.js';
import { getOnboardingGuideByKey } from '../services/onboarding.js';

export const registerGetOnboardingGuideTool = (server: McpServer) => {
  server.tool('get_onboarding_guide', onboardingLookupSchema.shape, async (input) => {
    const { service } = onboardingLookupSchema.parse(input);
    const guide = getOnboardingGuideByKey(service);

    if (!guide) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'not_found',
                message: `Onboarding guide "${service}" was not found.`,
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
              summary: `Guide for ${guide.name}.`,
              guide,
              sourceRoutes: [guide.route],
            },
            null,
            2,
          ),
        },
      ],
    };
  });
};
