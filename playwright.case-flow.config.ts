import { defineConfig, devices } from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
const dbDir=mkdtempSync(join(tmpdir(),'forgelex-case-flow-'));
const databaseUrl=`file:${join(dbDir,'case-flow.sqlite').replace(/\\/g,'/')}`;
process.once('exit',()=>{if(resolve(dirname(dbDir))!==resolve(tmpdir())||!basename(dbDir).startsWith('forgelex-case-flow-'))throw new Error('Unexpected test directory');rmSync(dbDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
const api = 'http://127.0.0.1:3331';
process.env.FORGELEX_TEST_API_ORIGIN = api;
export default defineConfig({
  testDir:'./tests/e2e',testMatch:['case-flow.spec.ts','draft-review.spec.ts','case-ai-access.spec.ts','document-reader.spec.ts'],workers:1,timeout:60000,
  expect:{timeout:10000},use:{baseURL:'http://127.0.0.1:3330',trace:'retain-on-failure'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:[
    {command:'node scripts/e2e-phase-7-server.mjs',url:api+'/readyz',reuseExistingServer:false,env:{DATABASE_URL:databaseUrl,FORGELEX_DATABASE_URL:databaseUrl,FORGELEX_E2E_CASE_AI:'true',FORGELEX_E2E_MATTER_LIFECYCLE:'true',FORGELEX_E2E_AUTH_URL:'http://127.0.0.1:15541',FORGELEX_E2E_API_PORT:'3331',FORGELEX_E2E_WEB_ORIGIN:'http://127.0.0.1:3330'}},
    {command:'pnpm --filter @forgelex/web build && pnpm --filter @forgelex/web preview --host 127.0.0.1 --port 3330 --strictPort',url:'http://127.0.0.1:3330',timeout:180000,reuseExistingServer:false,env:{FORGELEX_VITE_OUT_DIR:join(dbDir,'web-dist'),FORGELEX_VITE_CACHE_DIR:join(dbDir,'vite-cache'),VITE_SUPABASE_URL:'http://127.0.0.1:15541',VITE_SUPABASE_PUBLISHABLE_KEY:'phase7-e2e-publishable',VITE_FORGELEX_API_URL:api,VITE_FORGELEX_CASE_WORKSPACE_ENABLED:'true'}},
  ],
});
