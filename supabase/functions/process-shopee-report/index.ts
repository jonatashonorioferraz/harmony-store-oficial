import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import * as XLSX from "npm:xlsx@0.18.5";

const allowedOrigins = new Set([
  "https://app.harmonylembrancinhas.com.br",
  "https://jonatashonorioferraz.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const reportTypes = new Set(["shop_stats", "product_funnel", "promotions"]);
const maxFileBytes = 12 * 1024 * 1024;
const parserVersion = "1.0.0";

const corsFor = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://app.harmonylembrancinhas.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const reply = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsFor(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const safeText = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);
const numberBR = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return 0;
  const parsed = Number(text.replace(/\s/g, "").replace(/%$/, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const integerBR = (value: unknown) => Math.max(0, Math.round(numberBR(value)));
const rateBR = (value: unknown) => String(value ?? "").includes("%") ? numberBR(value) / 100 : numberBR(value);
const isoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) throw new Error("DATA_INVALIDA");
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) throw new Error("DATA_INVALIDA");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};
const periodRange = (value: unknown) => {
  const dates = String(value || "").match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
  if (dates.length < 2) throw new Error("PERIODO_NAO_LOCALIZADO");
  const start = isoDate(dates[0]), end = isoDate(dates[1]);
  if (end < start) throw new Error("PERIODO_INVALIDO");
  return { start, end };
};
const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
};
const sheetRows = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
  header: 1, raw: false, defval: "", blankrows: false,
});
const findSheet = (workbook: XLSX.WorkBook, predicate: (normalizedName: string) => boolean) => {
  const name = workbook.SheetNames.find(item => predicate(normalize(item)));
  if (!name) throw new Error("ESTRUTURA_DA_PLANILHA_NAO_RECONHECIDA");
  return { name, rows: sheetRows(workbook, name) };
};
const requireHeader = (row: unknown[], expected: string[]) => {
  const header = row.map(normalize).join(" | ");
  if (expected.some(value => !header.includes(normalize(value)))) throw new Error("COLUNAS_OBRIGATORIAS_AUSENTES");
};

type ParsedReport = {
  periodStart: string;
  periodEnd: string;
  sales: Record<string, unknown>[];
  traffic: Record<string, unknown>[];
  products: Record<string, unknown>[];
  funnel: Record<string, unknown>[];
  promotionMetrics: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  summary: Record<string, unknown>;
};

const emptyReport = (): ParsedReport => ({
  periodStart: "", periodEnd: "", sales: [], traffic: [], products: [], funnel: [],
  promotionMetrics: [], campaigns: [], summary: {},
});

