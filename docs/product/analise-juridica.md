# Módulo de agentes jurídicos analíticos (`@forgelex/analise-juridica`)

Produto pago separado, independente do produto atual de pesquisa/gestão de caso.
Compartilha só infraestrutura: hospedagem, identidade do usuário (tenant + usuário do
MCP), saldo/débito (`LedgerService`) e o transporte MCP.

## Ativação

| Variável | Efeito |
| --- | --- |
| `FORGELEX_ANALISE_ENABLED=true` | Registra e expõe as tools `analise.*` (desligado por padrão). |
| `FORGELEX_ANALISE_BUSCA_ENDPOINT` | Endpoint HTTP de busca web (`GET ?q=` → `{ "results": [{ "url", "titulo", "trecho" }] }`). Sem ele, toda verificação de precedente retorna `nao_verificado / busca_indisponivel`. |
| `FORGELEX_ANALISE_BUSCA_TOKEN` | Bearer opcional do endpoint de busca. |

## Tools

`analise.peca_analisar`, `analise.mapear_teses`, `analise.avaliar_prova`,
`analise.estrategia_definir`, `analise.peca_redigir`, `analise.combo_ativar`.
`analise.jurisprudencia_verificar` é interna (registrada, nunca exposta nem cobrada à parte).

O servidor não tem LLM no caminho MCP: a análise jurídica vem do LLM do cliente, guiado
pela `description` de cada tool. O servidor valida a estrutura, confere trechos
literais, aplica correções dirigidas, verifica precedentes em fonte oficial, impõe o
aviso obrigatório, mantém o estado da sessão e cobra.

## Dados

Tabelas isoladas `analise_sessoes`, `analise_achados`, `analise_combos`, `analise_consumos`
(migration `analise-0001-initial`), sem referência às tabelas do produto atual.
`sessao_analitica_id` pertence ao par (tenant, usuário); outro usuário recebe o mesmo
erro de sessão inexistente.

## Preços iniciais (centavos; a calibrar)

Triagem embutida: 12. `peca_analisar` 75, `mapear_teses` 125, `avaliar_prova` 125,
`estrategia_definir` 200, `peca_redigir` 300 — cada chamada cobra tool + triagem.
Combos (15% abaixo da soma): `decisao` (analisar + mapear + estrategia) e `completo`
(as cinco). Cada tool do pacote é coberta uma vez por sessão; depois, preço cheio.
Sem reembolso retroativo.
