#!/usr/bin/env node
// Parse vocabulary definition in CSV to generate Context+Vocabulary in
// JSON-LD, Turtle, or ReSpec HTML.
//
// This is a JavaScript port of Gregg Kellogg's mk_vocab.rb from
// https://github.com/shexSpec/shexspec.github.io/tree/master/ns
// (including its erubis template.html, folded into renderHtml below).
//
// Usage:
//   node mk_vocab.js                 # regenerate every derived file in place
//   node mk_vocab.js -f jsonld       # one format to stdout
//                                    #   (jsonld|ttl|html|context|shexc)
//   node mk_vocab.js -f ttl -o out.ttl
//   node mk_vocab.js --nsdir ../../../w3c/ns    # where the shex.{ttl,jsonld,html} live
//   node mk_vocab.js --date 2017-07-07 --commit https://github.com/.../commit/<sha>
//
// --date/--commit override the values otherwise taken from `git log -1 vocab.csv`.

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TITLE = 'Shape Expression Vocabulary';
const DESCRIPTION = 'This document describes the RDFS vocabulary description used in the Shape Expression Language (ShEx) [[shex-semantics]] along with the default JSON-LD Context and shape expression to validate RDF versions of shapes.';
const COMMIT_BASE = 'https://github.com/shexSpec/shexTest/commit/';

// ---------------------------------------------------------------- CSV input

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false, sawField = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true; sawField = true;
    } else if (c === ',') {
      row.push(sawField || field !== '' ? field : null); field = ''; sawField = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(sawField || field !== '' ? field : null);
      rows.push(row);
      row = []; field = ''; sawField = false;
    } else field += c;
  }
  if (field !== '' || sawField || row.length) {
    row.push(sawField || field !== '' ? field : null);
    rows.push(row);
  }
  return rows.map(r => r.map(v => v === '' ? null : v));
}

// Mimics Ruby Array#to_s (inspect), used by mk_vocab.rb to sort rows.
function rubyInspect(row) {
  return '[' + row.map(v =>
    v == null ? 'nil' : '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  ).join(', ') + ']';
}

class Vocab {
  constructor(csvPath, opts = {}) {
    const raw = parseCSV(fs.readFileSync(csvPath, 'utf8'));
    const columns = raw.shift().map(c => c);
    this.prefixes = {}; this.terms = {}; this.properties = {};
    this.classes = {}; this.datatypes = {}; this.instances = {};
    this.imports = []; this.seeAlso = [];

    let sha = null, date = null;
    try {
      const out = execSync(
        `git log -1 --format=%H%n%ad --date=format:%Y-%m-%d -- ${JSON.stringify(path.basename(csvPath))}`,
        { cwd: path.dirname(csvPath), encoding: 'utf8' }).trim();
      if (out) [sha, date] = out.split('\n');
    } catch (e) { /* not a git checkout; fall through */ }
    this.commit = opts.commit || COMMIT_BASE + (sha || 'uncommitted');
    this.date = opts.date || date || new Date().toISOString().slice(0, 10);

    raw.sort((a, b) => rubyInspect(a) < rubyInspect(b) ? -1 : 1)
      .forEach(line => {
        const entry = {};
        columns.forEach((c, i) => {
          const v = line[i];
          entry[c] = v == null ? null : v.replace(/\r/g, '\n').replace(/\\/g, '\\\\');
        });
        switch (entry.type) {
          case 'prefix':        this.prefixes[entry.id] = entry; break;
          case 'term':          this.terms[entry.id] = entry; break;
          case 'rdf:Property':  this.properties[entry.id] = entry; break;
          case 'rdfs:Class':    this.classes[entry.id] = entry; break;
          case 'rdfs:Datatype': this.datatypes[entry.id] = entry; break;
          case 'owl:imports':   this.imports.push(entry.subClassOf); break;
          case 'rdfs:seeAlso':  this.seeAlso.push(entry.subClassOf); break;
          default:              this.instances[entry.id] = entry;
        }
      });
  }

  namespaced(term) {
    return term.includes(':') ? term : `shex:${term}`;
  }

  // ------------------------------------------------------------- JSON-LD

