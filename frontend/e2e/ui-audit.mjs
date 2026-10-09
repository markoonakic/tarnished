#!/usr/bin/env node
/** Local: TARNISHED_URL=http://127.0.0.1:5620 TARNISHED_AUDIT_CREDENTIALS=/private/credentials.json node frontend/e2e/ui-audit.mjs
 * Credentials JSON: {email,password,adminEmail?,adminPassword?}. Never log credentials.
 * Use a disposable account or a database copy. The script creates its own workspace fixtures.
 * PLAYWRIGHT_PATH may point to an existing Playwright installation; no new browser is required.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TARNISHED_URL || 'http://127.0.0.1:5620';
const output = process.env.TARNISHED_AUDIT_OUTPUT || './ui-audit';
const credentials = JSON.parse(
  await fs.readFile(process.env.TARNISHED_AUDIT_CREDENTIALS, 'utf8')
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH || '/etc/profiles/per-user/marko/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
await fs.mkdir(output, { recursive: true });
const report = {
  url: base,
  started: new Date().toISOString(),
  states: [],
  violations: [],
  screenshots: [],
  checked: 0,
  disabled: 0,
};
const messages = {};
for (const lang of ['en', 'sr-Latn']) {
  messages[lang] = JSON.parse(
    await fs.readFile(new URL(`../src/locales/${lang}.json`, import.meta.url))
  );
  for (const file of await fs.readdir(
    new URL('../src/locales/areas/', import.meta.url)
  ))
    if (file.endsWith(`.${lang}.json`))
      Object.assign(
        messages[lang],
        JSON.parse(
          await fs.readFile(
            new URL(`../src/locales/areas/${file}`, import.meta.url)
          )
        )
      );
}
const token = async (email, password) => {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Sign-in failed: HTTP ${response.status}`);
  return response.json();
};
const session = await token(credentials.email, credentials.password);
const admin = credentials.adminEmail
  ? await token(credentials.adminEmail, credentials.adminPassword)
  : session;
async function api(url, body, method = body ? 'POST' : 'GET', auth = session) {
  const response = await fetch(base + '/api' + url, {
    method,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(`${method} ${url}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const existing = process.env.TARNISHED_AUDIT_FIXTURES;
let fixture = existing ? JSON.parse(await fs.readFile(existing, 'utf8')) : null;
if (!fixture) {
  const statuses = await api('/statuses');
  const company = await api('/companies', {
    name: 'Northbridge',
    industry: 'Software',
    location: 'Belgrade',
    culture_notes: 'Small engineering team.',
  });
  const contact = await api('/contacts', {
    name: 'Mira',
    company_id: company.id,
    role: 'Recruiter',
  });
  const application = await api('/applications', {
    company: company.name,
    company_id: company.id,
    job_title: 'Software Engineer',
    status_id: statuses.find((s) => s.meaning === 'preparing').id,
    applied_at: null,
    requirements_must_have: ['Python'],
    requirements_nice_to_have: ['SQL'],
  });
  const lead = await api('/job-leads', {
    title: 'Backend Engineer',
    company: company.name,
    company_id: company.id,
    requirements_must_have: ['Python'],
    deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  const types = await api('/round-types');
  const interview = await api(`/applications/${application.id}/rounds`, {
    round_type_id: types[0].id,
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    time_zone: 'UTC',
    mode: 'video',
    duration_minutes: 60,
    contact_ids: [contact.id],
    preparation: { review_topics: ['SQL joins'] },
    notes_summary: 'Discuss the next steps.',
  });
  await api('/reminders', {
    application_id: application.id,
    kind: 'interview_preparation',
    title: 'Prepare SQL examples',
    due_at: new Date(Date.now() - 3600000).toISOString(),
    time_zone: 'UTC',
    intent_id: crypto.randomUUID(),
  });
  await api('/notes', {
    application_id: application.id,
    body: 'Ask about the team.',
  });
  fixture = {
    company: company.id,
    contact: contact.id,
    application: application.id,
    lead: lead.id,
    interview: interview.id,
  };
  await fs.writeFile(
    path.join(output, 'fixtures.json'),
    JSON.stringify(fixture, null, 2)
  );
}
// Exercise recording/transcript controls without starting speech or text processing.
const interview = await api(`/rounds/${fixture.interview}`);
async function attachment(kind, name, bytes, type, generation) {
  const body = new FormData();
  body.append('file', new Blob([bytes], { type }), name);
  const response = await fetch(
    `${base}/api/rounds/${fixture.interview}/${kind}`,
    {
      method: 'POST',
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        [`Expected-${kind === 'media' ? 'Media' : 'Transcript'}-Generation`]:
          String(generation ?? 0),
      },
    }
  );
  if (!response.ok) throw new Error(`Fixture ${kind}: HTTP ${response.status}`);
}
if (!interview.transcript_path && !interview.has_current_transcript)
  await attachment(
    'transcript',
    'conversation.txt',
    'Interviewer: Describe a project.\nCandidate: I built a SQL reporting tool.\n',
    'text/plain',
    interview.transcript_generation
  );
if (!interview.media?.length) {
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(16000, 40);
  await attachment(
    'media',
    'conversation.wav',
    wav,
    'audio/wav',
    interview.media_generation
  );
}
const contacts = await api('/contacts?per_page=5');
for (let i = contacts.total; i < 4; i++)
  await api('/contacts', {
    name: ['Luka', 'Nora', 'Ivan', 'Sara'][i],
    company_id: fixture.company,
  });
const knownHelp = [
  'Nothing changes',
  'Uses only',
  'These files',
  'Drag a card',
  'Distinct applications',
  'n =',
  'Applications with a recorded rejection',
  'From ',
  'No evidence results in',
  'Read the transcript or request feedback.',
  'Audio is processed by the local speech service',
  'Audio is sent to the configured speech service',
  'Parts and roles were assigned automatically.',
  'Download all your application data for backup or analysis.',
  'Import job application data from a previously exported ZIP file.',
  'Add interview rounds to your applications to see conversion funnel analytics',
  'Add completed interview rounds to see outcome analytics',
  'Completed interview rounds with dates will appear here',
];
const seenScreens = new Set();
let reportWrite = Promise.resolve();
async function audit(page, state, lang, width) {
  const label = `${lang}-${width}-${state}`;
  await page.addStyleTag({
    content:
      '*,*::before,*::after { transition-duration:0s!important; animation-duration:0s!important; scroll-behavior:auto!important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  const popup = page
    .locator('[data-ui="popover"]:popover-open:not([role="tooltip"])')
    .last();
  const elements = ((await popup.count()) ? popup : page).locator(
    'button, a[href]'
  );
  const count = await elements.count();
  let checked = 0;
  for (let index = 0; index < count; index++) {
    const control = elements.nth(index);
    if (!(await control.isVisible().catch(() => false))) continue;
    const before = await control.evaluate((el) => {
      const dialogs = [...document.querySelectorAll('dialog[open]')].sort(
        (a, b) =>
          Number(a.dataset.auditModalOrder) - Number(b.dataset.auditModalOrder)
      );
      const interactive =
        (!dialogs.length || dialogs.at(-1).contains(el)) &&
        !el.closest('[inert]');
      const cs = getComputedStyle(el);
      const disabled =
        el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
      return {
        interactive,
        tag: el.tagName,
        name:
          el.getAttribute('aria-label') || el.textContent.trim().slice(0, 160),
        ui: el.dataset.ui,
        variant: el.dataset.variant,
        disabled,
        bg: cs.backgroundColor,
        color: cs.color,
        font: cs.fontFamily,
        bodyFont: getComputedStyle(document.body).fontFamily,
        size: cs.fontSize,
        cursor: cs.cursor,
        rect: el.getBoundingClientRect().toJSON(),
      };
    });
    if (!before.interactive) continue;
    if (before.rect.width < 2 || before.rect.height < 2) continue;
    const issues = [];
    if (before.ui !== (before.tag === 'A' ? 'link' : 'button'))
      issues.push('not-shared-primitive');
    if (before.size !== '14px') issues.push('font-size');
    if (before.font !== before.bodyFont) issues.push('font-family');
    if (before.cursor !== 'pointer') issues.push('cursor');
    if (before.disabled) {
      report.disabled++;
    } else {
      await control.evaluate((el) => {
        el.blur();
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      await page.mouse.move(0, 0);
      // Pointer dispatch is awaited; getComputedStyle flushes styles with transitions disabled.
      const normal = await control.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          bg: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      await page.mouse.move(normal.x, normal.y);
      let hover = await control.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return {
          bg: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          reachable: hit === el || el.contains(hit),
          hit:
            hit?.tagName +
            ':' +
            (hit?.getAttribute('data-ui') || hit?.getAttribute('role') || ''),
        };
      });
      // A disappearing tooltip can move a target between frames. Retry with Playwright's stability check.
      if (!hover.reachable) {
        try {
          await control.hover({ timeout: 1500 });
          hover = await control.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              hit = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2
              );
            return {
              bg: getComputedStyle(el).backgroundColor,
              color: getComputedStyle(el).color,
              reachable: el.matches(':hover'),
              hit:
                hit?.tagName +
                ':' +
                (hit?.getAttribute('data-ui') ||
                  hit?.getAttribute('role') ||
                  ''),
            };
          });
        } catch {
          /* A stable obstruction is a violation. */
        }
      }
      if (!hover.reachable) issues.push('not-pointer-reachable');
      before.normal = normal;
      before.hover = hover;
      if (before.tag === 'BUTTON' && normal.bg === hover.bg)
        issues.push('button-hover-background');
      if (before.tag === 'A') {
        if (normal.color === hover.color) issues.push('link-hover-color');
        if (
          ![normal.bg, hover.bg].every(
            (bg) => bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
          )
        )
          issues.push('link-background');
      }
      const key = `${lang}-${width}-${before.tag === 'A' ? 'link' : before.variant}`;
      if (!seenScreens.has(key)) {
        seenScreens.add(key);
        const file = key + '-hover.png';
        await page.screenshot({ path: path.join(output, file) });
        report.screenshots.push(file);
      }
    }
    if (issues.length && report.violations.length < 15)
      await page.screenshot({
        path: path.join(
          output,
          `violation-${lang}-${width}-${report.violations.length}.png`
        ),
      });
    if (issues.length)
      report.violations.push({
        state: label,
        control: before.name,
        issues,
        normal: before.normal,
        hover: before.hover,
      });
    checked++;
  }
  const help = [
    ...knownHelp,
    ...Object.entries(messages.en)
      .filter(
        ([, v]) =>
          typeof v === 'string' && knownHelp.some((p) => v.startsWith(p))
      )
      .map(([k]) => messages[lang][k]?.split('{{')[0])
      .filter(Boolean),
  ];
  const structural = await page.evaluate((phrases) => {
    const results = [];
    const visible = (el) =>
      !!el.getClientRects().length &&
      getComputedStyle(el).visibility !== 'hidden' &&
      !el.closest('[aria-hidden="true"]');
    for (const el of document.querySelectorAll('p,div,span')) {
      if (
        !visible(el) ||
        el.closest('[role="tooltip"]') ||
        (el.tagName !== 'P' && el.childElementCount > 0)
      )
        continue;
      const text = el.textContent.trim();
      if (
        phrases.some(
          (p) =>
            text.startsWith(p) &&
            (p !== 'From ' || /^From \d+ reviewed posting/.test(text))
        )
      )
        results.push({
          control: el.textContent.trim().slice(0, 160),
          issues: ['visible-help-sentence'],
        });
    }
    for (const panel of document.querySelectorAll(
      '[role="listbox"],[role="menu"],[data-ui="popover"]'
    )) {
      if (!visible(panel)) continue;
      const style = getComputedStyle(panel),
        parent = getComputedStyle(panel.parentElement);
      const issues = [];
      if (
        style.backgroundColor === 'rgba(0, 0, 0, 0)' ||
        style.backgroundColor === 'transparent'
      )
        issues.push('transparent-panel');
      if (parseInt(style.zIndex) < (parseInt(parent.zIndex) || 0))
        issues.push('panel-layer');
      if (style.boxShadow === 'none' || parseFloat(style.borderWidth) === 0)
        issues.push('panel-border-shadow');
      if (issues.length)
        results.push({
          control: panel.getAttribute('role') || 'popover',
          issues,
        });
    }
    const cards = [...document.querySelectorAll('main .bg-secondary')]
      .filter(
        (el) =>
          visible(el) &&
          !el.closest('dialog,[data-ui="popover"]') &&
          !el.parentElement.closest('main .bg-secondary')
      )
      .map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i].r,
          b = cards[j].r;
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left),
          yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const vertical =
          xOverlap > Math.min(a.width, b.width) * 0.5 && yOverlap <= 0
            ? -yOverlap
            : Infinity;
        const horizontal =
          yOverlap > Math.min(a.height, b.height) * 0.5 && xOverlap <= 0
            ? -xOverlap
            : Infinity;
        if (
          (xOverlap > 0 && yOverlap > 0) ||
          Math.min(vertical, horizontal) < 15.9
        )
          results.push({
            control:
              cards[i].el.textContent.trim().slice(0, 60) +
              ' / ' +
              cards[j].el.textContent.trim().slice(0, 60),
            issues: ['card-gap'],
            gap:
              xOverlap > 0 && yOverlap > 0
                ? -Math.min(xOverlap, yOverlap)
                : Math.min(vertical, horizontal),
          });
      }
    return results;
  }, help);
  report.violations.push(...structural.map((v) => ({ state: label, ...v })));
  console.log(
    `AUDIT ${label}: ${checked} controls; ${report.violations.length} total violations`
  );
  report.states.push({ state: label, checked });
  report.checked += checked;
  reportWrite = reportWrite.then(() =>
    fs.writeFile(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2)
    )
  );
  await reportWrite;
}
async function panels(page, state, lang, width) {
  const triggers = page.locator(
    'button[role="combobox"],input[role="combobox"]'
  );
  for (let i = 0; i < (await triggers.count()); i++) {
    const trigger = triggers.nth(i);
    if (!(await trigger.isVisible()) || (await trigger.isDisabled())) continue;
    if (
      !(await trigger.evaluate((el) => {
        const ds = [...document.querySelectorAll('dialog[open]')].sort(
          (a, b) =>
            Number(a.dataset.auditModalOrder) -
            Number(b.dataset.auditModalOrder)
        );
        return !ds.length || ds.at(-1).contains(el);
      }))
    )
      continue;
    const dialogsBefore = await page.locator('dialog[open]').count();
    await trigger.click();
    if ((await page.locator('dialog[open]').count()) > dialogsBefore)
      report.violations.push({
        state,
        control: await trigger.getAttribute('aria-label'),
        issues: ['chevron-opens-modal'],
      });
    await audit(page, `${state}-options-${i}`, lang, width);
    await trigger.press('Escape');
    await trigger.evaluate((el) => el.blur());
  }
}
async function disclosures(page, state, lang, width) {
  const summaries = page.locator('summary:visible');
  const seen = new Set();
  for (let i = 0; i < (await summaries.count()); i++) {
    const summary = summaries.nth(i);
    const key = await summary.evaluate((el) =>
      el.querySelector('[class*=three-dots]')
        ? 'record-menu'
        : el.textContent.trim()
    );
    if (seen.has(key)) continue;
    seen.add(key);
    if (await summary.evaluate((el) => el.parentElement.open)) continue;
    await summary.click();
    await audit(page, state + ':' + key, lang, width);
    await panels(page, state + ':' + key, lang, width);
    await summary.evaluate((el) => {
      el.parentElement.open = false;
    });
  }
}
const paths = [
  '/',
  '/job-leads',
  `/job-leads/${fixture.lead}`,
  '/applications',
  '/applications?view=board',
  `/applications/${fixture.application}`,
  `/interviews/${fixture.interview}`,
  '/companies',
  '/contacts',
  `/companies/${fixture.company}`,
  `/contacts/${fixture.contact}`,
  '/tasks',
  '/tasks?state=done',
  '/tasks?view=interviews',
  '/tasks?view=interviews&calendar=week',
  '/analytics',
  '/profile',
  ...[
    'theme',
    'features',
    'language',
    'security',
    'api-key',
    'statuses',
    'round-types',
    'export',
    'import',
  ].map((tab) => '/settings/' + tab),
];
const actionKeys = [
  'New Application',
  'New Job Lead',
  'Add Round',
  'Edit',
  'records.changeStatus',
  'kit.addNote',
  'kit.addReminder',
  'companies.newCompany',
  'companies.newContact',
  'tasks.newReminder',
  'tasks.addParticipant',
  'ai.useRequirements',
  'accounts.editProfile',
  'accounts.add_work_history',
  'accounts.add_projects',
  'accounts.add_education',
  'accounts.add_certificates',
  'accounts.add_languages',
  'kit.newReminder',
  'kit.newCompany',
  'kit.newContact',
  'Create User',
  'Add Status',
  'Add Round Type',
  'Import Data',
  'Add transcript',
  'Read transcript',
  'View transcript',
  'Edit transcript',
  'Edit round',
  'companies.linkContact',
  'records.replaceText',
  'tasks.remindMe',
];
try {
  for (const lang of (process.env.AUDIT_LANGUAGES || 'en,sr-Latn').split(',')) {
    const results = await Promise.allSettled(
      (process.env.AUDIT_WIDTHS || '1440,390')
        .split(',')
        .map(Number)
        .map(async (width) => {
          const context = await browser.newContext({
            viewport: { width, height: 1000 },
            locale: lang === 'en' ? 'en-US' : 'sr-Latn-RS',
          });
          const page = await context.newPage();
          page.on('pageerror', (error) =>
            report.violations.push({
              state: `${lang}-${width}-${new URL(page.url()).pathname}`,
              issues: ['page-error'],
              control: error.message.slice(0, 160),
            })
          );
          await context.addInitScript(
            ({ lang }) => {
              localStorage.setItem('tarnished-language', lang);
              const show = HTMLDialogElement.prototype.showModal;
              HTMLDialogElement.prototype.showModal = function () {
                this.dataset.auditModalOrder = String(performance.now());
                return show.call(this);
              };
            },
            { lang }
          );
          for (const route of ['/login', '/register']) {
            await page.goto(base + route);
            await page.waitForLoadState('networkidle');
            await audit(page, route, lang, width);
          }
          await api('/user-preferences', { language: lang }, 'PATCH');
          await page.goto(base + '/login');
          await page.locator('#email').fill(credentials.email);
          await page
            .locator('input[type="password"]')
            .fill(credentials.password);
          await page
            .getByRole('button', {
              name: messages[lang]['Sign In'],
              exact: true,
            })
            .click();
          await page.waitForURL(base + '/');
          for (const route of process.env.AUDIT_PATHS
            ? JSON.parse(process.env.AUDIT_PATHS)
            : paths) {
            await page.goto(base + route);
            await page.waitForLoadState('networkidle');
            if (page.url().includes('/login'))
              throw new Error('Browser session was not accepted');
            await audit(page, route, lang, width);
            await panels(page, route, lang, width);
            await disclosures(page, route, lang, width);
            if (route === '/')
              for (const selector of [
                '[aria-controls="account-links"]',
                '[aria-controls="mobile-navigation"]',
              ]) {
                const menu = page.locator(selector);
                if (await menu.isVisible()) {
                  await menu.click();
                  await audit(page, route + ':navigation', lang, width);
                  await menu.click();
                }
              }
            const buttons = await page
              .locator('button:visible')
              .evaluateAll((nodes) =>
                nodes.map((n, index) => ({
                  index,
                  text: (n.getAttribute('aria-label') || n.textContent).trim(),
                }))
              );
            const names = actionKeys.map((k) => messages[lang][k] || k);
            const occurrences = new Map();
            for (const { text } of buttons.filter((b) =>
              names.includes(b.text)
            )) {
              const occurrence = occurrences.get(text) || 0;
              occurrences.set(text, occurrence + 1);
              await page.goto(base + route);
              await page.waitForLoadState('networkidle');
              const button = page
                .getByRole('button', { name: text, exact: true })
                .nth(occurrence);
              if (!(await button.isVisible()) || (await button.isDisabled()))
                continue;
              const chevron = await button
                .locator('[class*="chevron-down"]')
                .count();
              const before = await page.locator('dialog[open]').count();
              await button.click();
              await page.waitForLoadState('networkidle');
              if (
                chevron &&
                (await page.locator('dialog[open]').count()) > before
              )
                report.violations.push({
                  state: route,
                  control: text,
                  issues: ['chevron-opens-modal'],
                });
              await audit(page, `${route}:${text}`, lang, width);
              await panels(page, `${route}:${text}`, lang, width);
              if (
                [
                  messages[lang]['Read transcript'],
                  messages[lang]['View transcript'],
                ].includes(text)
              ) {
                const editTranscript = page.getByRole('button', {
                  name: messages[lang]['Edit transcript'],
                  exact: true,
                });
                if (await editTranscript.isVisible().catch(() => false)) {
                  await editTranscript.click();
                  await audit(page, `${route}:${text}:edit`, lang, width);
                  await panels(page, `${route}:${text}:edit`, lang, width);
                }
              }
              const participantAdd = page
                .getByRole('button', {
                  name: messages[lang]['tasks.addParticipant'],
                  exact: true,
                })
                .last();
              if (
                (route.startsWith('/applications/') ||
                  route.startsWith('/interviews/')) &&
                (await participantAdd.isVisible().catch(() => false)) &&
                (await participantAdd.evaluate((el) => {
                  const dialogs = [
                    ...document.querySelectorAll('dialog[open]'),
                  ].sort(
                    (a, b) =>
                      Number(a.dataset.auditModalOrder) -
                      Number(b.dataset.auditModalOrder)
                  );
                  return !dialogs.length || dialogs.at(-1).contains(el);
                }))
              ) {
                await participantAdd.click();
                await audit(page, `${route}:${text}:participants`, lang, width);
                await panels(
                  page,
                  `${route}:${text}:participants`,
                  lang,
                  width
                );
              }
              const modes = page.locator('dialog[open] input[type=radio]');
              for (let i = 0; i < (await modes.count()); i++) {
                const radio = modes.nth(i);
                if ((await radio.isChecked()) || (await radio.isDisabled()))
                  continue;
                await radio.locator('..').click();
                await audit(page, `${route}:${text}:mode-${i}`, lang, width);
                await panels(page, `${route}:${text}:mode-${i}`, lang, width);
              }
            }
          }
          await page.evaluate((s) => {
            localStorage.setItem('access_token', s.access_token);
            localStorage.setItem('refresh_token', s.refresh_token);
          }, admin);
          await api('/user-preferences', { language: lang }, 'PATCH', admin);
          await page.goto(base + '/admin');
          await page.waitForLoadState('networkidle');
          await audit(page, '/admin', lang, width);
          await panels(page, '/admin', lang, width);
          if (!page.url().endsWith('/admin'))
            throw new Error('Admin coverage requires an admin audit account');
          for (const key of ['Create User', 'Edit', 'Configure AI']) {
            await page.goto(base + '/admin');
            await page.waitForLoadState('networkidle');
            const action = page
              .getByRole('button', {
                name: messages[lang][key] || key,
                exact: true,
              })
              .and(page.locator('button:enabled'))
              .first();
            if (await action.isVisible()) {
              await action.click();
              await page.waitForLoadState('networkidle');
              await audit(page, '/admin:' + key, lang, width);
              await panels(page, '/admin:' + key, lang, width);
            }
          }
          await context.close();
        })
    );
    for (const result of results)
      if (result.status === 'rejected')
        report.violations.push({
          state: lang,
          issues: ['audit-incomplete'],
          control: result.reason.message,
        });
  }
} catch (error) {
  report.violations.push({
    state: 'audit',
    control: error.message,
    issues: ['audit-incomplete'],
  });
} finally {
  report.finished = new Date().toISOString();
  report.violationCount = report.violations.length;
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2)
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    states: report.states.length,
    controls: report.checked,
    violations: report.violationCount,
    report: path.join(output, 'report.json'),
  })
);
process.exitCode = report.violationCount ? 1 : 0;
