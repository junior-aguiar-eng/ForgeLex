# Aditivo de termos — encerramento de conta pessoal

> MINUTA REVISTA INTERNAMENTE — NÃO PUBLICADA

Este texto descreve o fluxo técnico da versão `2026-09-22.v1`. Boni confirmou a aprovação da revisão jurídica específica em 24/09/2026, registrada na [matriz de validação](../operations/account-closure/validation.md). O aceite interno não constitui termo vigente nem promessa pública; publicação e operação exigem autorizações próprias.

O titular pode solicitar o encerramento somente do próprio espaço pessoal quando for o único membro e proprietário e não mantiver vínculo ativo com outro workspace. Espaços compartilhados exigem transferência ou saída prévia. A solicitação exige sessão autenticada, confirmação recente por senha e digitação literal de `ENCERRAR MINHA CONTA`.

Após o aceite, o acesso ao ForgeLex é bloqueado na transação inicial, inclusive para credenciais e JWT ainda dentro do prazo técnico de validade. A operação é irreversível pela interface: não há reativação da identidade encerrada nem restauração ordinária do conteúdo privado. A exclusão da identidade externa é tentada imediatamente e deve ser concluída em até 24 horas; o conteúdo privado do armazenamento ativo é eliminado em até 7 dias, ressalvada retenção excepcional formal e vigente. Uma falha intermediária não restaura o acesso: ela exige reconciliação operacional.

Alguns registros financeiros e fiscais são minimizados e conservados conforme a [minuta de política de retenção](account-closure-retention-policy.md). Os pontos nela qualificados como provisórios ou a validar permanecem questões para a redação pública e a operação. Valores, comprovantes, estornos e reembolsos não são convertidos automaticamente em exclusão de obrigação financeira pelo encerramento. Registros de acesso e auditoria seguem a matriz específica. Cópias de segurança criptografadas expiram no ciclo de até 35 dias; em restauração, os tombstones de encerramento devem ser reaplicados antes de disponibilizar o ambiente.

O acompanhamento usa um recibo com `closureId` e token opaco, mantido apenas na aba até a conclusão. O titular deve exportá-lo e guardá-lo em local seguro caso precise fechar a aba antes do término. Depois da conclusão, o token é removido do armazenamento local. Para suporte, informar apenas o `closureId`; o suporte não deve pedir o `statusToken` por e-mail, chat ou outro canal inseguro. Canal, endereço, procedimento de autenticação do solicitante e tratamento de saldo/remanescentes: **pendentes de definição e revisão humana**.

Esta minuta não substitui os direitos do titular previstos na [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) nem define, por si, uma base jurídica para cada retenção. As revisões jurídica, fiscal, de segurança e UX foram registradas separadamente da validação técnica; sua aprovação não autoriza publicação ou ativação remota.
