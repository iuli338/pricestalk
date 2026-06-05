// User profile: nickname chip in the header + profile modal with logout.
import { $, esc } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { openModal, closeModal } from './modal.js';

let me = null;   // cached current user

const ACTIONS = {
  close:  () => closeModal(),
  logout: async () => { await api.logout(); window.location.href = '/login'; },
};

// fetch the current user and render the header chip (bold nickname)
export async function initProfile() {
  const res = await api.me();
  if (!res.ok) return;            // auth guard handles redirect
  me = res.data;
  const chip = $('#userChip');
  chip.innerHTML = `<strong>${esc(me.nickname)}</strong>`;
  chip.addEventListener('click', openProfile);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(document.documentElement.lang || 'en',
    { year: 'numeric', month: 'long', day: 'numeric' });
}

function row(labelKey, value) {
  return `<div class="pf-row">
    <span class="pf-label">${t(labelKey)}</span>
    <span class="pf-value">${esc(value)}</span>
  </div>`;
}

function openProfile() {
  openModal(`
    <div class="pf-modal">
    <button class="btn btn-sm close" data-action="close">${t('detail.close')}</button>
    <h2>${t('profile.title')}</h2>
    <div class="pf-card">
      <div class="pf-avatar">${esc((me.nickname || '?').slice(0, 1).toUpperCase())}</div>
      <div class="pf-name">${esc(me.nickname)}</div>
    </div>
    <div class="pf-rows">
      ${row('profile.nickname', me.nickname)}
      ${row('profile.email', me.email)}
      ${row('profile.joined', fmtDate(me.joined_at))}
    </div>
    <div class="pf-footer">
      <button class="btn btn-primary" data-action="logout">${t('header.logout')}</button>
    </div>
    </div>`, { dismissable: true, actions: ACTIONS });
}
