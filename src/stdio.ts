import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMayaoMcpServer } from './server.js';

const main = async () => {
  const server = createMayaoMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

void main();
