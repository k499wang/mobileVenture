import { execFileSync } from 'node:child_process';
if (process.env.EAS_BUILD_PROFILE === 'production') {
  execFileSync(process.execPath, ['scripts/validate-release.mjs'], { stdio: 'inherit' });
}
