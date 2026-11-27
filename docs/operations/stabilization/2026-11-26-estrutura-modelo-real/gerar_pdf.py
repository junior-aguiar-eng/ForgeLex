"""Gera o PDF sintético do ensaio da Estrutura do caso com o modelo real (26/11/2026).

Caso fictício: nomes, números, protocolos e o processo não existem. O PDF tem poucas páginas e fica bem abaixo do teto
de 40.000 caracteres por trecho (apps/web/src/agentic-workspace/attachment-parts.ts), para ser analisado num pedido só.
Há duas divergências de propósito com o relato colado (data do telefonema e valor depositado) para observar como a
soma das análises mostra contradição entre documentos.

Uso: python -I gerar_pdf.py [saida.pdf]
"""

import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

PAGINAS = [
    [
        "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL DA COMARCA DE ARAPIRACA/AL",
        "LÚCIA FICTÍCIA MORAES, brasileira, viúva, aposentada, inscrita no CPF sob o nº 000.000.000-00 (fictício), "
        "residente na Rua das Acácias Fictícias, nº 10, Arapiraca/AL, vem, por seu advogado, propor",
        "AÇÃO DECLARATÓRIA DE INEXISTÊNCIA DE DÉBITO CUMULADA COM REPETIÇÃO DE INDÉBITO E INDENIZAÇÃO POR DANOS MORAIS",
        "em face de BANCO EXEMPLO S.A., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº "
        "00.000.000/0001-00 (fictício), com agência na Praça Central Fictícia, Arapiraca/AL, pelos fatos e fundamentos "
        "a seguir.",
        "I. DOS FATOS",
        "1. A autora é beneficiária de aposentadoria por idade do INSS (benefício nº 000.000.000-0, fictício). Em março "
        "de 2026, ao consultar o Histórico de Créditos, constatou descontos mensais de R$ 389,40 sob a rubrica "
        "\"EMPRÉSTIMO CONSIGNADO BANCO EXEMPLO\", contrato nº 9988776655 (fictício), em 84 parcelas.",
        "2. A autora nunca contratou o empréstimo, não assinou instrumento físico ou digital e não recebeu o valor "
        "correspondente na conta em que recebe o benefício.",
        "3. Em fevereiro de 2026, a autora recebeu ligação de pessoa que se apresentou como funcionária do réu e "
        "solicitou \"atualização cadastral\". A autora não forneceu senha.",
    ],
    [
        "4. Em 15/04/2026 a autora registrou reclamação na agência do réu (protocolo 2026-0415-778). Em resposta escrita "
        "de 12/05/2026, o réu afirmou que o contrato teria sido celebrado por meio digital, com biometria facial, e que "
        "o crédito de R$ 14.800,00 teria sido transferido para conta mantida na Caixa Econômica Federal.",
        "5. A autora não é titular de conta na Caixa Econômica Federal. Em 20/04/2026 registrou boletim de ocorrência "
        "(BO nº 0000/2026, fictício) na Delegacia de Arapiraca.",
        "6. Até outubro de 2026 foram realizados oito descontos, que somam R$ 3.115,20. Em junho de 2026 a autora ficou "
        "sem recursos para adquirir medicamentos de uso contínuo e precisou recorrer a empréstimo da filha.",
        "II. DOS FUNDAMENTOS",
        "7. A relação é de consumo. Cabe ao réu demonstrar a regularidade da contratação, inclusive a autenticidade da "
        "biometria e o destino do crédito. A instituição financeira responde pelos danos decorrentes de fraude praticada "
        "por terceiros no âmbito de suas operações.",
        "8. Os descontos indevidos em verba alimentar de pessoa idosa ultrapassam o mero aborrecimento.",
    ],
    [
        "III. DOS PEDIDOS",
        "Diante do exposto, requer:",
        "a) a concessão de tutela de urgência para a suspensão imediata dos descontos;",
        "b) a declaração de inexistência do contrato nº 9988776655 e do débito dele decorrente;",
        "c) a condenação do réu à restituição em dobro dos valores descontados, que até outubro de 2026 somam "
        "R$ 3.115,20, acrescidos das parcelas que vencerem no curso do processo;",
        "d) a condenação do réu ao pagamento de indenização por danos morais de R$ 10.000,00;",
        "e) a inversão do ônus da prova e a exibição do suposto contrato digital, com o registro da biometria, o "
        "endereço IP e o comprovante da transferência;",
        "f) a citação do réu e a concessão da gratuidade da justiça.",
        "Dá-se à causa o valor de R$ 16.230,40.",
        "Arapiraca/AL, 20 de novembro de 2026.",
        "ADVOGADO FICTÍCIO — OAB/AL 00.000",
        "Documentos anexos: procuração; declaração de hipossuficiência; Histórico de Créditos do INSS (março a outubro de "
        "2026); resposta do réu de 12/05/2026; protocolo 2026-0415-778. O boletim de ocorrência será juntado depois.",
    ],
]


def main() -> None:
    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("peticao-sintetica.pdf")
    estilos = getSampleStyleSheet()
    corpo = estilos["BodyText"]
    historia = []
    for numero, pagina in enumerate(PAGINAS):
        if numero:
            historia.append(PageBreak())
        for paragrafo in pagina:
            historia.append(Paragraph(paragrafo, corpo))
            historia.append(Spacer(1, 0.3 * cm))
    SimpleDocTemplate(str(saida), pagesize=A4, title="Petição sintética — ensaio ForgeLex").build(historia)
    print(saida)


if __name__ == "__main__":
    main()