function parseShopStats(workbook: XLSX.WorkBook): ParsedReport {
  const result = emptyReport();
  const placed = findSheet(workbook, name => name === "pedido feito");
  const paid = findSheet(workbook, name => name === "produto pago");
  requireHeader(placed.rows[0] || [], ["Data", "Vendas (BRL)", "Pedidos", "Visitantes"]);
  requireHeader(paid.rows[0] || [], ["Data", "Vendas (BRL)", "Pedidos", "Visitantes"]);
  const period = periodRange(placed.rows[1]?.[0]);
  result.periodStart = period.start; result.periodEnd = period.end;

  const parseSales = (rows: unknown[][], orderType: "placed" | "paid") => rows.slice(4).filter(row => /^\d{1,2}\//.test(String(row[0] || ""))).map(row => ({
    metric_date: isoDate(row[0]), order_type: orderType, sales: numberBR(row[1]),
    sales_without_shopee_discount: numberBR(row[2]), orders: numberBR(row[3]), average_order_value: numberBR(row[4]),
    product_clicks: integerBR(row[5]), visitors: integerBR(row[6]), conversion_rate: rateBR(row[7]),
    cancelled_orders: numberBR(row[8]), cancelled_sales: numberBR(row[9]), refunded_orders: numberBR(row[10]),
    refunded_sales: numberBR(row[11]), buyers: integerBR(row[12]), new_buyers: integerBR(row[13]),
    returning_buyers: integerBR(row[14]), potential_buyers: integerBR(row[15]),
  }));
  result.sales = [...parseSales(placed.rows, "placed"), ...parseSales(paid.rows, "paid")];

  const trafficPlaced = findSheet(workbook, name => name.includes("pedidos enviados") && name.includes("fontes"));
  const trafficPaid = findSheet(workbook, name => name.includes("pedidos pagos") && name.includes("fontes"));
  const parseTraffic = (rows: unknown[][], orderType: "placed" | "paid") => {
    const headerIndex = rows.findIndex(row => normalize(row[0]) === "fontes de trafego");
    if (headerIndex < 0) throw new Error("COLUNAS_OBRIGATORIAS_AUSENTES");
    requireHeader(rows[headerIndex], ["Fontes de Tráfego", "Vendas (BRL)", "Impressões de Produto", "Cliques Por Produto"]);
    const records: Record<string, unknown>[] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const source = safeText(row[0], 160);
      if (!source || ["lives", "video do vendedor", "afiliado"].includes(normalize(source))) break;
      // A Shopee inclui uma linha agregada antes dos canais detalhados. Exibi-la
      // junto com os canais duplicaria visualmente o total no painel.
      if (normalize(source) === "card do produto") continue;
      records.push({ order_type: orderType, source_name: source, sales_share: rateBR(row[1]), sales: numberBR(row[2]),
        impressions: integerBR(row[3]), clicks: integerBR(row[4]), orders: numberBR(row[5]), units: numberBR(row[6]),
        ctr: rateBR(row[7]), conversion_rate: rateBR(row[8]), average_order_value: numberBR(row[9]), buyers: integerBR(row[10]),
        unique_impressions: integerBR(row[11]), unique_clicks: integerBR(row[12]) });
    }
    return records;
  };
  result.traffic = [...parseTraffic(trafficPlaced.rows, "placed"), ...parseTraffic(trafficPaid.rows, "paid")];

  const productsPlaced = findSheet(workbook, name => name.startsWith("product contribution") && name.includes("place"));
  const productsPaid = findSheet(workbook, name => name.startsWith("product contribution") && name.includes("paid"));
  const parseProducts = (rows: unknown[][], orderType: "placed" | "paid") => {
    const headerIndex = rows.findIndex(row => normalize(row[0]) === "id do item");
    if (headerIndex < 0) throw new Error("COLUNAS_OBRIGATORIAS_AUSENTES");
    requireHeader(rows[headerIndex], ["ID do Item", "Produto", "Vendas (BRL)", "Unidades"]);
    const records: Record<string, unknown>[] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const itemId = safeText(row[0], 80), productName = safeText(row[1], 600);
      if (!itemId || !productName) break;
      records.push({ order_type: orderType, item_id: itemId, product_name: productName, item_status: safeText(row[2], 120),
        sales_share: rateBR(row[3]), sales: numberBR(row[4]), impressions: integerBR(row[5]), clicks: integerBR(row[6]),
        orders: numberBR(row[7]), units: numberBR(row[8]), ctr: rateBR(row[9]), conversion_rate: rateBR(row[10]),
        average_order_value: numberBR(row[11]), buyers: integerBR(row[12]), unique_impressions: integerBR(row[13]),
        unique_clicks: integerBR(row[14]) });
    }
    return records;
  };
  result.products = [...parseProducts(productsPlaced.rows, "placed"), ...parseProducts(productsPaid.rows, "paid")];
  if (result.sales.length < 2 || result.traffic.length < 2 || result.products.length < 1) throw new Error("RELATORIO_SEM_DADOS_VALIDOS");
  result.summary = { sales_rows: result.sales.length, traffic_rows: result.traffic.length, product_rows: result.products.length };
  return result;
}

