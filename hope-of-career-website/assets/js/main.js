document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.sr-only').textContent = open ? 'Close navigation' : 'Open navigation';
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }
  const form = document.querySelector('#admissions-form');
  if (form) form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const message = [
      'Admissions enquiry — The Hope of Career Institute',
      'Name: ' + values.get('name'),
      'Contact number: ' + values.get('phone'),
      'Topic: ' + values.get('interest'),
      'Message: ' + values.get('message'),
    ].join('\n');
    const url = 'https://wa.me/923492061126?text=' + encodeURIComponent(message);
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    if (!opened) window.location.href = url;
    const status = document.querySelector('#form-status');
    if (status) status.textContent = 'Your message is ready in WhatsApp. Review it there and tap Send; this website does not store your information.';
  });
});