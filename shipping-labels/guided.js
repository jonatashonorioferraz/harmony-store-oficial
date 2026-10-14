/* Screen-only guidance. File parsing, matching and printed layouts stay in their existing modules. */
(function () {
  'use strict';
  if (!globalThis.HarmonyConverterAccess?.allowed()) return;
  const $ = id => document.getElementById(id);
  const root = $('converter');
  if (!root || !$('guide-shopee')) return;
  let platform = null, step = 1, complete = false, stopped = false;
  let state = { busy: false, review: false, generated: false, labels: 0, invoices: 0, ready: false };
  root.classList.add('guided');
  const allowed = () => !stopped && !state.busy && globalThis.HarmonyConverterAccess?.allowed();
  const invoices = document.querySelector('.invoice-upload');
  const documentChoice = document.querySelector('.document-choice');
  const platforms = document.querySelector('.guide-platforms');
  const top = $('guide-step-1');

  function render() {
    root.dataset.step = String(step);
    root.dataset.platform = platform || 'none';
    root.dataset.complete = String(complete);
    root.dataset.hasFiles = String(Boolean(state.labels || state.invoices));
    for (let n = 1; n <= 3; n++) {
      const control = $('guide-step-' + n);
      control.disabled = state.busy || stopped || (n === 2 && !state.review) || (n === 3 && !state.generated);
      if (step === n) control.setAttribute('aria-current', 'step');
      else control.removeAttribute('aria-current');
    }
    for (const [id, value] of [['guide-shopee', 'shopee'], ['guide-ml', 'mercado-livre']]) {
      $(id).disabled = state.busy || stopped;
      $(id).setAttribute('aria-pressed', String(platform === value));
    }
    $('guide-view').disabled = state.busy || stopped;
    $('guide-view').textContent = complete ? 'Voltar ao passo a passo' : 'Visão completa';
    $('guide-view').setAttribute('aria-pressed', String(complete));
    invoices.hidden = platform !== 'mercado-livre';
    documentChoice.hidden = platform !== 'mercado-livre';
    $('files').disabled = state.busy || stopped || !platform;
    $('invoice-files').disabled = state.busy || stopped || platform !== 'mercado-livre';
    $('add-invoices').disabled = state.busy || stopped || platform !== 'mercado-livre';
    $('guide-label-title').textContent = platform === 'shopee' ? 'ZPL com etiquetas e lista' : 'Etiquetas de envio';
    $('guide-upload-description').textContent = platform === 'shopee' ? 'Selecione o ZPL da Shopee. Não é necessário adicionar notas.' : platform ? 'Adicione as etiquetas e os DANFEs dos mesmos pedidos.' : 'Selecione primeiro a plataforma do lote.';
    const note = platform === 'shopee' ? 'Shopee: a lista de empacotamento precisa vir no ZPL exportado. O conversor preserva o conteúdo; não cria uma lista ausente.' : platform ? 'Mercado Livre: ZPL das etiquetas + DANFEs em PDF pesquisável. As notas são vinculadas pela NF e pelo CEP, não pela ordem dos arquivos.' : 'Escolha acima para ver quais arquivos adicionar.';
    $('guide-platform-note').textContent = note + (platform === 'shopee' && state.invoices ? ' Os PDFs já selecionados foram mantidos na sessão, mas não serão usados na Shopee.' : '');
    $('guide-help-platform').textContent = platform === 'shopee' ? 'Na prévia, confira se etiquetas e lista de empacotamento estão presentes no ZPL.' : platform ? 'Cada etiqueta será seguida da ficha dos produtos da nota, sem mudar o modelo de impressão.' : 'Não misture arquivos de plataformas diferentes no mesmo lote.';
    $('check').textContent = state.review ? 'Conferir novamente' : 'Continuar para conferência';
    $('guide-next-hint').textContent = state.busy ? 'Aguarde. Estamos preparando o lote com segurança.' : !platform ? 'Escolha uma plataforma para continuar.' : !state.labels ? 'Adicione o arquivo de etiquetas para continuar.' : platform === 'mercado-livre' && !state.invoices ? 'Agora adicione os DANFEs em PDF deste lote.' : state.generated ? 'Confira a prévia antes de baixar e imprimir.' : state.review ? (state.ready ? 'Revise o resumo abaixo e gere o PDF quando estiver pronto.' : 'Resolva as pendências indicadas. Os arquivos originais estão preservados.') : 'Arquivos selecionados. Vamos conferir antes de gerar.';
    $('guide-back').hidden = step === 1 || complete;
    $('guide-back').disabled = state.busy || stopped;
    $('guide-back').textContent = step === 3 ? 'Voltar à conferência' : 'Voltar aos arquivos';
    // Compatibility with the existing full-workspace shortcuts, added after startup.
    for (const button of document.querySelectorAll('.workspace-actions button')) {
      if (button.textContent === 'Adicionar notas') button.hidden = platform !== 'mercado-livre';
    }
  }

  function go(next) {
    if (!allowed() || (next === 2 && !state.review) || (next === 3 && !state.generated)) return;
    step = next;
    render();
    top.focus({ preventScroll: true });
    top.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function choose(value) {
    if (!allowed() || platform === value) return;
    platform = value; step = 1;
    window.dispatchEvent(new CustomEvent('harmony-labels:platform-change'));
    render();
  }
  $('guide-shopee').addEventListener('click', () => choose('shopee'));
  $('guide-ml').addEventListener('click', () => choose('mercado-livre'));
  for (let n = 1; n <= 3; n++) $('guide-step-' + n).addEventListener('click', () => go(n));
  $('guide-back').addEventListener('click', () => go(step === 3 ? 2 : 1));
  $('guide-view').addEventListener('click', () => { if (allowed()) { complete = !complete; render(); } });
  // Recovery buttons target the original file inputs; the selected files and review
  // stay owned by app.js. Reveal step 1 before focusing a recovery destination.
  for (const id of ['files','invoice-files','file-list','invoice-list']) {
    $(id).addEventListener('focus', () => { if (allowed() && !complete) { step = 1; render(); } });
  }
  window.addEventListener('harmony-labels:guide-reveal', event => {
    if (!allowed()) return;
    const target = event.detail?.target;
    if (!target?.isConnected) return;
    if (target.closest('.guide-upload')) go(1);
    else if (target.closest('.result')) go(3);
    else if (state.review) go(2);
  });
  window.HarmonyLabelsGuide = Object.freeze({
    get platform() { return platform; },
    update(next) {
      if (stopped) return;
      if (next.disposed) { stopped = true; state = { ...next }; render(); return; }
      if (next.generated && !state.generated) step = 3;
      else if (next.review && !state.review) step = 2;
      else if (!next.review && state.review) step = 1;
      state = { ...next }; render();
    }
  });
  window.addEventListener('pagehide', () => { stopped = true; state = { busy: false, review: false, generated: false, labels: 0, invoices: 0 }; platform = null; }, { once: true });
  platforms.hidden = false;
  render();
})();