function parseProductFunnel(workbook: XLSX.WorkBook): ParsedReport {
  const result = emptyReport();
  const overview = findSheet(workbook, name => name === "overview");
  requireHeader(overview.rows[0] || [], ["Visitantes do Produto", "Adicionar ao Carrinho", "Pedido realizado", "Pedido pago"]);
  result.funnel = overview.rows.slice(1).filter(row => /^\d{1,2}\//.test(String(row[0] || ""))).map(row => ({
    metric_date: isoDate(row[0]), visitors: integerBR(row[1]), page_views: integerBR(row[2]), items_visited: integerBR(row[3]),
    exits: integerBR(row[4]), bounce_rate: rateBR(row[5]), search_clicks: integerBR(row[6]), likes: integerBR(row[7]),
    cart_visitors: integerBR(row[8]), cart_units: integerBR(row[9]), cart_conversion: rateBR(row[10]),
    placed_buyers: integerBR(row[11]), placed_units: integerBR(row[12]), products_ordered: integerBR(row[13]),
    placed_sales: numberBR(row[14]), placed_conversion: rateBR(row[15]), paid_buyers: integerBR(row[16]),
    paid_units: integerBR(row[17]), paid_items: integerBR(row[18]), paid_sales: numberBR(row[19]), paid_conversion: rateBR(row[20]),
  }));
  if (!result.funnel.length) throw new Error("RELATORIO_SEM_DADOS_VALIDOS");
  const dates = result.funnel.map(row => String(row.metric_date)).sort();
  result.periodStart = dates[0]; result.periodEnd = dates[dates.length - 1];
  result.summary = { funnel_rows: result.funnel.length };
  return result;
}

