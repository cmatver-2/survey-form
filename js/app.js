'use strict';

// ── Storage ───────────────────────────────────────────────────
const STORAGE_KEY = 'survey_submissions';

function getSubmissions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveSubmissions(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Toaster ───────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const toaster = document.getElementById('toaster');

  // Bug #1 fix: if a toast with this exact message already exists, don't stack another
  const existing = [...toaster.querySelectorAll('.toast')].find(t => t.textContent === message);
  if (existing) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toaster.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ── Validation Helpers ────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v) { return EMAIL_RE.test(v.trim()); }
function isValidPhone(v) { return /^\d{10}$/.test(v.trim()); }
function wordCount(text)  { return text.trim() === '' ? 0 : text.trim().split(/\s+/).length; }

function setFieldState(input, hint, valid, msg) {
  input.classList.toggle('valid',   valid);
  input.classList.toggle('invalid', !valid);
  if (hint) { hint.textContent = valid ? '' : msg; hint.className = valid ? 'field-hint' : 'field-hint error'; }
}

// ── Duplicate Check ───────────────────────────────────────────
function isDuplicate(field, value) {
  return getSubmissions().some(s => s[field]?.toLowerCase() === value.toLowerCase());
}

// ── Word Count Live Update ────────────────────────────────────
function initWordCount() {
  const msg   = document.getElementById('message');
  const counter = document.getElementById('wordCount');
  const MAX   = 200;
  msg.addEventListener('input', () => {
    const wc = wordCount(msg.value);
    counter.textContent = `${wc} / ${MAX} words`;
    counter.className = wc > MAX ? 'word-count over' : 'word-count';
    if (wc > MAX) {
      // trim to 200 words
      const words = msg.value.trim().split(/\s+/).slice(0, MAX);
      msg.value = words.join(' ');
      counter.textContent = `${MAX} / ${MAX} words`;
    }
  });
}

// ── Phone: only digits ────────────────────────────────────────
function initPhoneFilter() {
  const phone = document.getElementById('phone');

  phone.addEventListener('input', () => {
    phone.value = phone.value.replace(/\D/g, '').slice(0, 10);
  });

  // Bug #7 fix: intercept paste event and strip non-digits before they land
  phone.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digitsOnly = pasted.replace(/\D/g, '').slice(0, 10);
    phone.value = digitsOnly;
  });
}

// ── Email Send (EmailJS) ──────────────────────────────────────
// Bug #4 fix: sends a real confirmation email using EmailJS (free tier)
// SETUP STEPS:
//   1. Go to https://www.emailjs.com and create a free account
//   2. Add an Email Service (Gmail recommended) → copy your Service ID
//   3. Create an Email Template with variables {{to_name}} and {{to_email}}
//      Template body: "Dear {{to_name}}, You have successfully submitted the survey."
//   4. Copy your Template ID and Public Key
//   5. Replace the three placeholder values below with your real IDs

const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';   // e.g. 'service_abc123'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';  // e.g. 'template_xyz456'
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';   // e.g. 'abcDEF123456'

function initEmailJS() {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

function sendConfirmationEmail(name, email) {
  const templateParams = {
    to_name:  name,
    to_email: email,
    message:  'You have successfully submitted the survey.'
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
    .then(() => {
      showToast(`Confirmation email sent to ${email}`, 'info', 5000);
    })
    .catch((err) => {
      console.error('EmailJS error:', err);
      showToast('Submission saved, but email could not be sent.', 'error');
    });
}

// ── Render Submissions ────────────────────────────────────────
function truncateMessage(text) {
  return text.length > 100 ? text.slice(0, 100) + '..............' : text;
}

function renderSubmissions() {
  const list    = document.getElementById('submissionsList');
  const empty   = document.getElementById('emptyState');
  const heading = document.getElementById('submissionsHeading');
  const data    = getSubmissions();

  // Bug #6 fix: hide empty state FIRST before touching the list to prevent flash
  empty.style.display = 'none';
  list.innerHTML = '';

  // Bug #10 fix: show count in heading
  heading.textContent = data.length > 0 ? `Submissions (${data.length})` : 'Submissions';

  if (data.length === 0) { empty.style.display = 'block'; return; }

  [...data].reverse().forEach(s => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div class="entry-name">${escHtml(s.name)}</div>
      <div class="entry-meta">
        <span>${escHtml(s.email)}</span>
        <span>${escHtml(s.phone)}</span>
      </div>
      <div class="entry-message">${escHtml(truncateMessage(s.message))}</div>
      <div class="entry-timestamp">${s.timestamp}</div>
    `;
    list.appendChild(card);
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Form Submit ───────────────────────────────────────────────
function initForm() {
  const form  = document.getElementById('surveyForm');
  const name  = document.getElementById('name');
  const email = document.getElementById('email');
  const phone = document.getElementById('phone');
  const msg   = document.getElementById('message');

  const emailHint = document.getElementById('emailHint');
  const phoneHint = document.getElementById('phoneHint');
  const nameHint  = document.getElementById('nameHint');
  const msgHint   = document.getElementById('messageHint');

  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;

    // Name — Bug #3 fix: must contain at least 2 real letters, not just any characters
    const nameVal = name.value.trim();
    if (nameVal.length < 2 || !/[a-zA-Z]{2,}/.test(nameVal)) {
      setFieldState(name, nameHint, false, 'Please enter a valid name (letters only).');
      valid = false;
    } else {
      setFieldState(name, nameHint, true, '');
    }

    // Email format
    if (!isValidEmail(email.value)) {
      setFieldState(email, emailHint, false, 'Please enter a valid email address.');
      valid = false;
    } else if (isDuplicate('email', email.value.trim())) {
      setFieldState(email, emailHint, false, 'This email is already registered.');
      valid = false;
    } else {
      setFieldState(email, emailHint, true, '');
    }

    // Phone
    if (!isValidPhone(phone.value)) {
      setFieldState(phone, phoneHint, false, 'Phone must be exactly 10 digits.');
      valid = false;
    } else if (isDuplicate('phone', phone.value.trim())) {
      setFieldState(phone, phoneHint, false, 'This phone number is already registered.');
      valid = false;
    } else {
      setFieldState(phone, phoneHint, true, '');
    }

    // Message
    if (msg.value.trim() === '') {
      valid = false;
      setFieldState(msg, msgHint, false, 'Please enter a message.');
    } else if (wordCount(msg.value) > 200) {
      valid = false;
      setFieldState(msg, msgHint, false, 'Message exceeds 200 words.');
    } else {
      setFieldState(msg, msgHint, true, '');
    }

    if (!valid) return;

    // Save
    const submissions = getSubmissions();
    submissions.push({
      name:      name.value.trim(),
      email:     email.value.trim(),
      phone:     phone.value.trim(),
      message:   msg.value.trim(),
      timestamp: new Date().toLocaleString()
    });
    saveSubmissions(submissions);

    showToast('Survey submitted successfully!', 'success');
    sendConfirmationEmail(name.value.trim(), email.value.trim());

    form.reset();
    [name, email, phone, msg].forEach(f => { f.classList.remove('valid','invalid'); });
    msgHint.textContent = '';
    document.getElementById('wordCount').textContent = '0 / 200 words';
    renderSubmissions();
  });
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initEmailJS();
  initWordCount();
  initPhoneFilter();
  initForm();
  renderSubmissions();
});