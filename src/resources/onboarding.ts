import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ONBOARDING_INDEX_URI, ONBOARDING_URI_TEMPLATE } from '../config.js';
import { getOnboardingGuideByKey, listOnboardingGuides } from '../services/onboarding.js';
import { serializeResource } from '../transforms/componentTransform.js';
import { buildOnboardingSummary } from '../transforms/onboardingTransform.js';

export const registerOnboardingResources = (server: McpServer) => {
  server.resource('onboarding-index', ONBOARDING_INDEX_URI, async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: serializeResource({
          summary: 'Index of MAYAO onboarding guides.',
          guides: listOnboardingGuides().map(buildOnboardingSummary),
        }),
      },
    ],
  }));

  server.resource(
    'onboarding-guide',
    new ResourceTemplate(ONBOARDING_URI_TEMPLATE, { list: undefined }),
    async (uri, { service }) => {
      const guide = getOnboardingGuideByKey(String(service));
      if (!guide) {
        throw new Error(`Unknown onboarding guide: ${String(service)}`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: serializeResource(guide),
          },
        ],
      };
    },
  );
};
