import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializePublicDialogs } from '../apps/web/src/lib/public-dialogs.mjs';

// Event/DOM fixture exercises the shipped dialog controller without a browser dependency.
class Node extends EventTarget {
  constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); }
  dataset = {}; attributes = new Map(); children = []; hidden = false; style = { removeProperty() {}, setProperty() {} };
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; this.dispatchEvent(new Event('close')); }
  querySelector() { return null; }
  cloneNode() { const node = new Node(this.tagName); node.textContent = this.textContent; return node; }
  closest(selector) {
    if (selector === 'dialog.public-dialog') return this.parentDialog ?? null;
    if (selector === '[data-home-callback-form]') return this.inlineForm ?? null;
    return this.hasAttribute('data-legal-document') || this.hasAttribute('data-legal-back') || this.hasAttribute('data-modal-close') ? this : null;
  }
}

test('inline legal document preserves its form and focus while nested FLOW documents keep their return panel', t => {
  const previous = Object.fromEntries(['document', 'window', 'Element'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const document = new Node(), nested = new Node('dialog'), base = new Node(), hidden = new Node(), icon = new Node('img');
  document.documentElement = new Node('html'); document.body = new Node('body');
  hidden.hidden = true; nested.append(base, hidden); nested.id = 'callback'; nested.setAttribute('aria-labelledby', 'callback-title');
  const template = { content: new Node() }; template.content.textContent = 'Существующий текст документа'; icon.src = '/versioned/close.svg';
  document.querySelector = selector => selector.startsWith('template[data-legal-template=') ? template : selector === '.flow-close img' ? icon : null;
  document.querySelectorAll = () => [nested]; document.createElement = tag => new Node(tag);
  Object.assign(globalThis, { document, window: {}, Element: Node });
  initializePublicDialogs();
  const click = target => { const event = new Event('click', { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); document.dispatchEvent(event); return event; };
  const link = new Node('a'); link.setAttribute('data-legal-document', 'PERSONAL_DATA_CONSENT'); link.dataset.legalDocument = 'PERSONAL_DATA_CONSENT';
  const form = { phone: '+7 (999) 123-45-67', consent: true }; link.inlineForm = form;
  assert.equal(click(link).defaultPrevented, true);
  const dialog = document.body.children[0]; assert.equal(dialog.id, 'site-inline-legal'); assert.equal(dialog.open, true);
  assert.equal(document.activeElement.tagName, 'H2'); assert.equal(dialog.children.length, 1);
  const back = dialog.children[0].children.at(-1); back.parentDialog = dialog;
  click(back); assert.equal(dialog.open, false); assert.equal(document.body.children.length, 0); assert.equal(document.activeElement, link);
  assert.deepEqual(form, { phone: '+7 (999) 123-45-67', consent: true });
  click(link); const escaped = document.body.children[0]; const cancel = new Event('cancel', { cancelable: true }); escaped.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true); assert.equal(escaped.open, false); assert.equal(document.activeElement, link);
  assert.equal(document.body.children.length, 0);
  nested.showModal(); const nestedLink = new Node('a'); nestedLink.setAttribute('data-legal-document', 'PRIVACY'); nestedLink.dataset.legalDocument = 'PRIVACY'; nestedLink.parentDialog = nested;
  click(nestedLink); assert.equal(base.hidden, true); assert.equal(hidden.hidden, true);
  const nestedBack = nested.children.at(-1).children.at(-1); nestedBack.parentDialog = nested; click(nestedBack);
  assert.equal(nested.open, true); assert.equal(base.hidden, false); assert.equal(hidden.hidden, true); assert.equal(nested.getAttribute('aria-labelledby'), 'callback-title'); assert.equal(document.activeElement, nestedLink);
});
