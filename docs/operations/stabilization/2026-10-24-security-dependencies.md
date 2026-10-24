# Dependências de segurança e contratos Zod 4 — 24/10/2026

Boni autorizou corrigir os alertas atuais, migrar Zod 3 para a linha 4 com
contratos preservados e publicar após regressões e gates. Base main 489fd79,
branch própria em analise-release. Os 47 arquivos do checkout original não
integram esta mudança. Nenhuma migration de banco pertence a esta entrega.

## Correções

- Zod 3.25.76/4.6.5 → 4.6.7 em todos os pacotes e peers afetados;
  `GHSA-mrhx-c7xc-m3w5`. Nenhum import de aplicação usa zod/v3.
- Conversão JSON Schema nativa compartilhada no agent-core, em modo de entrada
  e draft-07; mantidos defaults opcionais, nulabilidade, descrições e política
  de campos extras. Removidas as dependências diretas de zod-to-json-schema.
- GUID preserva os identificadores hexadecimais que a validação UUID anterior
  aceitava. Records explicitam chaves string; os campos unknown antes
  implicitamente opcionais agora declaram optional. O schema de saída de
  avaliar_prova continua sem o refinamento exclusivo da entrada.
- Vitest/mocker 4.1.12, Fastify 5.12.6, body-parser 2.4.0,
  ip-address 10.7.4, fast-uri 3.1.9/4.2.3. Vite 6/7 preservados.

A migração também passa a rejeitar números não finitos e inteiros fora do
intervalo seguro do JavaScript, comportamentos do Zod 4. Infinity não é um
número JSON válido; não se promete aceitar inteiros que já perderam precisão.
Não foram regravados registros persistidos por esta implementação.

## Regressões e verificações

Antes da migração, oito testes de conversão v4 falharam porque o conversor
anterior retornava um schema vazio; dois controles reais de pesquisa passaram.
Outros 14 testes passaram no baseline e conservam identificadores, records,
campos omitidos, deduplicação/ordenação e permissão desabilitada por padrão.

A sonda da coleção antiga reproduziu 10.001 issues para uma lista inválida de
10.000 itens acima do limite. A regressão nova exige um único erro de tamanho
antes da validação dos elementos, com controles de entrada válida e elemento
inválido dentro do limite.

25 regressões focadas aprovadas após a migração. `pnpm test` terminou com saída
zero: 948 testes aprovados e 18 ignorados, em 172 arquivos aprovados e três
ignorados; nenhum novo skip foi adicionado. Build, `pnpm -r run typecheck` e
lint aprovados. Audit de produção e completo sem vulnerabilidades conhecidas.
Revisão estática independente sem achados acionáveis; não substitui os testes
nem a aprovação humana de Boni. CI e publicação seguem como gates separados.

## Braces

O [advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
foi retirado pelo upstream em 23/10/2026 às 12:53:02 UTC, que o classificou como
não explorável na prática. Isso não constitui uma release corrigida: o registry
continua em 3.0.3. O patch de profundidade, seus testes e o gate de audit foram
preservados. A exceção temporária existente não foi renovada ou ampliada.

## Limites de publicação

Até os gates e o deploy, as novas resoluções e a migração existem somente no
código desta entrega. Ensaios automáticos não homologam o resultado jurídico
nem o uso autenticado nos hosts reais. Deploy exige candidata antes da promoção,
auto-migrate desligado e provas operacionais próprias; não há autorização para
reaplicar migrations, reparar saldo ou executar reconciliação manual.
