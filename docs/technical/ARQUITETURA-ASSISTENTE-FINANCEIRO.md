# Arquitetura — Assistente Financeiro Inteligente

## Princípio do produto

O documento é a entrada principal. O usuário envia uma foto ou PDF e só participa quando a confiança da automação não é suficiente. A experiência não expõe cadastros e rotinas contábeis como ponto de partida.

## Fluxo principal

1. **Captura** — upload de nota, cupom, boleto, Pix ou comprovante.
2. **Extração** — OCR e modelo multimodal identificam fornecedor, CPF/CNPJ, valor, emissão, vencimento e pagamento.
3. **Normalização** — datas, documentos e valores são validados e fornecedores são deduplicados.
4. **Classificação** — categoria, subcategoria e centro de custo são sugeridos pelo histórico.
5. **Confiança** — campos confiáveis são aceitos automaticamente; exceções vão para revisão rápida.
6. **Conciliação** — comprovantes são comparados com contas e despesas por valor, contraparte e proximidade de data.
7. **Consulta** — documentos e lançamentos alimentam busca, contas a pagar e dashboard.

## Componentes preparados

- Interface web responsiva e instalável como PWA.
- API de ingestão com processamento assíncrono e idempotente.
- Armazenamento de arquivos separado dos metadados financeiros.
- Banco relacional com `documents`, `extractions`, `transactions`, `payables`, `matches`, `categories` e `classification_feedback`.
- Adaptadores para OCR, modelo de IA e provedor de armazenamento, evitando dependência rígida.
- Eventos de domínio para permitir auditoria, multiempresa e aprovações no futuro sem adicioná-los agora.

## Protótipo atual

O protótipo simula extração, classificação, confiança e revisão no navegador. Não envia documentos a serviços externos e não grava dados financeiros reais. A troca para produção deve conectar o fluxo a armazenamento privado, fila de processamento, OCR/LLM e políticas de acesso por usuário.