function parsePromotions(workbook: XLSX.WorkBook): ParsedReport {
  const result = emptyReport();
  const main = findSheet(workbook, name => name === "metricas principais");
  const trend = findSheet(workbook, name => name.startsWith("grafico de tendencias"));
  const campaigns = findSheet(workbook, name => name === "lista de desempenho");
  requireHeader(main.rows[0] || [], ["Promotion Type", "Vendas (Pedidos Feitos)", "Vendas (Pedidos Pagos)"]);
  requireHeader(trend.rows[0] || [], ["Data", "Promotion Type", "Pedidos (Pedidos Pagos)"]);
  requireHeader(campaigns.rows[0] || [], ["Nome da promoção", "Período da promoção", "Status"]);
  const period = periodRange(main.rows[1]?.[0]); result.periodStart = period.start; result.periodEnd = period.end;
  const promotionRow = (row: unknown[], kind: "period" | "daily") => ({
    record_kind: kind, metric_date: kind === "daily" ? isoDate(row[0]) : null, promotion_type: safeText(row[1], 160),
    placed_sales: numberBR(row[2]), paid_sales: numberBR(row[3]), placed_orders: integerBR(row[4]), paid_orders: integerBR(row[5]),
    placed_units: integerBR(row[6]), paid_units: integerBR(row[7]), placed_buyers: integerBR(row[8]), paid_buyers: integerBR(row[9]),
    placed_sales_per_buyer: numberBR(row[10]), paid_sales_per_buyer: numberBR(row[11]),
    placed_bundle_orders: integerBR(row[12]), paid_bundle_orders: integerBR(row[13]),
  });
  result.promotionMetrics = [
    ...main.rows.slice(1).filter(row => safeText(row[1], 160)).map(row => promotionRow(row, "period")),
    ...trend.rows.slice(1).filter(row => /^\d{1,2}\//.test(String(row[0] || "")) && safeText(row[1], 160)).map(row => promotionRow(row, "daily")),
  ];
  result.campaigns = campaigns.rows.slice(1).filter(row => safeText(row[0], 400)).map(row => ({
    campaign_name: safeText(row[0], 400), promotion_type: safeText(row[1], 160), campaign_period: safeText(row[2], 240),
    campaign_status: safeText(row[3], 120), placed_sales: numberBR(row[4]), paid_sales: numberBR(row[5]),
    placed_orders: integerBR(row[6]), paid_orders: integerBR(row[7]), placed_units: integerBR(row[8]), paid_units: integerBR(row[9]),
    placed_buyers: integerBR(row[10]), paid_buyers: integerBR(row[11]), placed_sales_per_buyer: numberBR(row[12]),
    paid_sales_per_buyer: numberBR(row[13]),
  }));
  if (result.promotionMetrics.length < 2) throw new Error("RELATORIO_SEM_DADOS_VALIDOS");
  result.summary = { promotion_rows: result.promotionMetrics.length, campaign_rows: result.campaigns.length };
  return result;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsFor(request) });
  if (request.method !== "POST") return reply(request, { error: "Método não permitido." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origem não autorizada." }, 403);
  const errorId = crypto.randomUUID();
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) return reply(request, { error: "Importador ainda não configurado." }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return reply(request, { error: "Autenticação obrigatória." }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return reply(request, { error: "Sessão inválida." }, 401);
    const { data: caller } = await admin.from("profiles").select("role,status").eq("id", authData.user.id).single();
    if (!caller || caller.role !== "admin" || caller.status !== "active") return reply(request, { error: "Somente administradores podem importar relatórios." }, 403);

    const form = await request.formData();
    const reportType = String(form.get("report_type") || "");
    const file = form.get("file");
    if (!reportTypes.has(reportType)) return reply(request, { error: "Selecione o tipo correto de relatório." }, 400);
    if (!(file instanceof File)) return reply(request, { error: "Selecione uma planilha .xlsx." }, 400);
    if (!file.name.toLowerCase().endsWith(".xlsx")) return reply(request, { error: "Somente planilhas .xlsx da Shopee são aceitas." }, 400);
    if (file.size < 100 || file.size > maxFileBytes) return reply(request, { error: "O arquivo deve ter no máximo 12 MB." }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return reply(request, { error: "O arquivo não é uma planilha .xlsx válida." }, 400);
    const hash = await sha256(bytes);
    const workbook = XLSX.read(bytes, { type: "array", raw: false, cellDates: false, bookVBA: false, dense: false });
    if (!workbook.SheetNames.length || workbook.SheetNames.length > 30) throw new Error("QUANTIDADE_DE_ABAS_INVALIDA");
    const parsed = reportType === "shop_stats" ? parseShopStats(workbook) : reportType === "product_funnel" ? parseProductFunnel(workbook) : parsePromotions(workbook);
    const rowCount = parsed.sales.length + parsed.traffic.length + parsed.products.length + parsed.funnel.length + parsed.promotionMetrics.length + parsed.campaigns.length;
    if (rowCount < 1 || rowCount > 100000) throw new Error("QUANTIDADE_DE_LINHAS_INVALIDA");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160);
    const storagePath = `${reportType}/${parsed.periodStart}_${parsed.periodEnd}/${hash}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("shopee-imports").upload(storagePath, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false,
    });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
    const { data: committed, error: commitError } = await admin.rpc("service_commit_shopee_import", {
      p_report_type: reportType, p_period_start: parsed.periodStart, p_period_end: parsed.periodEnd,
      p_file_name: safeText(file.name, 240), p_file_size_bytes: file.size, p_file_hash: hash,
      p_storage_path: storagePath, p_parser_version: parserVersion, p_imported_by: authData.user.id,
      p_validation_summary: { ...parsed.summary, parser_version: parserVersion, workbook_sheets: workbook.SheetNames.length },
      p_sales: parsed.sales, p_traffic: parsed.traffic, p_products: parsed.products, p_funnel: parsed.funnel,
      p_promotion_metrics: parsed.promotionMetrics, p_campaigns: parsed.campaigns,
    });
    if (commitError) throw commitError;
    return reply(request, { ok: true, result: committed, report_type: reportType, period_start: parsed.periodStart,
      period_end: parsed.periodEnd, row_count: rowCount, validation: parsed.summary });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 140) : "UNKNOWN";
    console.error(JSON.stringify({ event: "shopee_report_import_error", error_id: errorId, code }));
    const messages: Record<string, string> = {
      ESTRUTURA_DA_PLANILHA_NAO_RECONHECIDA: "Esta planilha não corresponde ao tipo de relatório selecionado.",
      COLUNAS_OBRIGATORIAS_AUSENTES: "A Shopee alterou ou removeu colunas obrigatórias desta planilha.",
      PERIODO_NAO_LOCALIZADO: "Não foi possível identificar o período da planilha.",
      PERIODO_INVALIDO: "O período informado na planilha é inválido.",
      DATA_INVALIDA: "Uma das datas da planilha não pôde ser validada.",
      RELATORIO_SEM_DADOS_VALIDOS: "A planilha não possui dados válidos para importar.",
      QUANTIDADE_DE_ABAS_INVALIDA: "A estrutura do arquivo não é compatível com os relatórios da Shopee.",
      QUANTIDADE_DE_LINHAS_INVALIDA: "A quantidade de linhas do relatório é inválida.",
    };
    return reply(request, { error: messages[code] || "Não foi possível validar e importar esta planilha.", error_id: errorId }, 400);
  }
});