  buildJsonld() {
    const context = {};
    const rdfsContext = {
      "id": "@id",
      "type": "@type",
      "dc:title": {"@container": "@language"},
      "dc:description": {"@container": "@language"},
      "dc:date": {"@type": "xsd:date"},
      "rdfs:comment": {"@container": "@language"},
      "rdfs:domain": {"@type": "@id"},
      "rdfs:label": {"@container": "@language"},
      "rdfs:range": {"@type": "@id"},
      "rdfs:seeAlso": {"@type": "@id"},
      "rdfs:subClassOf": {"@type": "@id"},
      "rdfs:subPropertyOf": {"@type": "@id"},
      "owl:equivalentClass": {"@type": "@vocab"},
      "owl:equivalentProperty": {"@type": "@vocab"},
      "owl:oneOf": {"@container": "@list", "@type": "@vocab"},
      "owl:imports": {"@type": "@id"},
      "owl:versionInfo": {"@type": "@id"},
      "owl:inverseOf": {"@type": "@vocab"},
      "owl:unionOf": {"@type": "@vocab", "@container": "@list"},
      "rdfs_classes": {"@reverse": "rdfs:isDefinedBy", "@type": "@id"},
      "rdfs_properties": {"@reverse": "rdfs:isDefinedBy", "@type": "@id"},
      "rdfs_datatypes": {"@reverse": "rdfs:isDefinedBy", "@type": "@id"},
      "rdfs_instances": {"@reverse": "rdfs:isDefinedBy", "@type": "@id"}
    };
    const rdfsClasses = [], rdfsProperties = [], rdfsDatatypes = [], rdfsInstances = [];

    for (const [id, entry] of Object.entries(this.prefixes))
      context[id] = entry.subClassOf;

    for (const [id, entry] of Object.entries(this.terms)) {
      if (entry['@type'] === '@null') continue;
      if (entry['@container'] || entry['@type']) {
        const defn = {'@id': entry.subClassOf};
        if (entry['@container']) defn['@container'] = entry['@container'];
        if (entry['@type']) defn['@type'] = entry['@type'];
        context[id] = defn;
      } else {
        context[id] = entry.subClassOf;
      }
    }

    for (const [id, entry] of Object.entries(this.classes)) {
      const term = entry.term || id;
      if (entry['@type'] !== '@null') context[term] = this.namespaced(id);

      const node = {
        '@id': this.namespaced(id),
        '@type': 'rdfs:Class',
        'rdfs:label': {en: entry.label || ''},
        'rdfs:comment': {en: entry.comment || ''},
      };
      if (entry.subClassOf) node['rdfs:subClassOf'] = this.namespaced(entry.subClassOf);
      rdfsClasses.push(node);
    }

    for (const [id, entry] of Object.entries(this.properties)) {
      const defn = {'@id': this.namespaced(id)};
      if (entry.range === 'xsd:string')                     defn['@language'] = null;
      else if (entry.range && /xsd:/.test(entry.range))     defn['@type'] = entry.range.split(',')[0];
      else if (entry.range == null || entry.range === 'rdfs:Literal') { /* nothing */ }
      else                                                  defn['@type'] = '@id';

      if (entry['@container']) defn['@container'] = entry['@container'];
      if (entry['@type']) defn['@type'] = entry['@type'];

      const term = entry.term || id;
      if (entry['@type'] !== '@null') context[term] = defn;

      const node = {
        '@id': this.namespaced(id),
        '@type': 'rdf:Property',
        'rdfs:label': {en: entry.label || ''},
        'rdfs:comment': {en: entry.comment || ''},
      };
      if (entry.subClassOf) node['rdfs:subPropertyOf'] = this.namespaced(entry.subClassOf);

      const domains = (entry.domain || '').split(',').filter(s => s !== '');
      if (domains.length === 1) node['rdfs:domain'] = this.namespaced(domains[0]);
      else if (domains.length > 1) node['rdfs:domain'] = {'owl:unionOf': domains.map(d => this.namespaced(d))};

      const ranges = (entry.range || '').split(',').filter(s => s !== '');
      if (ranges.length === 1) node['rdfs:range'] = this.namespaced(ranges[0]);
      else if (ranges.length > 1) node['rdfs:range'] = {'owl:unionOf': ranges.map(r => this.namespaced(r))};

      rdfsProperties.push(node);
    }

    for (const [id, entry] of Object.entries(this.datatypes)) {
      if (entry['@type'] !== '@null') context[id] = this.namespaced(id);
      const node = {
        '@id': this.namespaced(id),
        '@type': 'rdfs:Datatype',
        'rdfs:label': {en: entry.label || ''},
        'rdfs:comment': {en: entry.comment || ''},
      };
      if (entry.subClassOf) node['rdfs:subClassOf'] = this.namespaced(entry.subClassOf);
      rdfsDatatypes.push(node);
    }

    for (const [id, entry] of Object.entries(this.instances)) {
      if (entry['@type'] !== '@null') context[id] = this.namespaced(id);
      rdfsInstances.push({
        '@id': this.namespaced(id),
        '@type': entry.type,
        'rdfs:label': {en: entry.label || ''},
        'rdfs:comment': {en: entry.comment || ''},
      });
    }

    // Use separate rdfs context so as not to polute the ShEx context.
    const ontology = {
      '@context': rdfsContext,
      '@id': this.prefixes['shex'].subClassOf,
      '@type': 'owl:Ontology',
      'dc': 'http://purl.org/dc/terms/',
      'owl': 'http://www.w3.org/2002/07/owl#',
      'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'dc:title': {en: TITLE},
      'dc:description': {en: DESCRIPTION},
      'dc:date': this.date,
      'owl:imports': this.imports,
      'owl:versionInfo': this.commit,
      'rdfs:seeAlso': this.seeAlso,
      'rdfs_classes': rdfsClasses,
      'rdfs_properties': rdfsProperties,
      'rdfs_datatypes': rdfsDatatypes,
      'rdfs_instances': rdfsInstances,
    };
    for (const [k, v] of Object.entries(ontology))
      if (Array.isArray(v) && v.length === 0) delete ontology[k];

    return {'@context': context, '@graph': ontology};
  }

