/** O que o cliente já escolheu ou digitou numa pergunta ainda sem resposta; volta intacto se ele sair e voltar. */
export interface QuestionDraft {
  selected: string[];
  text: string;
  unknown: boolean;
  search: string;
  textOpen: boolean;
}
