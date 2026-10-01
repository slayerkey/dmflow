// Windows/macOS/Linux-safe test runner.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const result=spawnSync(process.execPath,['--import','tsx','--test','tests/worker.test.ts'],{
  cwd:path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  stdio:'inherit',env:{...process.env,DMFLOW_WORKER_TEST:'1'},shell:false,
});
if(result.error){console.error(result.error);process.exit(1);}
process.exit(result.status ?? 1);
