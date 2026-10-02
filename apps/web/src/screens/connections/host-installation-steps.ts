export const hostInstallationSteps = {
  chatgpt: [
    { title: 'Habilite o modo de desenvolvedor', text: 'No ChatGPT Web, abra seu perfil → Configurações → Segurança e login → Modo de desenvolvedor. Habilite a opção. Se o workspace bloquear esse modo, o administrador precisa liberá-lo.' },
    { title: 'Abra o formulário MCP', text: 'Abra Plugins na barra lateral, selecione Adicionar (+) → Criar aplicativo MCP. A documentação atual também chama essa etapa de adicionar um servidor MCP.' },
    { title: 'Preencha a conexão', text: 'Nome: ForgeLex. Descrição: pesquisa jurisprudencial do STJ com fontes verificáveis. URL do servidor: o endereço abaixo, incluindo /mcp. Autenticação: OAuth. No fluxo de registro dinâmico, deixe Client ID e Client Secret vazios.' },
    { title: 'Entre no ForgeLex e autorize', text: 'Ao criar a conexão, você será encaminhado para o ForgeLex. Entre com sua conta, confira o nome do aplicativo, as permissões e os custos e selecione Autorizar conexão. O retorno ao ChatGPT deve ocorrer automaticamente.' },
    { title: 'Selecione o ForgeLex na conversa', text: 'Abra uma nova conversa. No menu de ferramentas/aplicativos junto ao campo de mensagem, adicione o ForgeLex. Confira se as ferramentas de pesquisa, obtenção e verificação de autoridades estão listadas.' },
  ],
  claude: [
    { title: 'Abra as configurações de conectores', text: 'No Claude Web ou Desktop, abra seu perfil → Settings (Configurações) → Connectors (Conectores). Em uma organização, conectores personalizados podem depender de liberação do administrador.' },
    { title: 'Adicione um conector personalizado', text: 'Selecione Add custom connector (Adicionar conector personalizado). Informe o nome ForgeLex e cole o endereço abaixo no campo Remote MCP server URL, incluindo /mcp. Confirme em Add (Adicionar).' },
    { title: 'Conecte sua conta ForgeLex', text: 'Na ficha do conector, selecione Connect (Conectar). Na página do ForgeLex, entre com sua conta, confira o aplicativo e as permissões e selecione Autorizar conexão. Aguarde o retorno ao Claude.' },
    { title: 'Habilite as ferramentas na conversa', text: 'Abra uma nova conversa. No menu de ferramentas junto ao campo de mensagem, abra os conectores e habilite o ForgeLex para essa conversa. Confira a lista de ferramentas disponíveis.' },
  ],
} as const;

export const hostReferences = {
  chatgpt: { href: 'https://chatgpt.com/plugins', label: 'Abrir Plugins no ChatGPT', docs: 'https://developers.openai.com/plugins/deploy/connect-chatgpt' },
  claude: { href: 'https://claude.ai/settings/connectors', label: 'Abrir conectores no Claude', docs: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp' },
};
