import { AppBridge, PostMessageTransport } from '../../apps/web/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js';

// Synthetic local acceptance harness. Authorization stays in the outer test page;
// the sandbox receives only the resource and tool results, as in an MCP Apps client.
const fixture = (window as any).fixture;
const frame = document.createElement('iframe');
frame.title = 'Leitor MCP — teste local';
frame.setAttribute('sandbox', 'allow-scripts');
frame.style.cssText = 'width:100%;height:900px;border:0';
document.body.append(frame);
const bridge = new AppBridge(null, { name: 'Teste local MCP Apps', version: '1.0.0' }, { serverTools: {}, openLinks: {} },
  { hostContext: { theme: 'dark', availableDisplayModes: ['inline', 'fullscreen'], displayMode: 'inline' } });
bridge.oncalltool = async params => {
  const response = await fetch('/mcp-test-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params }) });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
};
bridge.onrequestdisplaymode = async ({ mode }) => { document.body.dataset.mode = mode; return { mode }; };
bridge.onopenlink = async ({ url }) => { if (document.body.dataset.failOpen === 'true') return { isError: true }; document.body.dataset.openedSource = url; return {}; };
bridge.oninitialized = () => { void bridge.sendToolInput({ arguments: fixture.input }).then(() => bridge.sendToolResult(fixture.result)); };
await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
frame.srcdoc = fixture.html;
