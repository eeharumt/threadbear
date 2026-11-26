function installSignInForm(expectedOrigin) {
  if (location.origin !== expectedOrigin) return;

  function addForm() {
    const page = document.querySelector('main.signin');
    if (!page || document.querySelector('#threadbear-tauri-sign-in')) return;

    const form = document.createElement('form');
    form.id = 'threadbear-tauri-sign-in';

    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.required = true;
    input.placeholder = 'Paste a sign-in link';
    input.setAttribute('aria-label', 'Threadbear sign-in link');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Sign in to this app';
    form.append(input, submit);

    input.addEventListener('input', () => input.setCustomValidity(''));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let code;
      try {
        const link = new URL(input.value.trim());
        if (link.protocol === 'https:' && link.origin === expectedOrigin && !link.username && !link.password) {
          const params = new URLSearchParams(link.hash.slice(1));
          if (!params.has('token')) code = params.get('code');
        }
      } catch {}

      if (!/^tbp_[0-9a-f]{16,128}$/.test(code ?? '')) {
        input.setCustomValidity('Paste a one-time sign-in link for this Threadbear site.');
        input.reportValidity();
        return;
      }

      input.value = '';
      history.replaceState(null, '', '#' + new URLSearchParams({ code }));
      location.reload();
    });

    page.append(form);
  }

  new MutationObserver(addForm).observe(document, { childList: true, subtree: true });
  addForm();
}
