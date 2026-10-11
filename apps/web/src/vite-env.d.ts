/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORGELEX_CASE_WORKSPACE_ENABLED?: string;
  readonly VITE_FORGELEX_API_URL?: string;
  readonly VITE_FORGELEX_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
