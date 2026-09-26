// Static evidence only: an extracted handler is never a runtime PASS.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = [...walk('src'), ...walk('server/src')].filter(p => /\.tsx?$/.test(p) && !/\.test\./.test(p)).map(p => p.replaceAll('\\', '/'));
const sources = files.map(file => ({ file, text: fs.readFileSync(file, 'utf8') })).map(s => ({ ...s, ast: ts.createSourceFile(s.file, s.text, ts.ScriptTarget.Latest, true) }));
const actions = [], functions = [], routes = [], calls = [];
const compact = text => text.replace(/\s+/g, ' ').trim();
const visit = (node, fn) => { fn(node); ts.forEachChild(node, child => visit(child, fn)); };
const loc = (s, n) => `${s.file}:${s.ast.getLineAndCharacterOfPosition(n.getStart(s.ast)).line + 1}`;
function apiCalls(node, source) {
  const result = [];
  visit(node, n => {
    if (ts.isCallExpression(n) && /^(apiClient|fetchAllPages)$/.test(n.expression.getText(source.ast)) && n.arguments.length) {
      const endpoint = n.arguments[0].getText(source.ast);
      const options = n.arguments[1]?.getText(source.ast) || '';
      const method = /method:\s*['"]([^'"]+)/.exec(options)?.[1] || 'GET';
      result.push(`${method} ${endpoint}`);
    }
  });
  return [...new Set(result)];
}
for (const s of sources) visit(s.ast, node => {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer) || (ts.isCallExpression(node.initializer) && /useCallback/.test(node.initializer.expression.getText(s.ast)))))) {
    const name = node.name?.getText(s.ast);
    if (name) {
      const body = node.getText(s.ast);
      const apis = apiCalls(node, s);
      const db = [...new Set([...body.matchAll(/(?:tx|prisma|transaction)\.(\w+)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`))];
      if (apis.length || db.length || /^(handle|fetch|create|update|delete|pay|refund|approve|reject|execute|reinvest|withdraw|close|openScanner)/.test(name)) {
        functions.push({ name, location: loc(s, node), file: s.file, apis, db, body, error: /catch\s*\(/.test(body) ? 'catch: inspect referenced implementation' : 'throws/propagates or synchronous; see source' });
      }
    }
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(get|post|put|patch|delete)$/.test(node.expression.name.text) && node.expression.expression.getText(s.ast) === 'app') {
    const endpoint = node.arguments[0];
    if (!endpoint || !ts.isStringLiteral(endpoint) || !endpoint.text.startsWith('/api')) return;
    const body = node.getText(s.ast);
    routes.push({ method: node.expression.name.text.toUpperCase(), path: endpoint.text, location: loc(s, node), auth: /authenticateJwt/.test(body) ? 'JWT + active session' : 'Public', roles: /requireRoles\(([^)]+)\)/.exec(body)?.[1] || 'See scope guards / authenticated roles', service: [...new Set([...body.matchAll(/(\w+Service\.\w+)\(/g)].map(m => m[1]))].join(', ') || 'Inline route / imported function', validation: [...new Set([...body.matchAll(/\b(require\w+|enforce\w+)\(/g)].map(m => m[1]))].join(', ') || 'Route + service (source reference)', db: [...new Set([...body.matchAll(/(?:tx|prisma|transaction)\.(\w+)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`))].join(', ') || 'Delegated service', body });
  }
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = node.tagName.getText(s.ast);
    const attrs = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(s.ast), a.initializer?.getText(s.ast) || 'true']));
    const handlers = Object.entries(attrs).filter(([k]) => /^on(Click|Change|Submit|KeyDown|KeyUp|Input|Select|Confirm|Cancel|Close|Scan|Download|Refresh|OpenChange|ValueChange|MonthChange)$/.test(k));
    if (!/^(button|input|select|textarea|form|a|option|Button|IconButton|Link|NavLink|Checkbox|Switch|RadioGroup|MonthPicker|SearchBar|FilterPill|Combobox)$/.test(tag) && !handlers.length) return;
    const parent = ts.isJsxOpeningElement(node) ? node.parent : node;
    const texts = [];
    visit(parent, n => { if (ts.isJsxText(n) && compact(n.text)) texts.push(compact(n.text)); });
    const icons = [];
    visit(parent, n => { if (ts.isJsxSelfClosingElement(n) && /^[A-Z]/.test(n.tagName.getText(s.ast))) icons.push(n.tagName.getText(s.ast)); });
    const label = attrs['aria-label'] || attrs.title || attrs.label || attrs.placeholder || texts.join(' / ').slice(0, 180) || icons.join(', ') || `${tag} (dynamic/structural)`;
    actions.push({ id: `ACT-${String(actions.length + 1).padStart(4, '0')}`, page: path.basename(s.file, '.tsx'), location: loc(s, node), file: s.file, tag, label, handlers: handlers.map(([k, v]) => `${k}=${compact(v)}`).join('; ') || (attrs.href || attrs.to || (tag === 'option' ? 'Parent select.onChange' : attrs.type === '"submit"' ? 'Parent form.onSubmit' : 'Inspect parent/component propagation')), disabled: attrs.disabled || attrs['aria-disabled'] || (/pointer-events-none/.test(attrs.className || '') ? 'pointer-events-none' : ''), body: handlers.map(([,v]) => v).join(' '), status: 'UNVERIFIED' });
  }
  if (ts.isCallExpression(node) && /^(apiClient|fetchAllPages)$/.test(node.expression.getText(s.ast))) {
    for (const api of apiCalls(node, s)) calls.push({ api, location: loc(s, node) });
  }
});
for (const action of actions) {
  const direct = functions.filter(f => f.file === action.file && new RegExp(`\\b${f.name.replace(/[$]/g,'\\$&')}\\b`).test(action.body));
  const reachable = new Set(direct);
  for (let depth = 0; depth < 3; depth++) {
    const bodies = [...reachable].map(f => f.body).join('\n');
    for (const f of functions.filter(f => f.file === 'src/context/AppContext.tsx' || f.file.startsWith('src/api/'))) {
      if (new RegExp(`\\b${f.name.replace(/[$]/g,'\\$&')}\\b`).test(bodies + action.body)) reachable.add(f);
    }
  }
  action.apis = [...new Set([...reachable].flatMap(f => f.apis))];
  action.chain = direct.map(f => f.location);
  if ((action.page === 'LoginPage' && action.handlers.includes('onSubmit={handleSubmit}')) ||
      (action.page === 'ExpensesPage' && action.handlers.includes('onSubmit={handleAddExpense}')) ||
      (action.page === 'PurchasePage' && action.handlers.includes('onClick={handleConfirmSavePurchase}')) ||
      (action.page === 'SalePage' && action.handlers.includes('onClick={handleFinishPayment}')) ||
      (action.page === 'NotificationsPage' && /markAllNotificationsAsRead|handleNotificationClick/.test(action.handlers)) ||
      (action.page === 'ProfitReport' && action.tag === 'button' && action.label.includes('Повторить загрузку'))) action.status = 'PASS';
  if ((action.page === 'EmployeesPage' && action.handlers.includes('handleExecuteSalaryPayout')) ||
      (action.page === 'ExpensesPage' && action.handlers.includes('onSubmit={handleSaveEdit}'))) action.status = 'RISK';
  delete action.body;
}
const cell = value => String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const link = location => { const [file, line] = location.split(':'); return `[${file}:${line}](../${file}#L${line})`; };
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n')}\n`;
const counts = {};
for (const a of actions) counts[a.page] = (counts[a.page] || 0) + 1;
const parts = [];
parts.push('## Appendix A — Complete static interactive-template inventory\n');
parts.push('Each row is one JSX control or action-bearing component instance, including conditional controls, options and shared components. Repeated rows generated from data are one template. Shared definitions and usages are both included, so this is NOT a deduplicated runtime button count. UNVERIFIED means the full lifecycle of this individual template was not executed, even when its service has passing tests. Form submission and event bubbling are not classified as dead handlers. API lists are static dependency candidates, including post-mutation refreshes, not proof that every endpoint is invoked.\n');
parts.push(table(['ID','Page/component','Control/label','Expected action','Handler / actual implementation','API candidates','Roles','Disabled condition','Source','Status'], actions.map(a=>[a.id,a.page,`${a.tag}: ${a.label}`,a.tag==='option'?'Change parent selection':a.tag==='form'?'Validate and submit form':a.handlers.includes('onChange')?'Update field/filter/selection':`Execute ${a.label}`,a.handlers,a.apis.join('; ')||'Local state/navigation/component or unresolved callback','Page RBAC matrix + source conditions; shared components inherit caller',a.disabled,link(a.location),a.status])));
parts.push('\n## Appendix B — Backend API route inventory\n');
parts.push('All route declarations were extracted directly from app.ts and registered route modules. Every authenticated route was probed without credentials in the audit (401); this does not verify its business operation. Route-local DB calls below omit delegated service internals; those appear in Appendix C. No runtime PASS is implied by source extraction.\n');
parts.push(table(['Method','Path','Auth','Roles','Validation/scope','Service','Direct DB effects','Source','Coverage'], routes.map(r=>[r.method,r.path,r.auth,r.roles,r.validation,r.service,r.db,link(r.location),'Auth gate checked where JWT; business coverage in sections 8–27; otherwise UNVERIFIED'])));
parts.push('\n## Appendix C — Frontend/backend function inventory\n');
parts.push('Functions selected by API/DB dependency or business-handler naming. Error-handling column is syntactic evidence. Component render functions may enclose child handlers. This inventory is not a reachability proof and does not label functions UNUSED solely from text matching.\n');
parts.push(table(['Function','Source','API','DB effects','Error handling','Status'], functions.map(f=>[f.name,link(f.location),f.apis.join('; ')||'—',f.db.join('; ')||'—',f.error,'UNVERIFIED individually; see executed flows'])));
parts.push('\n## Appendix D — Frontend API call sites\n');
parts.push(table(['Call','Source'],calls.map(c=>[c.api,link(c.location)])));
fs.mkdirSync('docs', {recursive:true});
fs.writeFileSync('docs/functional-audit-inventory.tmp.md',parts.join('\n'));
const passCounts = {};
for (const a of actions.filter(a=>a.status==='PASS')) passCounts[a.page]=(passCounts[a.page]||0)+1;
const riskCounts = {};
for (const a of actions.filter(a=>a.status==='RISK')) riskCounts[a.page]=(riskCounts[a.page]||0)+1;
fs.writeFileSync('docs/functional-audit-counts.tmp.json',JSON.stringify({pages:17,actions:actions.length,functions:functions.length,routes:routes.length,calls:calls.length,counts,passCounts,riskCounts},null,2));
console.log(JSON.stringify({actions:actions.length,functions:functions.length,routes:routes.length,calls:calls.length,counts}));
