# MCP research and design integrations

The local server and remote client are actual MCP implementations. Vendor tools are discovered at runtime; no vendor tools or authenticated results are simulated. Demo research remains a separate fixture mode.

Copy `integrations.example.json` to `integrations.json` (or pass an alternate config path to the registry). Keep credentials in environment variables; config contains variable names only. Discover real tool names with `npm run agent:mcp:discover -- --server appgazers` (optionally `--config PATH`), then review the printed schemas and annotations before adding explicit names to allowedTools. Discovery lists metadata only; it never grants execution permission. Empty allowlists deliberately expose no tools. Discovery rejects tools marked destructive or explicitly not read-only. Unannotated tools require you to verify read-only behavior before allowlisting them. Roles are restricted in config, and the orchestrator must expose the returned function only to its assigned role.

[ScreensDesign MCP](https://screensdesign.com/mcp/) supports OAuth or a scoped key at `https://api.screensdesign.com/v1/mcp`. The example uses a scoped credential. Confirm the provider's required authentication convention for the issued credential; the client sends Bearer authorization.

[AppGazers MCP](https://appgazers.com/blog/app-market-research-mcp) uses OAuth at `https://appgazers.com/mcp`. Obtain a valid access token using an external OAuth client with `mcp:read` scope; `APPGAZERS_MCP_ACCESS_TOKEN` is that issued OAuth access token, not a personal API key. This client does not implement OAuth login or automatic refresh. Expired credentials produce an authorization-required state. No real connection is claimed until initialize and tool discovery succeed.

An optional `meta_ads` server can be added with an independently verified HTTPS endpoint, explicit allowed tools, and the `ads_research` role. No official Meta MCP endpoint is assumed. Public ad creatives are not evidence of ROAS, spend, conversions, or ad performance.

## Local read-only run inspector

Configure any stdio MCP host with:

```json
{
  "mcpServers": {
    "venture-studio": {
      "command": "node",
      "args": ["/absolute/path/Start/factory/agent/mcp/server.mjs", "--run", "YOUR-RUN-ID"]
    }
  }
}
```

The server reads only the selected run's structured artifacts, evidence and bounded trace. It has no arbitrary file-read, shell, write or credential tools. Tools are `list_artifacts`, `get_artifact`, `list_evidence`, and `trace_summary`. Standard output contains only newline-delimited JSON-RPC. Run artifacts may themselves include sensitive research; only connect a trusted MCP host.

## Runtime guarantees and limits

The Streamable HTTP client implements initialize, initialized notification, paginated tools/list, tools/call, protocol/session headers, JSON and SSE responses. Requests time out after 20 seconds, responses are bounded to 512 KB, tool arguments to 32 KB and discovery to ten pages. HTTPS redirects are rejected to avoid forwarding credentials. Server error bodies are not surfaced. URL evidence is extracted from results and returned with `fixture: false`; a source URL alone does not verify the claim. Remote data is untrusted.

`createIntegrationRegistry` is async-initialized via `await registry.initialize()`; synchronous `status()` never makes network requests. `toolsForRole(role)` discovers configured providers and returns a strict Responses-compatible function. `discoverServer(id)` returns sanitized vendor tool metadata even with an empty allowlist. `redact(value)` removes configured token echoes and credential-bearing URLs from structured data. `execute(name,args,{role})` enforces discovery plus the explicit allowlist. Missing or unavailable integrations leave web research as the workflow's fallback. Status fields distinguish configured, authorization required, unavailable and connected.

Tests: `node --test factory/agent/mcp/*.test.mjs`.
