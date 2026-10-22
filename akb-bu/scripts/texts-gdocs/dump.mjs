import { pageServices, pageDirections } from '../../src/lib/pages.js';
import fs from 'node:fs';
const strip = (g) => g.map((x) => ({ title: x.title, rows: x.rows.map((r) => ({ key: r.key, name: r.name, lead: r.lead, includes: r.includes, terms: r.terms })) }));
const out = {
  services: pageServices.map((p) => ({ slug: p.slug, cat: p.cat, sectionId: p.section.id, sectionTitle: p.section.title, groups: strip(p.groups) })),
  directions: pageDirections.map((d) => ({ slug: d.slug ?? d.page, cat: d.cat.id, catTitle: d.cat.title, sections: d.sections.map((s) => ({ id: s.id, title: s.title, groups: strip(s.groups) })) })),
};
fs.writeFileSync(new URL('rows.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.services.map(s=>s.slug+':'+s.groups.flatMap(g=>g.rows).length).join(' '));
console.log(out.directions.map(s=>s.slug+':'+s.sections.map(x=>x.id+'/'+x.groups.flatMap(g=>g.rows).length)).join(' '));
