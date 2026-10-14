/* Local screen guidance only; parsing, matching and PDF bytes remain owned by app.js. */
(function () {
  'use strict';
  if (!globalThis.HarmonyConverterAccess?.allowed()) return;
  const $ = id => document.getElementById(id);
  const root = $('converter');
  if (!root || !$('guide-shopee')) return;
  let platform = null, step = 1, selecting = true, complete = false, stopped = false;
  let state = { busy: false, review: false, generated: false, labels: 0, invoices: 0, ready: false };
  const invoices = document.querySelector('.invoice-upload');
  const documentChoice = document.querySelector('.document-choice');
  const allowed = () => !stopped && !state.busy && globalThis.HarmonyConverterAccess?.allowed();
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  root.classList.add('guided');

  function render() {
    const screen = selecting ? 'platform' : step === 1 ? 'files' : step === 2 ? 'review' : 'result';
    const current = selecting ? 1 : step === 1 ? 2 : 3;
    root.dataset.step = String(step);
    root.dataset.screen = screen;
    root.dataset.platform = platform || 'none';
    root.dataset.complete = String(complete);
    root.dataset.hasFiles = String(Boolean(state.labels || state.invoices || state.sales));
    root.dataset.retainedInvoices = String(platform === 'shopee' && Boolean(state.invoices));
    root.dataset.busy = String(Boolean(state.busy));
    for (let n = 1; n <= 3; n++) {
      const control = $('guide-step-' + n);
      control.disabled = state.busy || stopped || (n === 2 && !platform) || (n === 3 && !state.review);
      control.dataset.status = n < current || (n === 3 && state.generated && !selecting) ? 'complete' : n === current ? 'current' : 'upcoming';
      const number = control.querySelector('span');
      if (number) number.textContent = control.dataset.status === 'complete' ? '\u2713' : String(n);
      if (current === n) control.setAttribute('aria-current', 'step');
      else control.removeAttribute('aria-current');
    }
    for (const [id, value] of [['guide-shopee', 'shopee'], ['guide-ml', 'mercado-livre']]) {
      $(id).disabled = state.busy || stopped;
      $(id).setAttribute('aria-pressed', String(platform === value));
    }
    $('guide-view').disabled = state.busy || stopped;
    $('guide-view').textContent = complete ? 'Voltar ao passo a passo' : 'Mostrar todas as ferramentas';
    $('guide-view').setAttribute('aria-pressed', String(complete));
    invoices.hidden = platform !== 'mercado-livre';
    documentChoice.hidden = platform !== 'mercado-livre';
    $('files').disabled = state.busy || stopped || !platform;
    $('invoice-files').disabled = state.busy || stopped || platform !== 'mercado-livre';
    $('sales-file').disabled = state.busy || stopped || platform !== 'mercado-livre';
    $('add-invoices').disabled = state.busy || stopped || platform !== 'mercado-livre';
    if ($('guide-context')) $('guide-context').hidden = selecting || !platform;
    if ($('guide-change')) $('guide-change').disabled = state.busy || stopped;
    if (platform) {
      text('guide-marketplace-name', platform === 'shopee' ? 'Shopee' : 'Mercado Livre');
      if ($('guide-marketplace-logo')) $('guide-marketplace-logo').src = platform === 'shopee' ? 'assets/shopee.webp' : 'assets/mercado-livre.webp?v=25.122';
    }
    text('guide-label-title', platform === 'shopee' ? 'Etiquetas + lista de empacotamento' : 'Etiquetas ZPL');
    text('guide-upload-description', platform === 'shopee' ? 'Use o ZPL com a lista de empacotamento incluída.' : 'Selecione as etiquetas ZPL e o Excel de vendas. O DANFE é opcional para a ficha interna.');
    const note = platform === 'shopee' ? 'A lista de empacotamento precisa vir no ZPL exportado. O conversor não cria uma lista ausente.' : 'As etiquetas definem o lote. O Excel pode incluir outras vendas: somente os pedidos das etiquetas serão usados.';
    text('guide-platform-note', note + (platform === 'shopee' && (state.invoices || state.sales) ? ' Os PDFs e o Excel já selecionados foram mantidos na sessão, mas não serão usados na Shopee.' : ''));
    text('guide-help-platform', platform === 'shopee' ? 'Confira se etiquetas e lista estão presentes no ZPL. A lista não é reconstruída pelo conversor.' : 'Cada etiqueta será seguida do documento escolhido nas opções de impressão.');
    text('check', state.review ? 'Conferir novamente' : 'Conferir pedidos');
    let hint = 'Escolha onde você vendeu. Eu te mostro o próximo passo.';
    if (!selecting) {
      if (step === 1) {
        hint = platform === 'shopee' ? 'Na Shopee, use o ZPL que já inclui a lista de empacotamento.' : 'No Mercado Livre, adicione o ZPL e o Excel para gerar as fichas com produtos, quantidades e variações.';
        if (platform === 'mercado-livre' && state.labels && !state.invoices && !state.sales) hint = 'Etiquetas selecionadas! Agora adicione o relatório Excel de vendas.';
        if (state.labels && (platform === 'shopee' || state.invoices || state.sales)) hint = 'Arquivos selecionados. Confira os pedidos antes de imprimir.';
        if (platform === 'mercado-livre' && state.labels && state.invoices && !state.sales) hint = 'Adicione também o Excel de vendas para incluir cores e aromas. Sem ele, a ficha usa apenas a nota fiscal.';
        if (platform === 'mercado-livre' && state.labels && state.mode === 'danfe' && !state.invoices) hint = 'Para imprimir o DANFE completo após a etiqueta, adicione as notas em PDF.';
      } else if (step === 2) {
        hint = !state.ready ? 'Veja o que precisa de atenção e use as soluções indicadas abaixo.' : platform === 'shopee' ? 'Ao gerar, confira na prévia se a lista de empacotamento veio no arquivo.' : 'Revise o resumo e os avisos antes de gerar o PDF.';
      } else hint = 'Confira a prévia antes de baixar. Na impressora, use escala 100%.';
    }
    if (state.busy) hint = 'Aguarde. Estamos preparando o lote com segurança.';
    if (stopped) hint = 'Sessão encerrada. Abra a central novamente pelo app.';
    text('guide-fairy-message', hint);
    text('guide-next-hint', hint);
    $('guide-back').hidden = selecting || complete;
    $('guide-back').disabled = state.busy || stopped;
    $('guide-back').textContent = step === 3 ? 'Voltar à conferência' : step === 2 ? 'Voltar aos arquivos' : 'Voltar';
    if ($('guide-pairing')) $('guide-pairing').hidden = !state.review || platform !== 'mercado-livre';
    if ($('guide-finder')) $('guide-finder').hidden = !state.review && !state.generated;
    for (const button of document.querySelectorAll('.workspace-actions button')) {
      if (button.textContent === 'Adicionar notas') button.hidden = platform !== 'mercado-livre';
    }
  }
  function focusStep() {
    const current = selecting ? 1 : step === 1 ? 2 : 3;
    const target = $('guide-step-' + current);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function go(next) {
    if (!allowed() || !platform || (next === 2 && !state.review) || (next === 3 && !state.generated)) return;
    selecting = false; step = next; render(); focusStep();
  }
  function selectPlatform() {
    if (!allowed()) return;
    selecting = true; step = 1; render(); focusStep();
  }
  function choose(value) {
    if (!allowed()) return;
    const changed = platform !== value;
    platform = value; selecting = false; step = 1;
    if (changed) window.dispatchEvent(new CustomEvent('harmony-labels:platform-change'));
    render(); focusStep();
  }
  $('guide-shopee').addEventListener('click', () => choose('shopee'));
  $('guide-ml').addEventListener('click', () => choose('mercado-livre'));
  $('guide-step-1').addEventListener('click', selectPlatform);
  $('guide-step-2').addEventListener('click', () => go(1));
  $('guide-step-3').addEventListener('click', () => go(state.generated ? 3 : 2));
  $('guide-change')?.addEventListener('click', selectPlatform);
  $('guide-back').addEventListener('click', () => step === 1 ? selectPlatform() : go(step === 3 ? 2 : 1));
  $('guide-view').addEventListener('click', () => { if (allowed()) { complete = !complete; render(); } });
  for (const id of ['files', 'invoice-files', 'sales-file', 'file-list', 'invoice-list']) {
    $(id).addEventListener('focus', () => { if (allowed() && !complete) { selecting = false; step = 1; render(); } });
  }
  window.addEventListener('harmony-labels:guide-reveal', event => {
    if (!allowed()) return;
    const target = event.detail?.target;
    if (!target?.isConnected) return;
    if (target.closest('.guide-upload')) go(1);
    else if (target.closest('.result')) {
      go(3);
      if ($('guide-preview')) $('guide-preview').open = true;
    } else if (state.review) go(2);
    // Search and recovery must reveal their targets even when details start closed.
    let ancestor = target.parentNode;
    while (ancestor && ancestor !== root) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      ancestor = ancestor.parentNode;
    }
  });
  window.HarmonyLabelsGuide = Object.freeze({
    get platform() { return platform; },
    reset(keepPlatform = false) {
      if (!allowed()) return;
      if (!keepPlatform) platform = null;
      selecting = !platform; step = 1; complete = false;
      state = { busy: false, review: false, generated: false, labels: 0, invoices: 0, ready: false };
      for (const details of root.querySelectorAll('details')) details.open = false;
      render(); focusStep();
    },
    update(next) {
      if (stopped) return;
      if (next.disposed) { stopped = true; state = { ...next }; render(); return; }
      if (next.generated && !state.generated) {
        selecting = false; step = 3;
        if ($('guide-preview')) $('guide-preview').open = false;
      } else if (next.review && !state.review) { selecting = false; step = 2; }
      else if (!next.review && state.review) { selecting = !platform; step = 1; }
      state = { ...next }; render();
    }
  });
  window.addEventListener('pagehide', () => { stopped = true; state = { busy: false, review: false, generated: false, labels: 0, invoices: 0 }; platform = null; }, { once: true });
  document.querySelector('.guide-platforms').hidden = false;
  render();
})();
