export function initializePublicDialogs() {
  if (document.documentElement.dataset.publicDialogsReady) return;
  document.documentElement.dataset.publicDialogsReady = 'true';
  const states = new WeakMap();
  const back = dialog => {
    const state = states.get(dialog); if (!state) return false;
    state.panel.remove(); for (const [node, hidden] of state.children) node.hidden = hidden;
    dialog.setAttribute('aria-labelledby', state.labelledBy);
    states.delete(dialog); state.opener.focus(); return true;
  };
  const resize = () => {
    if (!window.visualViewport) return;
    for (const dialog of document.querySelectorAll('.public-dialog')) {
      dialog.style.setProperty('--dialog-viewport-height', `${Math.max(160, window.visualViewport.height - 16)}px`);
      if (dialog.open && window.visualViewport.width <= 620) dialog.style.bottom = `${Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop)}px`;
    }
  };
  window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize); resize();
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-modal-close], [data-legal-document], [data-legal-back]') : null;
    const dialog = target?.closest('dialog.public-dialog');
    if (!dialog) return;
    if (target.hasAttribute('data-modal-close')) { back(dialog); dialog.close(); return; }
    if (target.hasAttribute('data-legal-back')) { back(dialog); return; }
    const template = document.querySelector(`template[data-legal-template="${target.dataset.legalDocument}"]`);
    if (!template || states.has(dialog)) return;
    event.preventDefault();
    const children = [...dialog.children].map(node => [node, node.hidden]);
    for (const [node] of children) node.hidden = true;
    const panel = document.createElement('div'); panel.className = 'flow-card';
    const header = document.createElement('div'); header.className = 'flow-header';
    const title = document.createElement('h2'); title.id = `${dialog.id}-legal-title`; title.textContent = target.dataset.legalDocument === 'PRIVACY' ? 'Политика конфиденциальности' : 'Согласие на обработку данных'; title.tabIndex = -1;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'flow-close'; close.setAttribute('data-modal-close', ''); close.setAttribute('aria-label', 'Закрыть');
    const icon = document.createElement('img'); icon.src = dialog.querySelector('.flow-close img')?.src || document.querySelector('.flow-close img').src; icon.width = icon.height = 24; icon.alt = ''; close.append(icon);
    header.append(title, close); panel.append(header, template.content.cloneNode(true));
    const returnButton = document.createElement('button'); returnButton.type = 'button'; returnButton.className = 'flow-button flow-button-secondary'; returnButton.textContent = 'Вернуться к форме'; returnButton.setAttribute('data-legal-back', ''); panel.append(returnButton);
    const labelledBy = dialog.getAttribute('aria-labelledby');
    dialog.append(panel); states.set(dialog, { panel, children, opener: target, labelledBy }); dialog.setAttribute('aria-labelledby', title.id); title.focus();
  });
  for (const dialog of document.querySelectorAll('dialog.public-dialog')) {
    dialog.addEventListener('cancel', event => { if (back(dialog)) event.preventDefault(); });
    dialog.addEventListener('close', () => { back(dialog); dialog.style.removeProperty('bottom'); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  }
}
