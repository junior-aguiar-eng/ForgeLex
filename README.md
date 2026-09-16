# FORGELEX — Plataforma Agêntica Jurídica Agnóstica V2

> **A inteligência jurídica que pensa antes de peticionar.**  
> Plataforma comercializável, vendor-neutral e orientada a conformidade forense para advocacia de alta performance e departamentos jurídicos.

[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.7%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-43%20Passing-brightgreen.svg)](https://vitest.dev/)
[![MCP Ready](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-orange.svg)](https://modelcontextprotocol.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Vendor--Neutral%20Kernel-purple.svg)](#arquitetura-do-monorepo)

---

## 🏛️ Visão Geral

O **FORGELEX V2** foi construído para superar as limitações das ferramentas jurídicas de 1ª geração (prompts estáticos, alucinações de ementas, dependência de fornecedor único e falta de governança).

### Pilares Fundamentais:
1. **Microkernel Agêntico Vendor-Neutral:** Suporte nativo a **Anthropic Claude 3.5 Sonnet**, **OpenAI GPT-4o** e **LLMs Soberanos Locais** (Ollama/VLLM).
2. **Governança Forense Human-in-the-Loop:** Classificação estrita de impacto em 5 níveis (`L0_OBSERVATION` a `L4_EXTERNAL_EFFECT`). Mutações externas exigem token criptográfico de aprovação do advogado.
3. **Rastreabilidade e Anti-Alucinação:** Todo acórdão retornado possui ancoragem com URL oficial verificada e hash criptográfico SHA-256 imutável.
4. **Legal Data Plane com Deduplicação:** Normalização algorítmica de números CNJ, tribunais e datas através de `dedupeKey` determinística.
5. **Ledger Contábil de Dupla Carteira (Apêndice Q):** Controle de saldo pago vs promocional com prevenção a dupla cobrança por replay idempotente.
6. **Distribuição Aberta MCP:** Servidor Model Context Protocol (JSON-RPC 2.0) em `https://mcp.forgelex.ai` para uso em Claude Desktop, Cursor e plataformas integradas.

---

## 📦 Estrutura do Monorepo

```text
├── apps/
│   ├── api/                   # Serviço Backend Fastify de Produção (REST + MCP Gateway)
│   └── web/                   # Frontend React 18 + Vite + Tailwind (5 Telas Canônicas)
│
├── packages/
│   ├── domain/                # Contratos canônicos, níveis L0-L4, proveniência e DomainErrors
│   ├── agent-core/            # Microkernel agêntico, SessionStateMachine, PolicyEngine, ToolRegistry
│   ├── agent-provider-anthropic/ # Conector oficial Claude 3.5 Sonnet (@anthropic-ai/sdk)
│   ├── agent-provider-openai/    # Conector oficial OpenAI GPT-4o (openai)
│   ├── persistence/           # Drizzle ORM Dual-Driver (SQLite local/testes, PostgreSQL prod)
│   ├── audit/                 # AuditRecorder com sanitização e hashing SHA-256 (OAB/LGPD)
│   ├── legal-data/            # Contratos de jurisprudência, dedupeKey e contentHash
│   ├── source-catalog/        # Catálogo nacional de tribunais (STF, STJ, TST, TJSP, etc.)
│   ├── source-providers/      # Provedores de fontes e SourceRouter com reconciliação
│   ├── legal-tools/           # Ferramentas registradas (research.search_case_law, drafting.save_final_draft)
│   ├── legal-workflows/       # Workflows orquestrados (legal-research-memo)
│   ├── billing-ledger/        # Dual-wallet ledger idempotente com priorização promocional
│   └── mcp-server/            # Implementação JSON-RPC 2.0 do Model Context Protocol
```

---

## 🖥️ Experiência Frontend Canônica (`apps/web`)

O frontend foi desenvolvido reproduzindo rigorosamente o design system editorial:
* **Paleta:** Marfim quente (`#FBF9F5`), conhaque imperial (`#8E5D2A`) e bordas champanhe (`rgba(180, 150, 110, 0.22)`).
* **Tipografia:** Serifada editorial clássica combinada com interface moderna sans-serif.
* **Telas Implementadas:**
  1. `Landing Page`: 4 gatilhos de ação direta e barra de busca forense ao vivo (R$ 0,15/busca).
  2. `Painel do Advogado`: 4 cartões de métricas, gráfico de 30 dias e fila de aprovação L4.
  3. `Conexões & Provedores`: Gestão de chaves Claude/GPT-4o, status MCP e sandbox de inferência.
  4. `Créditos & Faturamento`: Saldo dual-wallet, pacotes de recarga e checkout simulado via PIX/Cartão.
  5. `Documentação da API`: Gerenciador de chaves, playgrounds interativos e exemplos cURL/Node/Python.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
* Node.js >= 20.x (Recomendado Node 22+)
* pnpm >= 9.x (Recomendado pnpm 11+)

### Instalação e Execução

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Compilar todos os pacotes e aplicações
pnpm build

# 3. Executar suíte completa de testes automatizados
pnpm test

# 4. Iniciar a API Backend (Fastify)
pnpm --filter @forgelex/api dev

# 5. Iniciar o Frontend Web (React + Vite)
pnpm --filter @forgelex/web dev
```

O frontend estará disponível em `http://localhost:3000` e a API em `http://localhost:3001`.

---

## 🧪 Suíte de Testes Automatizados

```bash
$ vitest run

 ✓ packages/agent-provider-anthropic/src/anthropic-agent-provider.test.ts (3 tests)
 ✓ packages/legal-workflows/src/research-memo/legal-research-memo.test.ts (4 tests)
 ✓ packages/persistence/src/persistence.test.ts (4 tests)
 ✓ packages/audit/src/audit-recorder.test.ts (3 tests)
 ✓ packages/billing-ledger/src/ledger.test.ts (3 tests)
 ✓ packages/legal-data/src/legal-data.test.ts (3 tests)
 ✓ packages/mcp-server/src/mcp-server.test.ts (4 tests)
 ✓ packages/agent-provider-openai/src/openai-agent-provider.test.ts (3 tests)
 ✓ packages/domain/src/contracts/provenance.test.ts (4 tests)
 ✓ packages/source-providers/src/source-router.test.ts (3 tests)
 ✓ packages/source-catalog/src/court-catalog.test.ts (3 tests)
 ✓ apps/api/src/app.test.ts (6 tests)

 Test Files  12 passed (12)
      Tests  43 passed (43)
```

---

## ⚖️ Conformidade e Segurança

* **Código de Ética da OAB:** Proteção irrestrita ao sigilo profissional. Payloads brutos de clientes nunca são persistidos em logs de auditoria; apenas hashes SHA-256 e metadados sanitizados.
* **LGPD (Lei 13.709/2018):** Sanitização recursiva em trânsito de chaves, credenciais e dados de identificação pessoal.
* **Anti-Double Billing:** Proteção contra repetição indevida de débitos em falhas transitórias de conexão por chave de idempotência exclusiva.

---

## 📄 Licença
Propriedade de ForgeLex Tecnologia Ltda. Todos os direitos reservados.