  toJsonld() {
    return JSON.stringify(this.buildJsonld(), null, 2);
  }

  // The JSON-LD context on its own, as ../doc/ShExJ-context.jsonld — the
  // context ShExJ documents reference, without the ontology in @graph.
  toContext() {
    return JSON.stringify({'@context': this.buildJsonld()['@context']}, null, 2);
  }

  // -------------------------------------------------------------- Turtle

  toTtl() {
    const output = [];

    const prefixes = Object.assign({
      dc:   {subClassOf: 'http://purl.org/dc/terms/'},
      owl:  {subClassOf: 'http://www.w3.org/2002/07/owl#'},
      rdf:  {subClassOf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'},
      rdfs: {subClassOf: 'http://www.w3.org/2000/01/rdf-schema#'},
    }, this.prefixes);
    for (const [id, entry] of Object.entries(prefixes))
      output.push(`@prefix ${id}: <${entry.subClassOf}> .`);

    output.push('\n# CSVM Ontology definition');
    output.push('shex: a owl:Ontology;');
    output.push(`  dc:title "${TITLE}"@en;`);
    output.push(`  dc:description """${DESCRIPTION}"""@en;`);
    output.push(`  dc:date "${this.date}"^^xsd:date;`);
    if (this.imports.length)
      output.push(`  owl:imports ${this.imports.map(i => '<' + i + '>').join(', ')};`);
    output.push(`  owl:versionInfo <${this.commit}>;`);
    output.push(`  rdfs:seeAlso ${this.seeAlso.map(i => '<' + i + '>').join(', ')};`);
    output.push('  .\n');

    output.push('\n# Class definitions');
    for (const [id, entry] of Object.entries(this.classes)) {
      output.push(`shex:${id} a rdfs:Class;`);
      output.push(`  rdfs:label "${entry.label || ''}"@en;`);
      output.push(`  rdfs:comment """${entry.comment || ''}"""@en;`);
      if (entry.subClassOf) output.push(`  rdfs:subClassOf ${this.namespaced(entry.subClassOf)};`);
      output.push('  rdfs:isDefinedBy shex: .');
    }

    output.push('\n# Property definitions');
    for (const [id, entry] of Object.entries(this.properties)) {
      output.push(`shex:${id} a rdf:Property;`);
      output.push(`  rdfs:label "${entry.label || ''}"@en;`);
      output.push(`  rdfs:comment """${entry.comment || ''}"""@en;`);
      if (entry.subClassOf) output.push(`  rdfs:subPropertyOf ${this.namespaced(entry.subClassOf)};`);

      const domains = (entry.domain || '').split(',').filter(s => s !== '');
      if (domains.length === 1) output.push(`  rdfs:domain ${this.namespaced(entry.domain)};`);
      else if (domains.length > 1)
        output.push(`  rdfs:domain [ owl:unionOf (${domains.map(d => this.namespaced(d)).join(' ')})];`);

      const ranges = (entry.range || '').split(',').filter(s => s !== '');
      if (ranges.length === 1) output.push(`  rdfs:range ${this.namespaced(entry.range)};`);
      else if (ranges.length > 1)
        output.push(`  rdfs:range [ owl:unionOf (${ranges.map(r => this.namespaced(r)).join(' ')})];`);

      output.push('  rdfs:isDefinedBy shex: .');
    }

    output.push('\n# Datatype definitions');
    for (const [id, entry] of Object.entries(this.datatypes)) {
      output.push(`shex:${id} a rdfs:Datatype;`);
      output.push(`  rdfs:label "${entry.label || ''}"@en;`);
      output.push(`  rdfs:comment """${entry.comment || ''}"""@en;`);
      if (entry.subClassOf) output.push(`  rdfs:subClassOf ${this.namespaced(entry.subClassOf)};`);
      output.push('  rdfs:isDefinedBy shex: .');
    }

    output.push('\n# Instance definitions');
    for (const [id, entry] of Object.entries(this.instances)) {
      output.push(`shex:${id} a ${this.namespaced(entry.type)};`);
      output.push(`  rdfs:label "${entry.label || ''}"@en;`);
      output.push(`  rdfs:comment """${entry.comment || ''}"""@en;`);
      output.push('  rdfs:isDefinedBy shex: .');
    }

    return output.join('\n');
  }

  // --------------------------------------------------------------- ShExC

  // Port of Gregg's to_shexc. This is a sketch of ShExR derived from the
  // domain/range/multiplicity columns, NOT a replacement for the
  // hand-maintained ../doc/ShExR.shex: it has no CLOSED, no `a [sx:Class]`
  // type arcs, and no List2Plus/List1Plus shapes for the @list-valued
  // properties. Use `--check` to compare the two.
  toShexc() {
    const output = [];
    const typeDef = term => {
      const t = term.includes(':') ? term : `shex:${term}`;
      if (t === 'rdfs:Resource') return 'IRI';
      if (t.startsWith('xsd')) return t;
      return '@' + t;
    };
    const mult = s => ({'0:1': '?', '1:1': '', '1:N': '+', '0:N': '*'})[s] || '';

    for (const [id, entry] of Object.entries(this.prefixes))
      output.push(`PREFIX ${id}: <${entry.subClassOf}>`);

    output.push('#ShExc definition of ShExJ');
    output.push(`#${TITLE}`);
    output.push(`#${DESCRIPTION}`);
    output.push(`#Date: ${this.date}`);
    if (this.imports.length)
      output.push(`#Imports ${this.imports.map(i => '<' + i + '>').join(', ')}`);
    output.push(`#Version ${this.commit}`);
    output.push(`#See also ${this.seeAlso.map(i => '<' + i + '>').join(', ')}`);
    output.push('  \n');
    output.push('start = @shex:Schema');
    output.push('');

    output.push('\n# Shape definitions');
    for (const [id, cls] of Object.entries(this.classes)) {
      output.push(`shex:${id} {`);
      if (cls.subClassOf)
        output.push(`  #// rdfs:subClassOf ${this.namespaced(cls.subClassOf)};`);

      for (const [propid, prop] of Object.entries(this.properties)) {
        const domains = (prop.domain || '').split(',').filter(s => s !== '');
        if (!domains.includes(id)) continue;
        const ranges = (prop.range || '').split(',').filter(s => s !== '');
        if (ranges.length === 1)
          output.push(`  shex:${propid} ${typeDef(prop.range)}${mult(prop.ForwardMultiplicity)} ;`);
        else if (ranges.length > 1)
          output.push(`  shex:${propid} (${ranges.map(typeDef).join(' OR ')})${mult(prop.ForwardMultiplicity)} ;`);
        if (prop.subClassOf)
          output.push(`    #// rdfs:subPropertyOf ${this.namespaced(prop.subClassOf)};`);
      }

      const childs = Object.entries(this.classes)
        .filter(([, c]) => c.subClassOf === id)
        .map(([childId]) => '&shex:' + childId);
      if (childs.length) output.push(`  (${childs.join(' | ')})`);

      const values = Object.entries(this.instances)
        .filter(([, e]) => e.type === id)
        .map(([instid]) => `shex:${instid}`);
      if (values.length) output.push(`  [${values.join(' ')}]`);

      output.push('}');
    }
    return output.join('\n');
  }

  // ------------------------------------------------- ReSpec HTML template

  toHtml() {
    const json = this.buildJsonld();
    return renderHtml(json['@graph'], json['@context']);
  }
}

function renderHtml(ont, context) {
  const out = [];
  const w = line => out.push(line);

  w(`<html lang="en">
  <head>
    <meta charset='utf-8'/>
    <title>${ont['dc:title']['en']}</title>
    <script class="remove" src="https://www.w3.org/Tools/respec/respec-w3c-common"></script>
    <script class="remove">
var respecConfig = {
    localBiblio: {
      "shex-semantics": {
        "authors": [
          "Eric Prud'hommeaux",
          "Iovka Boneva",
          "Jose Labra Gayo",
          "Gregg Kellogg"
        ],
        "title": "Shape Expressions Language",
        "href" : "http://shex.io/shex-semantics",
        "rawDate": "2016-12-22",
        "status" : "CG-NOTE",
        "publisher": "W3C"
      }
    },
    specStatus:       "base",
    shortName:        "shexns",
    publishDate:      "${ont['dc:date']}",
    thisVersion:      "https://www.w3.org/ns/shex",
    edDraftURI:       "https://github.com/shexSpec/shexTest/tree/main/vocab",
    // lcEnd: "3000-01-01",
    // crEnd: "3000-01-01",
    testSuiteURI:     "https://shexspec.github.io/shexTest/",
    includePermalinks:true,
    noRecTrack:       true,
    github:           "https://github.com/shexSpec/shexTest",
    editors: [{
      name:       "Gregg Kellogg",
      url:        "http://greggkellogg.net/",
      company:    "Spec-Ops",
      companyURL: "https://spec-ops.io/",
      w3cid:      "44770"
    }],
    wg: "Shape Expressions Community Group",
    wgURI: "https://www.w3.org/community/shex/",
    wgPublicList: "public-csv-wg",
    wgPatentURI: "https://www.w3.org/2004/01/pp-impl/68238/status",
    alternateFormats: [
      {uri: "shex.ttl", label: "Turtle"},
      {uri: "shex.jsonld", label: "JSON-LD"}
    ],
    inlineCSS: true,
    doRDFa: false,
    noIDLIn: true,
    issueBase: "https://github.com/shexSpec/shex/issues/",
    noLegacyStyle: false
    };
    </script>
    <style type="text/css">
      dl.terms dt {
        float: left;
        clear: left;
        width: 17vw;
      }
      dl.terms dd:after {
          content: '';
          display: block;
          clear: both;
          margin-bottom: 5px;
      }
      table.rdfs-definition td {vertical-align: top;}
      .bold {font-weight: bold;}
    </style>
  </head>
  <body resource="${context['shex']}" typeof="owl:Ontology" prefix="shex: ${context['shex']}">
    <section id="abstract">
      <p>This document describes the
        <span property="dc:title">${ont['dc:title']['en']}</span>
        and Term definitions used
        for describing Shape Expressions [[shex-semantics]]. This document provides the RDFS [[RDF-SCHEMA]] vocabulary definition and a description of the JSON-LD context definition for use with
        defining shape expressions.</p>
      <p>Alternate versions of the vocabulary definition exist in
        <a rel="alternate" href="shex.ttl">Turtle</a> and
        <a rel="alternate" href="shex.jsonld">JSON-LD</a>,
        which also includes the <code>@context</code> required for metadata descriptions.
        <!--These versions may also be retrieved from <code>FIXME</code> using an appropiate HTTP <em>Accept</em> header.-->
      </p>
      <dl>
        <dt>Published:</dt><dd><time property="dc:date">${ont['dc:date']}</time></dd>`);
  const imports = ont['owl:imports'] || [];
  if (imports.length) {
    w('        <dt>Imports:</dt>');
    for (const ref of imports)
      w(`          <dd><a href="${ref}" property="owl:imports">${ref}</a></dd>`);
  }
  w(`        <dt>Version Info:</dt>
        <dd><a href="${ont['owl:versionInfo']}" property="owl:versionInfo">${ont['owl:versionInfo']}</a></dd>
        <dt>See Also:</dt>`);
  for (const ref of ont['rdfs:seeAlso'] || [])
    w(`          <dd><a href="${ref}" property="rdfs:seeAlso">${ref}</a></dd>`);
  w(`      </dl>
    </section>
    <section id="sotd">
      <p>
        FIXME
      </p>
    </section>
    <section>
      <h2>Introduction</h2>
      <p property="dc:description">${ont['dc:description']['en']}</p>
      <p>This specification makes use of the following namespaces:</p>
      <dl class="terms">
        <dt><code>shex</code>:</dt>
        <dd><code>http://www.w3.org/ns/shex#</code></dd>
        <dt><code>rdf</code>:</dt>
        <dd><code>http://www.w3.org/1999/02/22-rdf-syntax-ns#</code></dd>
        <dt><code>rdfs</code>:</dt>
        <dd><code>http://www.w3.org/2000/01/rdf-schema#</code></dd>
        <dt><code>xsd</code>:</dt>
        <dd><code>http://www.w3.org/2001/XMLSchema#</code></dd>
      </dl>
    </section>`);

  for (const sect of [
    {heading: 'Class Definitions',    key: 'rdfs_classes'},
    {heading: 'Property Definitions', key: 'rdfs_properties'},
    {heading: 'Datatype Definitions', key: 'rdfs_datatypes'},
    {heading: 'Instance Definitions', key: 'rdfs_instances'},
  ]) {
    w('    <section>');
    w(`      <h2>${sect.heading}</h2>`);
    w(`      <p>The following are ${sect.heading.toLowerCase()} in the <code>shex</code> namespace:</p>`);
    w('      <table class="rdfs-definition">');
    for (const defn of ont[sect.key] || []) {
      const frag = defn['@id'].slice(5);
      const label = defn['rdfs:label']['en'];
      w(`        <tr id="${frag}">`);
      w(`          <td class="bold">${frag}</td>`);
      w(`          <td resource="${defn['@id']}" typeof="${[].concat(defn['@type']).join(' ')}">`);
      w(`            <em property="rdfs:label">${label}</em>`);
      w(`            <span class="permalink"><a href="#${frag}" aria-label="Permalink for ${label}" title="Permalink for ${label}"><span>§</span></a></span>`);
      w(`            <p property="rdfs:comment">${defn['rdfs:comment']['en']}</p>`);
      w('            <span property="rdfs:isDefinedBy" resource="shex:"></span>');
      const props = ['rdfs:subClassOf', 'rdfs:subPropertyOf', 'rdfs:range', 'rdfs:domain'];
      if (props.some(p => p in defn)) {
        w('              <dl class="terms">');
        for (const p of props) {
          if (!(p in defn)) continue;
          w(`                  <dt>${p}</dt>`);
          const v = defn[p];
          if (typeof v === 'object' && v !== null && 'owl:unionOf' in v) {
            w(`                      <dd property="${p}" resource="_:">`);
            w('                        Union of');
            for (const c of v['owl:unionOf'])
              w(`                        <span property="owl:unionOf" inlist=true resource="${c}">${c}</span>`);
            w('                      </dd>');
          } else {
            w(`                      <dd property="${p}" resource="${v}">${v}</dd>`);
          }
        }
        w('              </dl>');
      }
      w('          </td>');
      w('        </tr>');
    }
    w('      </table>');
    w('    </section>');
  }

  w('    <section>');
  w('      <h2>Term Definitions</h2>');
  w('      <dl class="terms">');
  for (const term of Object.keys(context).sort()) {
    const defn = context[term];
    w(`        <dt>${term}</dt>`);
    w('        <dd>');
    if (typeof defn === 'string') w(`            ${defn}`);
    else if (defn['@id']) w(`            ${defn['@id']}`);
    else if (defn['@reverse']) w(`            reverse of ${defn['@reverse']}`);
    else w(`            ${term}`);
    if (typeof defn === 'object' && defn['@type'])
      w(`            with string values interpreted as ${defn['@type']}`);
    if (typeof defn === 'object' && defn['@container']) {
      if (defn['@container'] === '@language')
        w('              with object values interpreted as language-specific, indexed by language');
      else if (defn['@container'] === '@index')
        w('              with object values interpreted indexed by index');
      else
        w(`              with array values interpreted as ${defn['@container']}`);
    }
    w('        </dd>');
  }
  w('      </dl>');
  w('    </section>');
  w('  </body>');
  w('</html>');

  return out.join('\n');
}

// ------------------------------------------------------------ drift check

// The vocabulary has derived copies that this script does NOT generate,
// because they are hand-maintained and richer than anything the CSV can
// express (../doc/ShExR.shex and its ../doc/ShExR.ttl serialization, mirrored
// into shex.js as packages/shex-webapp/doc/ShExRSchema.js). They drift in both
// directions: ShExR ran years ahead of the vocabulary with sx:ShapeDecl,
// sx:abstract and sx:imports, and still carries sx:negated, which the language
// dropped in 2016 (see README.md). Comparing the term sets makes that show up
// as a failure rather than as a surprise years later.
function check(vocab) {
  const defined = new Set([
    ...Object.keys(vocab.classes),
    ...Object.keys(vocab.properties),
    ...Object.keys(vocab.datatypes),
    ...Object.keys(vocab.instances),
  ]);

  const shexrPath = path.join(__dirname, '..', 'doc', 'ShExR.shex');
  const used = new Set();
  for (const m of fs.readFileSync(shexrPath, 'utf8').matchAll(/\bsx:([A-Za-z_][A-Za-z0-9_]*)/g))
    used.add(m[1]);

  const missing = [...used].filter(t => !defined.has(t)).sort();

  // Terms the vocabulary defines but ShExR never mentions are expected: the
  // abstract classes and properties ShExR expands away, and the shape-map
  // terms, which describe ShapeMaps rather than schemas.
  console.log(`vocab.csv defines ${defined.size} terms; doc/ShExR.shex uses ${used.size}`);
  if (missing.length) {
    console.error(`\ndoc/ShExR.shex uses ${missing.length} term(s) absent from vocab.csv:`);
    missing.forEach(t => console.error(`  sx:${t}`));
    console.error('\nEither correct ShExR.shex, or add them to vocab.csv and regenerate.');
    console.error('See README.md -- sx:negated is expected here, and wants removing');
    console.error('from ShExR rather than adding to a published W3C namespace.');
    return 1;
  }
  console.log('doc/ShExR.shex uses no terms absent from vocab.csv');
  return 0;
}

// -------------------------------------------------------------------- CLI

const USAGE = `Usage: mk_vocab.js [options]
  -f, --format FMT   emit one format to stdout: jsonld|ttl|html|context|shexc
  -o, --output FILE  write --format output to FILE instead of stdout
      --nsdir DIR    also regenerate shex.{ttl,jsonld,html} in DIR
                     (a w3c/ns checkout; they are published at www.w3.org/ns/)
      --check        report terms used by ../doc/ShExR.shex but not defined here
      --csv FILE     vocabulary source (default: ./vocab.csv)
      --date DATE    override the dc:date otherwise taken from git log
      --commit URL   override the owl:versionInfo otherwise taken from git log

With no options, regenerates the derived files inside this repo
(../doc/ShExJ-context.jsonld).`;

function main() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format': case '-f': opts.format = args[++i]; break;
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--csv':               opts.csv = args[++i]; break;
      case '--date':              opts.date = args[++i]; break;
      case '--commit':            opts.commit = args[++i]; break;
      case '--nsdir':             opts.nsdir = args[++i]; break;
      case '--check':             opts.check = true; break;
      case '--help': case '-?':   console.error(USAGE); process.exit(1);
      default:
        console.error(`Unknown option: ${args[i]}\n\n${USAGE}`);
        process.exit(1);
    }
  }

  const vocab = new Vocab(opts.csv || path.join(__dirname, 'vocab.csv'), opts);
  const gen = {
    jsonld:  () => vocab.toJsonld(),
    ttl:     () => vocab.toTtl(),
    html:    () => vocab.toHtml(),
    context: () => vocab.toContext(),
    shexc:   () => vocab.toShexc(),
  };

  if (opts.check) process.exit(check(vocab));

  if (opts.format) {
    if (!gen[opts.format]) {
      console.error(`Unknown format: ${opts.format}\n\n${USAGE}`);
      process.exit(1);
    }
    const text = gen[opts.format]() + '\n';
    if (opts.output) fs.writeFileSync(opts.output, text);
    else process.stdout.write(text);
    return;
  }

  const write = (target, text) => {
    fs.writeFileSync(target, text + '\n');
    console.error(`wrote ${target}`);
  };

  write(path.join(__dirname, '..', 'doc', 'ShExJ-context.jsonld'), gen.context());

  if (opts.nsdir) {
    for (const [format, fn] of Object.entries({jsonld: 'shex.jsonld', ttl: 'shex.ttl', html: 'shex.html'}))
      write(path.join(opts.nsdir, fn), gen[format]());
  }
}

main();
