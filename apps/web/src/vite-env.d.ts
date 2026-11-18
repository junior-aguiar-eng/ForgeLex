/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORGELEX_CASE_WORKSPACE_ENABLED?: string;
  readonly VITE_FORGELEX_PUBLIC_MODEL?: string;
  readonly VITE_PUBLIC_ORIGIN?: string;
  readonly VITE_FORGELEX_DESK_SHELL?: string;
  readonly VITE_FORGELEX_API_URL?: string;
  readonly VITE_FORGELEX_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
