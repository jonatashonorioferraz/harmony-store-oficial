/* Local session overview and document finder. No file persistence or uploads. */
(function () {
  'use strict';
  if (!globalThis.HarmonyConverterAccess?.allowed()) return;
  const byId = id => document.getElementById(id);
  const layout = document.querySelector('.layout');
  const navigation = byId('navigation');
  const pairing = byId('pairing-report');
  const rows = byId('pairing-rows');
  const resolution = byId('resolution-panel');
  const pending = byId('resolution-items');
  if (!layout || !navigation || !pairing || !rows || !resolution || !pending) return;

  const events = new AbortController();
  let disposed = false;
  let frame = null;
  let state = { files: { labels: [], invoices: [] }, preview: null, busy: false };
  let filter = 'all';
  let resultLimit = 8;
  let located = null;
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const names = { label: 'Etiqueta', picking: 'Ficha de separa\u00e7\u00e3o', invoice: 'DANFE', confirmed: 'Pedido conferido', pending: 'Pend\u00eancia' };
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const action = (text, handler) => {
    const node = make('button', 'secondary workspace-action', text);
    node.type = 'button';
    node.addEventListener('click', handler, { signal: events.signal });
    return node;
  };
  function active() {
    return !disposed && overview.isConnected && globalThis.HarmonyConverterAccess?.allowed() === true;
  }
  function bytes(value) {
    if (value >= 1000000) return number.format(value / 1000000) + ' MB';
    if (value >= 1000) return number.format(value / 1000) + ' KB';
    return number.format(value) + ' B';
  }

  const overview = make('section', 'panel workspace-overview');
  overview.setAttribute('aria-labelledby', 'workspace-overview-title');
  const overviewHead = make('div', 'workspace-head');
  const heading = make('div', 'workspace-heading');
  const title = make('h2', '', 'Seu lote em um lugar');
  title.id = 'workspace-overview-title';
  heading.append(title, make('p', '', 'Adicione arquivos aos poucos, sem perder o que j\u00e1 selecionou.'));
  const sessionStatus = make('span', 'workspace-status', 'Nenhum arquivo selecionado');
  overviewHead.append(heading, sessionStatus);
  const metrics = make('dl', 'workspace-metrics');
  function metric(label) {
    const cell = make('div', 'workspace-metric');
    const value = make('dd', '', '0');
    cell.append(make('dt', '', label), value);
    metrics.append(cell);
    return value;
  }
  const labelCount = metric('Arquivos de etiquetas');
  const invoiceCount = metric('PDFs de notas');
  const sizeCount = metric('Tamanho total selecionado');
  const sessionActions = make('div', 'workspace-actions');
  const addLabels = action('Adicionar etiquetas', () => { if (active() && !state.busy) byId('files')?.click(); });
  const addInvoices = action('Adicionar notas', () => { if (active() && !state.busy) byId('invoice-files')?.click(); });
  const manage = action('Gerenciar sele\u00e7\u00e3o', () => {
    if (!active()) return;
    byId('upload-title')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    byId('files')?.focus({ preventScroll: true });
  });
  sessionActions.append(addLabels, addInvoices, manage);
  const inventory = make('details', 'workspace-inventory');
  const inventoryTitle = make('summary', '', 'Arquivos desta sess\u00e3o');
  const inventoryList = make('ul', 'workspace-file-inventory');
  inventory.append(inventoryTitle, inventoryList);
  const privacy = make('p', 'workspace-note', 'Estes n\u00fameros contam arquivos, n\u00e3o pedidos. A leitura e a confer\u00eancia continuam locais; a sele\u00e7\u00e3o n\u00e3o fica salva ao fechar ou recarregar a central.');
  overview.append(overviewHead, metrics, sessionActions, inventory, privacy);
  layout.before(overview);

  const finder = make('section', 'panel workspace-finder');
  finder.hidden = true;
  finder.setAttribute('aria-labelledby', 'workspace-finder-title');
  const finderHead = make('div', 'workspace-head');
  const finderHeading = make('div', 'workspace-heading');
  const finderTitle = make('h2', '', 'Localizar pedido no lote');
  finderTitle.id = 'workspace-finder-title';
  finderHeading.append(finderTitle, make('p', '', 'Busque a NF ou o envio. Os resultados s\u00e3o atalhos, n\u00e3o alteram o lote.'));
  finderHead.append(finderHeading);
  const searchRow = make('div', 'workspace-search-row');
  const searchLabel = make('label', 'workspace-search-label', 'NF ou c\u00f3digo de envio');
  const search = make('input', 'workspace-search-input');
  search.id = 'workspace-search';
  search.type = 'search';
  search.placeholder = 'Ex.: NF 123 ou c\u00f3digo de envio';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.maxLength = 100;
  searchLabel.htmlFor = search.id;
  searchLabel.append(search);
  const clearSearch = action('Limpar busca', () => {
    if (!active()) return;
    search.value = '';
    filter = 'all';
    resultLimit = 8;
    renderResults();
    search.focus();
  });
  searchRow.append(searchLabel, clearSearch);
  const filters = make('div', 'workspace-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Tipo de resultado');
  const filterButtons = new Map();
  for (const [value, label] of [['all', 'Todos'], ['label', 'Etiquetas'], ['picking', 'Fichas'], ['invoice', 'DANFEs'], ['pending', 'Pend\u00eancias']]) {
    const control = action(label, () => {
      if (!active()) return;
      filter = value;
      resultLimit = 8;
      renderResults();
    });
    control.setAttribute('aria-pressed', String(value === 'all'));
    filterButtons.set(value, control);
    filters.append(control);
  }
  const resultSummary = make('p', 'workspace-result-summary');
  resultSummary.setAttribute('role', 'status');
  resultSummary.setAttribute('aria-live', 'polite');
  const results = make('div', 'workspace-results');
  const showMore = action('Mostrar mais resultados', () => {
    if (!active()) return;
    resultLimit += 8;
    renderResults();
  });
  showMore.hidden = true;
  const searchHint = make('p', 'workspace-note', 'A lista original de pend\u00eancias permanece completa abaixo. A busca n\u00e3o aprova v\u00ednculos nem inclui pedidos no PDF.');
  finder.append(finderHead, searchRow, filters, resultSummary, results, showMore, searchHint);
  const finderSlot = byId('guide-finder-body');
  if (finderSlot) finderSlot.append(finder);
  else resolution.before(finder);

  const jump = make('div', 'workspace-page-jump');
  jump.hidden = true;
  const pageLabel = make('label', '', 'Ir para a p\u00e1gina');
  const pageInput = make('input', 'workspace-page-input');
  pageInput.id = 'workspace-page-number';
  pageInput.type = 'number';
  pageInput.inputMode = 'numeric';
  pageInput.min = '1';
  pageInput.step = '1';
  pageLabel.htmlFor = pageInput.id;
  const totalPages = make('span', 'workspace-page-total');
  const go = action('Ir', () => openPage(Number(pageInput.value), true));
  go.setAttribute('aria-label', 'Abrir a p\u00e1gina indicada na pr\u00e9via');
  jump.append(pageLabel, pageInput, totalPages, go);
  navigation.after(jump);

  function openPage(value, fromInput = false) {
    if (!active() || !state.preview || state.busy) return;
    const max = state.preview.pages.length;
    if (!Number.isInteger(value) || value < 1 || value > max) {
      if (fromInput) {
        pageInput.setCustomValidity('Informe uma p\u00e1gina de 1 a ' + max + '.');
        pageInput.reportValidity();
      }
      return;
    }
    pageInput.setCustomValidity('');
    window.dispatchEvent(new CustomEvent('harmony-labels:preview-page', { detail: { page: value } }));
    window.dispatchEvent(new CustomEvent('harmony-labels:guide-reveal', { detail: { target: byId('result-title') } }));
    byId('result-title')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  pageInput.addEventListener('input', () => pageInput.setCustomValidity(''), { signal: events.signal });
  pageInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    openPage(Number(pageInput.value), true);
  }, { signal: events.signal });
  search.addEventListener('input', () => { resultLimit = 8; renderResults(); }, { signal: events.signal });

  // Search document identifiers only, never page, sheet, file or error numbers.
  function pendingIdentifiers(title) {
    const invoiceNumber = title.match(/\bNF\s*[:#]?\s*(\d+)\b/i)?.[1] || '';
    const shipment = title.match(/\b(?:Envio|Remessa)\s*[:#]?\s*([a-z0-9-]+)/i)?.[1] || '';
    return { invoiceNumber, shipmentId: /\d/.test(shipment) ? shipment : '' };
  }
  function matchesSearch(item, query) {
    if (!query) return true;
    const normalizedNumber = value => String(value || '').replace(/^0+(?=\d)/, '');
    const invoiceNumber = normalizedNumber(item.invoiceNumber);
    const shipmentId = fold(item.shipmentId).replace(/\s+/g, '');
    const invoiceQuery = query.match(/^(?:nf(?:-?e)?|nota(?: fiscal)?)\s*[:#.-]?\s*(\d+)$/);
    if (invoiceQuery) return invoiceNumber === normalizedNumber(invoiceQuery[1]);
    if (/^(?:nf(?:-?e)?|nota(?: fiscal)?)(?:\s|$)/.test(query)) return false;
    const shipmentQuery = query.replace(/^(?:envio|remessa)\s*[:#]?\s*/,'').replace(/\s+/g, '');
    const explicitShipment = /^(?:envio|remessa)(?:\s|:|#)/.test(query);
    return Boolean(shipmentQuery) && (
      (!explicitShipment && /^\d+$/.test(query) && invoiceNumber === normalizedNumber(query)) ||
      (Boolean(shipmentId) && shipmentId.includes(shipmentQuery))
    );
  }

  function resultItems() {
    const items = [];
    if (state.preview) {
      for (const page of state.preview.pages) {
        const kind = names[page.kind] ? page.kind : 'label';
        const details = [page.invoiceNumber ? 'NF ' + page.invoiceNumber : '', page.shipmentId ? 'Envio ' + page.shipmentId : '', page.totalSheets > 1 ? 'Folha ' + page.sheet + '/' + page.totalSheets : ''].filter(Boolean).join(' \u00b7 ');
        items.push({ kind, invoiceNumber: page.invoiceNumber, shipmentId: page.shipmentId, title: names[kind] + ' \u00b7 p\u00e1gina ' + page.page, details: details || 'Etiqueta sem nota vinculada', page: page.page });
      }
    } else if (!pairing.hidden) {
      for (const row of rows.querySelectorAll('tr')) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) continue;
        items.push({ kind: 'confirmed', invoiceNumber: cells[1].textContent.trim().match(/^\d+/)?.[0] || '', shipmentId: cells[0].textContent.trim(), title: 'NF ' + cells[1].textContent.trim() + ' \u00b7 Envio ' + cells[0].textContent.trim(), details: 'V\u00ednculo conferido; o PDF ainda precisa ser gerado. ' + cells[3].textContent.trim(), target: row });
      }
    }
    if (!resolution.hidden) {
      for (const card of pending.querySelectorAll('article')) {
        const title = card.querySelector('h3')?.textContent || 'Pend\u00eancia do lote';
        items.push({ kind: 'pending', ...pendingIdentifiers(title), title, details: [...card.querySelectorAll('p')].map(p => p.textContent).join(' '), target: card });
      }
    }
    return items;
  }

  function locate(target) {
    if (!active() || !target?.isConnected) return;
    window.dispatchEvent(new CustomEvent('harmony-labels:guide-reveal', { detail: { target } }));
    located?.classList.remove('workspace-located');
    located = target;
    target.classList.add('workspace-located');
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  function renderResults() {
    if (disposed) return;
    const source = resultItems();
    const query = fold(search.value).trim();
    const matching = source.filter(item => (filter === 'all' || item.kind === filter) && matchesSearch(item, query));
    for (const [kind, control] of filterButtons) {
      control.setAttribute('aria-pressed', String(filter === kind));
      control.disabled = state.busy || (kind !== 'all' && !source.some(item => item.kind === kind));
    }
    results.replaceChildren();
    const displayed = matching.slice(0, resultLimit);
    for (const item of displayed) {
      const card = make('article', 'workspace-result-card');
      card.dataset.kind = item.kind;
      card.append(make('span', 'workspace-result-type', names[item.kind]), make('h3', '', item.title), make('p', '', item.details));
      const link = make('button', 'secondary workspace-action', item.page ? 'Ver p\u00e1gina ' + item.page : item.kind === 'pending' ? 'Ver como resolver' : 'Ver confer\u00eancia');
      link.type = 'button';
      link.disabled = state.busy;
      link.onclick = () => item.page ? openPage(item.page) : locate(item.target);
      card.append(link);
      results.append(card);
    }
    showMore.hidden = matching.length <= resultLimit;
    clearSearch.disabled = !search.value && filter === 'all';
    if (state.busy) resultSummary.textContent = 'Aguarde a opera\u00e7\u00e3o atual para navegar pelos resultados.';
    else if (!source.length) resultSummary.textContent = 'Confira o lote para localizar v\u00ednculos e pend\u00eancias. Depois de gerar o PDF, voc\u00ea tamb\u00e9m poder\u00e1 abrir cada p\u00e1gina diretamente.';
    else if (!matching.length) resultSummary.textContent = 'Nenhum resultado para esta busca. Limpe o filtro ou confira o n\u00famero informado; os arquivos do lote n\u00e3o foram alterados.';
    else resultSummary.textContent = displayed.length + ' de ' + matching.length + ' resultado(s)' + (state.preview?.partial ? ' \u00b7 PDF parcial: somente as p\u00e1ginas inclu\u00eddas est\u00e3o dispon\u00edveis.' : '.');
  }

  function render() {
    const labels = state.files.labels;
    const invoices = state.files.invoices;
    const sales = state.files.sales || [];
    const all = [...labels, ...invoices, ...sales];
    labelCount.textContent = String(labels.length);
    invoiceCount.textContent = String(invoices.length);
    sizeCount.textContent = bytes(all.reduce((sum, file) => sum + file.size, 0));
    sessionStatus.textContent = state.busy ? 'Processando o lote' : state.preview ? (state.preview.partial ? 'PDF parcial pronto' : 'PDF pronto') : all.length ? 'Arquivos selecionados' : 'Nenhum arquivo selecionado';
    sessionStatus.dataset.ready = String(Boolean(state.preview));
    addLabels.disabled = state.busy;
    addInvoices.disabled = state.busy;
    manage.disabled = state.busy;
    inventory.hidden = !all.length;
    inventoryTitle.textContent = 'Arquivos desta sess\u00e3o (' + all.length + ')';
    inventoryList.replaceChildren();
    for (const [files, kind] of [[labels, 'Etiqueta'], [invoices, 'Nota'], [sales, 'Vendas']]) {
      for (const file of files) {
        const item = make('li', 'workspace-file');
        item.append(make('span', 'workspace-file-kind', kind), make('span', 'workspace-file-name', file.name), make('span', 'workspace-file-size', bytes(file.size)));
        inventoryList.append(item);
      }
    }
    finder.hidden = !all.length;
    search.disabled = state.busy;
    jump.hidden = !state.preview;
    pageInput.disabled = state.busy;
    go.disabled = state.busy;
    if (state.preview) {
      pageInput.max = String(state.preview.pages.length);
      totalPages.textContent = 'de ' + state.preview.pages.length;
      if (document.activeElement !== pageInput) pageInput.value = String(state.preview.page);
    } else {
      pageInput.value = '';
      totalPages.textContent = '';
      pageInput.setCustomValidity('');
      if (['label', 'picking', 'invoice'].includes(filter)) filter = 'all';
    }
    if (!all.length) { search.value = ''; filter = 'all'; resultLimit = 8; }
    renderResults();
  }

  window.addEventListener('harmony-labels:workspace-state', event => {
    if (disposed || !overview.isConnected) return;
    const detail = event.detail;
    if (!detail || !Array.isArray(detail.files?.labels) || !Array.isArray(detail.files?.invoices)) return;
    state = detail;
    render();
  }, { signal: events.signal });

  function requestState() {
    frame = null;
    if (!overview.isConnected) { dispose(); return; }
    if (!active()) return;
    window.dispatchEvent(new CustomEvent('harmony-labels:workspace-request'));
  }
  function scheduleState() {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(requestState);
  }
  const observer = new MutationObserver(scheduleState);
  for (const node of [byId('file-list'), byId('invoice-list'), byId('sales-name'), rows, pending, byId('preview-caption')]) {
    if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
  }
  for (const node of [navigation, byId('actions'), pairing, resolution]) {
    if (node) observer.observe(node, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (byId('convert')) observer.observe(byId('convert'), { attributes: true, attributeFilter: ['disabled'] });
  observer.observe(document.body, { childList: true });

  window.addEventListener('harmony-labels:batch-reset', () => {
    if (!active()) return;
    search.value = ''; filter = 'all'; resultLimit = 8;
    pageInput.value = ''; pageInput.setCustomValidity('');
    located?.classList.remove('workspace-located'); located = null;
    requestState();
  }, { signal: events.signal });

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    events.abort();
    if (frame !== null) cancelAnimationFrame(frame);
    located?.classList.remove('workspace-located');
    located = null;
    state = { files: { labels: [], invoices: [] }, preview: null, busy: false };
    inventoryList.replaceChildren();
    results.replaceChildren();
    search.value = '';
    pageInput.value = '';
  }
  window.addEventListener('pagehide', dispose, { once: true, signal: events.signal });
  requestState();
})();
