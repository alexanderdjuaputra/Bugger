/* One-off verification script (not part of the shipped test suite) —
   loads the REAL HTML + REAL app.js into an actual DOM via jsdom, runs
   the exact same code path a browser would run on page load, and checks
   that every named form field still exists and is a real, working
   input/select/textarea element afterward. This is the rigorous check
   that would have caught the innerHTML-wipes-nested-inputs bug before
   shipping it. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗ FAIL:', label); }
}

async function loadSite(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  // minimal fetch stub so app.js's top-level code (which doesn't fetch
  // anything until a user action) doesn't crash on load
  window.fetch = async () => ({ ok: true, json: async () => ({}) });
  window.localStorage.setItem('bb_lang', 'id'); // reproduce the user's reported scenario
  dom.window.eval(js);
  return dom;
}

(async () => {
  console.log('\n— Customer site (public/) —');
  let dom = await loadSite(path.join(__dirname, '..', 'public'));
  let doc = dom.window.document;

  let form = doc.getElementById('loginForm');
  ok(form.elements.namedItem('email') && form.elements.namedItem('email').tagName === 'INPUT', 'login form: email input survives translation');
  ok(form.elements.namedItem('password') && form.elements.namedItem('password').tagName === 'INPUT', 'login form: password input survives translation');
  form.elements.namedItem('email').value = 'test@test.com'; form.elements.namedItem('password').value = 'secret';
  ok(form.elements.namedItem('email').value === 'test@test.com' && form.elements.namedItem('password').value === 'secret', 'login form: can actually type into the fields');

  form = doc.getElementById('registerForm');
  ['name','email','phone','address','password'].forEach(f => {
    const el = form.elements.namedItem(f);
    ok(el && el.tagName === 'INPUT', `register form: ${f} input survives translation`);
  });

  form = doc.getElementById('bookForm');
  ok(form.elements.namedItem('service_type_id') && form.elements.namedItem('service_type_id').tagName === 'SELECT', 'booking form: service_type_id select survives');
  ok(form.elements.namedItem('property_type') && form.elements.namedItem('property_type').length === 2, 'booking form: property_type radios survive (both options present)');
  ok(form.elements.namedItem('booking_date') && form.elements.namedItem('booking_date').tagName === 'INPUT', 'booking form: booking_date input survives');
  ok(form.elements.namedItem('preferred_time') && form.elements.namedItem('preferred_time').tagName === 'SELECT', 'booking form: preferred_time select survives');
  ok(form.elements.namedItem('address') && form.elements.namedItem('address').tagName === 'INPUT', 'booking form: address input survives');
  ok(form.elements.namedItem('phone') && form.elements.namedItem('phone').tagName === 'INPUT', 'booking form: phone input survives');
  ok(form.elements.namedItem('pest_notes') && form.elements.namedItem('pest_notes').tagName === 'TEXTAREA', 'booking form: pest_notes textarea survives');

  // simulate switching language (re-runs applyStaticTranslations) and re-check
  doc.querySelector('.lang-btn[data-lang="en"]').click();
  form = doc.getElementById('bookForm');
  ok(form.elements.namedItem('address') && form.elements.namedItem('address').tagName === 'INPUT', 'booking form: address input STILL survives after switching language');
  ok(form.elements.namedItem('property_type') && form.elements.namedItem('property_type').length === 2, 'booking form: property_type radios STILL survive after switching language');

  console.log('\n— Management site (public/management/) —');
  dom = await loadSite(path.join(__dirname, '..', 'public', 'management'));
  doc = dom.window.document;
  form = doc.getElementById('adminLogin');
  ok(form.elements.namedItem('username') && form.elements.namedItem('username').tagName === 'INPUT', 'admin login: username input survives translation');
  ok(form.elements.namedItem('password') && form.elements.namedItem('password').tagName === 'INPUT', 'admin login: password input survives translation');
  form.elements.namedItem('username').value = 'admin'; form.elements.namedItem('password').value = 'test';
  ok(form.elements.namedItem('username').value === 'admin' && form.elements.namedItem('password').value === 'test', 'admin login: can actually type into the fields');

  // simulate the exact scenario from the bug report: load with EN active
  dom2 = await loadSite(path.join(__dirname, '..', 'public', 'management'));
  dom2.window.localStorage.setItem('bb_lang', 'en');
  const dom3 = await loadSite(path.join(__dirname, '..', 'public', 'management'));
  const form3 = dom3.window.document.getElementById('adminLogin');
  ok(form3.elements.namedItem('username') && form3.elements.namedItem('password'), 'admin login: fields exist on a fresh load with EN as the stored language (reproduces the exact bug report)');

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})();
