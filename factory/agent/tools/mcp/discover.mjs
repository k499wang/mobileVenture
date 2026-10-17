#!/usr/bin/env node
import { createIntegrationRegistry } from './client.mjs';

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const server = option('--server');
if (!server) {
  process.stderr.write('Usage: npm run agent:mcp:discover -- --server appgazers [--config PATH]\n');
  process.exitCode = 1;
} else {
  const registry = createIntegrationRegistry({ configPath: option('--config') });
  try {
    const result = await registry.discoverServer(server);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(registry.redact(error.message) + '\n');
    process.exitCode = 1;
  } finally {
    await registry.close();
  }
}
