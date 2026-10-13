/* Screen-only PDF preview controls. Never changes PDF bytes or print settings. */
(function () {
  'use strict';
  if (!globalThis.HarmonyConverterAccess?.allowed()) return;
  const byId = id => document.getElementById(id);
  const stage = byId('preview');
  const caption = byId('preview-caption');
  const navigation = byId('navigation');
  const actions = byId('actions');
  const layout = stage?.closest('.layout');
  const panel = stage?.closest('.result');
  if (!stage || !caption || !navigation || !actions || !layout || !panel) return;

  const events = new AbortController();
  let zoom = 100;
  let canvas = null;
  let expanded = false;
  let disposed = false;
  let ready = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const tools = element('div', 'preview-tools');
  tools.hidden = true;
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Controles da pr\u00e9via, sem alterar a impress\u00e3o');
  const zoomGroup = element('div', 'preview-tools-zoom');
  const zoomText = element('output', 'preview-tools-value', 'Ajustada \u00e0 tela');
  zoomText.setAttribute('aria-live', 'polite');
  zoomText.setAttribute('aria-atomic', 'true');

  function button(text, label) {
    const node = element('button', 'secondary preview-tool', text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.setAttribute('aria-controls', 'preview');
    node.title = label;
    return node;
  }

  const less = button('-', 'Reduzir a pr\u00e9via');
  const more = button('+', 'Ampliar a pr\u00e9via');
  const fit = button('Ajustar \u00e0 tela', 'Ajustar a p\u00e1gina \u00e0 tela');
  const expand = button('Expandir pr\u00e9via', 'Expandir a \u00e1rea da pr\u00e9via');
  expand.setAttribute('aria-pressed', 'false');
  zoomGroup.append(less, zoomText, more);
  tools.append(zoomGroup, fit, expand);

  const help = element('p', 'preview-tools-help',
    'O zoom muda apenas esta tela, n\u00e3o o PDF. Para imprimir, mantenha escala 100% na impressora. Com a pr\u00e9via em foco, use +, - e 0; arraste as barras para ver os detalhes.');
  help.id = 'preview-tools-help';
  help.hidden = true;
  caption.classList.add('preview-document-caption');
  stage.before(caption, tools);
  stage.after(help);

  function active() {
    return !disposed && stage.isConnected && globalThis.HarmonyConverterAccess?.allowed() === true;
  }

  function sizePage() {
    if (!ready || !canvas || disposed) return;
    const ratio = canvas.width / canvas.height;
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const width = Math.max(1, stage.clientWidth - 32);
    const height = Math.max(1, stage.clientHeight - 32);
    const fittedWidth = Math.min(width, height * ratio);
    canvas.style.width = Math.max(1, Math.floor(fittedWidth * zoom / 100)) + 'px';
    less.disabled = zoom <= 50;
    more.disabled = zoom >= 300;
    zoomText.textContent = zoom === 100 ? 'Ajustada \u00e0 tela' : zoom + '% da pr\u00e9via';
    zoomText.setAttribute('aria-label', 'Zoom da pr\u00e9via: ' + zoom + '% do ajuste \u00e0 tela');
  }

  function resetZoom(value) {
    if (!active() || !ready) return;
    zoom = Math.max(50, Math.min(300, value));
    sizePage();
    stage.scrollTop = 0;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
  }

  function setExpanded(value) {
    expanded = value;
    layout.classList.toggle('preview-expanded', value);
    expand.textContent = value ? 'Recolher pr\u00e9via' : 'Expandir pr\u00e9via';
    const label = value ? 'Recolher a \u00e1rea da pr\u00e9via' : 'Expandir a \u00e1rea da pr\u00e9via';
    expand.setAttribute('aria-label', label);
    expand.title = label;
    expand.setAttribute('aria-pressed', String(value));
    sizePage();
  }

  less.addEventListener('click', () => resetZoom(zoom - 25), { signal: events.signal });
  more.addEventListener('click', () => resetZoom(zoom + 25), { signal: events.signal });
  fit.addEventListener('click', () => resetZoom(100), { signal: events.signal });
  expand.addEventListener('click', () => {
    if (!active() || !ready) return;
    setExpanded(!expanded);
    panel.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, { signal: events.signal });
  stage.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target !== stage) return;
    const value = event.key === '+' || event.key === '=' ? zoom + 25 :
      event.key === '-' ? zoom - 25 : event.key === '0' ? 100 : null;
    if (value === null || !ready) return;
    event.preventDefault();
    resetZoom(value);
  }, { signal: events.signal });

  function refresh() {
    if (disposed) return;
    if (!stage.isConnected) { dispose(); return; }
    const next = stage.querySelector('canvas');
    const changed = next !== canvas;
    canvas = next;
    ready = Boolean(canvas && !navigation.hidden && !actions.hidden);
    tools.hidden = !ready;
    help.hidden = !ready;
    stage.classList.toggle('preview-inspect', ready);
    if (!ready) {
      zoom = 100;
      setExpanded(false);
      stage.removeAttribute('tabindex');
      stage.removeAttribute('role');
      stage.removeAttribute('aria-label');
      stage.removeAttribute('aria-describedby');
      delete caption.dataset.documentKind;
      return;
    }
    const text = caption.textContent.trim();
    caption.dataset.documentKind = text.startsWith('Ficha') ? 'picking' : text.startsWith('DANFE') ? 'danfe' : 'label';
    stage.tabIndex = 0;
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', 'Pr\u00e9via do PDF: ' + text);
    stage.setAttribute('aria-describedby', help.id);
    sizePage();
    if (changed) { stage.scrollLeft = 0; stage.scrollTop = 0; }
  }

  const observer = new MutationObserver(refresh);
  observer.observe(stage, { childList: true });
  observer.observe(caption, { childList: true, subtree: true, characterData: true });
  observer.observe(navigation, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(actions, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(document.body, { childList: true });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(sizePage) : null;
  resize?.observe(stage);
  window.addEventListener('resize', sizePage, { signal: events.signal });

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    canvas = null;
    observer.disconnect();
    resize?.disconnect();
    events.abort();
  }
  window.addEventListener('pagehide', dispose, { once: true, signal: events.signal });
  refresh();
})();
