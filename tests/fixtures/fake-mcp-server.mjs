// A tiny MCP server for tests/mcp-abilities.test.ts. Runs over stdio when
// started directly; createFakeMcpServer is also used in-process behind an
// HTTP transport.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { pathToFileURL } from 'node:url'

const TOOLS = [
  { name: 'echo', description: 'Echoes the text back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'addNumbers', description: 'Adds two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
  { name: 'fail', description: 'Always fails', inputSchema: { type: 'object', properties: {} } },
  { name: 'whoami', description: 'Returns FAKE_TOKEN from its environment', inputSchema: { type: 'object', properties: {} } },
  { name: 'big', description: 'Returns a long text', inputSchema: { type: 'object', properties: {} } },
  { name: 'secret_admin', description: 'Not allowlisted by the test ability', inputSchema: { type: 'object', properties: {} } },
]

export function createFakeMcpServer() {
  const server = new Server({ name: 'fake', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = req.params.arguments ?? {}
    switch (req.params.name) {
      case 'echo':
        return { content: [{ type: 'text', text: `echo: ${args.text}` }] }
      case 'addNumbers':
        return { content: [{ type: 'text', text: String(args.a + args.b) }], structuredContent: { sum: args.a + args.b } }
      case 'fail':
        return { content: [{ type: 'text', text: 'it broke' }], isError: true }
      case 'whoami':
        return { content: [{ type: 'text', text: process.env.FAKE_TOKEN ?? 'none' }] }
      case 'big':
        return { content: [{ type: 'text', text: 'x'.repeat(500) }] }
      default:
        return { content: [{ type: 'text', text: `unknown tool ${req.params.name}` }], isError: true }
    }
  })
  return server
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createFakeMcpServer().connect(new StdioServerTransport())
}
