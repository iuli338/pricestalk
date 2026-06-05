// Modal: render HTML into the shared overlay + action delegation.
//
// Instead of inline onclick, modal content uses data-action="name" (+ data-*).
// A handler map is registered per open; one delegated click listener dispatches.
import { $ } from './dom.js';

let dismissable = true;
let onDismiss = null;
let actions = {};   // { actionName: (el, dataset) => void }

// open the modal with html; opts: { dismissable, onDismiss, actions }
export function openModal(html, opts = {}) {
  dismissable = opts.dismissable !== false;
  onDismiss = opts.onDismiss || null;
  actions = opts.actions || {};
  $('#modal').innerHTML = html;
  const bg = $('#modalBg');
  bg.classList.add('open');
}

export function closeModal() {
  $('#modalBg').classList.remove('open');
  actions = {};
  onDismiss = null;
}

export function isOpen() {
  return $('#modalBg').classList.contains('open');
}

// wire the single delegated listeners once at startup
export function initModal() {
  const bg = $('#modalBg');

  // backdrop click -> dismiss
  bg.addEventListener('click', e => {
    if (e.target === bg && dismissable) {
      if (onDismiss) onDismiss(); else closeModal();
    }
  });

  // action delegation: clicks on [data-action] inside the modal
  $('#modal').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.stopPropagation(); fn(el, el.dataset); }
  });
}
