// Login / register page logic.
import { $, $$ } from './dom.js';
import { api } from './api.js';
import { LANG, setLang, applyStaticI18n, t } from './i18n.js';
import { toggleTheme } from './theme.js';
import { EYE, EYE_OFF } from './icons.js';

let mode = 'login';   // 'login' | 'register'

function setMode(next) {
  mode = next;
  const reg = mode === 'register';
  $('#tabLogin').classList.toggle('active', !reg);
  $('#tabRegister').classList.toggle('active', reg);
  $('#submitBtn').textContent = t(reg ? 'auth.register' : 'auth.login');
  // show/require nickname + repeat-password only when registering
  $$('.register-only').forEach(el => {
    el.hidden = !reg;
    const input = el.matches('input') ? el : el.querySelector('input');
    if (input) input.required = reg;
  });
  hideError();
}

function showError(key) {
  const el = $('#authError');
  el.textContent = t(key);
  el.hidden = false;
}
function hideError() { $('#authError').hidden = true; }

const ERR = {
  invalid_email: 'auth.err_email',
  invalid_nickname: 'auth.err_nickname',
  weak_password: 'auth.err_weak',
  password_mismatch: 'auth.err_mismatch',
  email_taken: 'auth.err_taken',
  invalid_credentials: 'auth.err_creds',
};

async function submit(e) {
  e.preventDefault();
  hideError();
  const email = $('#email').value.trim();
  const pw = $('#password').value;
  const btn = $('#submitBtn');

  // client-side mismatch check (backend also enforces it)
  if (mode === 'register' && pw !== $('#password2').value) {
    showError('auth.err_mismatch');
    return;
  }
  setLoading(btn, true);

  const res = mode === 'login'
    ? await api.login(email, pw)
    : await api.register({ email, nickname: $('#nickname').value.trim(), password: pw, password2: $('#password2').value });
  if (res.ok) {
    window.location.href = '/';       // authenticated -> app (keep spinner)
    return;
  }
  showError(ERR[res.data && res.data.error] || 'auth.err_generic');
  setLoading(btn, false);
}

// toggle the submit button between idle and loading (spinner)
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
  btn.innerHTML = loading
    ? '<span class="mini-spinner"></span>'
    : t(mode === 'register' ? 'auth.register' : 'auth.login');
}

// show/hide password toggle
function initPwToggles() {
  $$('.pw-toggle').forEach(btn => {
    btn.innerHTML = EYE;
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      input.focus();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = LANG;
  applyStaticI18n();
  initPwToggles();
  setMode('login');

  $('#tabLogin').addEventListener('click', () => setMode('login'));
  $('#tabRegister').addEventListener('click', () => setMode('register'));
  $('#authForm').addEventListener('submit', submit);
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#langSelect').addEventListener('change', e => { setLang(e.target.value); setMode(mode); });
});
