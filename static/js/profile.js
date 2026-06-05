// User profile: nickname chip in the header + profile modal with logout.
import { $, esc } from './dom.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { openModal, closeModal } from './modal.js';

let me = null;   // cached current user

let delTimer = null;   // countdown interval for the delete-confirm button

function stopTimer() { clearInterval(delTimer); delTimer = null; }

const ACTIONS = {
  close:  () => { stopTimer(); closeModal(); },
  logout: async () => { await api.logout(); window.location.href = '/login'; },
  askDelete: () => openDeleteConfirm(),
  backProfile: () => { stopTimer(); openProfile(); },
  confirmDelete: async () => { stopTimer(); await api.deleteAccount(); window.location.href = '/login'; },
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
      <button class="btn pf-delete" data-action="askDelete">${t('profile.delete')}</button>
    </div>
    </div>`, { dismissable: true, actions: ACTIONS });
}

// confirm modal with a 5s countdown before the delete button is enabled
function openDeleteConfirm() {
  openModal(`
    <div class="pf-modal">
    <h2>${t('profile.delete_title')}</h2>
    <p class="muted">${t('profile.delete_warn')}</p>
    <div class="pf-footer">
      <button class="btn" data-action="backProfile">${t('title.cancel')}</button>
      <button id="confirmDel" class="btn btn-danger" data-action="confirmDelete" disabled></button>
    </div>
    </div>`, { dismissable: true, actions: ACTIONS, onDismiss: () => { stopTimer(); closeModal(); } });

  // 5s countdown on the confirm button
  const btn = $('#confirmDel');
  let left = 5;
  const tick = () => {
    if (left > 0) {
      btn.textContent = `${t('profile.delete_confirm')} (${left})`;
      btn.disabled = true;
      left--;
    } else {
      btn.textContent = t('profile.delete_confirm');
      btn.disabled = false;
      clearInterval(delTimer);
    }
  };
  tick();
  clearInterval(delTimer);
  delTimer = setInterval(tick, 1000);
}
