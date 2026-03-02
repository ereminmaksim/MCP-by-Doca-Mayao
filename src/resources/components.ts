import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { COMPONENTS_INDEX_URI, COMPONENT_URI_TEMPLATE } from '../config.js';
import { listComponents, getComponentByNameOrSlug } from '../services/components.js';
import { buildComponentSummary, serializeResource } from '../transforms/componentTransform.js';

export const registerComponentResources = (server: McpServer) => {
  server.resource('components-index', COMPONENTS_INDEX_URI, async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: serializeResource({
          summary: 'Index of documented MAYAO components.',
          components: listComponents().map(buildComponentSummary),
        }),
      },
    ],
  }));

  server.resource(
    'component-doc',
    new ResourceTemplate(COMPONENT_URI_TEMPLATE, { list: undefined }),
    async (uri, { slug }) => {
      const component = getComponentByNameOrSlug(String(slug));
      if (!component) {
        throw new Error(`Unknown component: ${String(slug)}`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: serializeResource(component),
          },
        ],
      };
    },
  );
};
