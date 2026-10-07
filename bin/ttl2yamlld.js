#!/usr/bin/env node
/* ttl2yamlld - write a suite manifest's YAML-LD from its legacy
 * Turtle, carrying the comments across.  A migration tool: run once per
 * manifest; from then on manifest-ld.yaml is the text people edit, and
 * bin/yaml2ttl.js writes the Turtle from it.
 *
 *   bin/ttl2yamlld.js validation/manifest.ttl -o validation/manifest-ld.yaml
 *
 * The YAML is not the Turtle transliterated.  It is the manifest in the
 * format implementations use for their own examples -- the ShEx manifest
 * vocabulary (https://www.w3.org/ns/shex-manifest) plus the ShEx test
 * vocabulary (https://www.w3.org/ns/shex-test) -- so the legacy expression
 * goes:
 *
 * - no test is typed.  A validation test is an entry with a `status`, and
 *   the status says what sht:ValidationTest and sht:ValidationFailure said:
 *   conformant or nonconformant.  A schema that must be rejected says how
 *   (`schemaError: syntax` or `structure`); a representation test says
 *   nothing, having three serializations of one schema to compare.
 * - an entry is named, not identified: `name: 1dot_pass` where the Turtle
 *   had both <#1dot_pass> and mf:name "1dot_pass".  (Where those two
 *   disagree, the entry keeps both, with a note.)
 * - there is no mf:action node: an entry's schemaURL, dataURL, node and
 *   shape are its own.
 * - mf:status, the community's verdict on the test itself, is `approval`,
 *   since `status` is the outcome the test expects.
 * - the mf:entries collection and the definitions are ONE list, `entries`,
 *   of the tests themselves, in the collection's order.
 * - there is no @base: a reference is relative to the manifest, wherever it
 *   is.  (bin/yaml2ttl.js supplies the suite's conventional base.)
 *
 * It is deliberately NOT parse-to-a-graph-and-serialize: a graph has no
 * comments, and the manifests' comments (section markers, TODO lists,
 * commented-out tests, notes on why a test is the way it is) are what a
 * maintainer navigates by.  A small Turtle lexer keeps each comment as a
 * token; a parser for the shape a manifest has (subject blocks of
 * predicate-object lists, blank-node property lists, collections) keeps
 * each where it was; and the emitter writes them at the same places: a
 * comment in the collection before the test it preceded there, a comment
 * among the definitions before the definition it preceded (a section's
 * closing `## }` marker after the one it followed).
 *
 * bin/manifest-terms.js is the table of which legacy predicate becomes
 * which key, shared with the scripts that go the other way.
 */
"use strict";

const Fs = require("fs");
const Path = require("path");
const {PREFIXES, TERMS, TYPES, CONTEXTS, writeAssociation} = require("./manifest-terms.js");

// --- arguments ------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.error("usage: ttl2yamlld.js manifest.ttl [-o manifest-ld.yaml]");
  process.exit(args.length === 0 ? 1 : 0);
}
const optionValue = (flag) => {
  const i = args.indexOf(flag);
  if (i === -1)
    return null;
  const [, value] = args.splice(i, 2);
  return value;
};
const OUTFILE = optionValue("-o");
const INFILE = args[0];

const expandWith = (prefixes, pname) => {
  const i = pname.indexOf(":");
  const prefix = pname.slice(0, i);
  return prefix in prefixes ? prefixes[prefix] + pname.slice(i + 1) : null;
};
/** legacy predicate IRI -> its rows in the table */
const byLegacy = new Map();
for (const row of TERMS) {
  const iri = expandWith(PREFIXES, row.legacy);
  byLegacy.set(iri, (byLegacy.get(iri) || []).concat([row]));
}
const typeByLegacy = new Map(TYPES.map(t => [expandWith(PREFIXES, t.legacy), t]));
const RDF_TYPE = PREFIXES.rdf + "type";
const MF = PREFIXES.mf;

// --- the lexer: Turtle tokens, comments among them --------------------------------

function lex (text) {
  const tokens = [];
  let i = 0, line = 1, sawTokenOnLine = false, blankLines = 0;
  const push = (type, value, extra) => {
    tokens.push(Object.assign({type, value, line, blankBefore: blankLines > 0}, extra));
    blankLines = 0;
    sawTokenOnLine = true;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      if (!sawTokenOnLine)
        ++blankLines;
      sawTokenOnLine = false;
      ++line;
      ++i;
    } else if (c === " " || c === "\t" || c === "\r") {
      ++i;
    } else if (c === "#") {
      let j = text.indexOf("\n", i);
      if (j === -1)
        j = text.length;
      // a comment after a token on its line trails that token; one on a
      // line of its own leads whatever comes next
      const trailing = sawTokenOnLine;
      tokens.push({type: "comment", value: text.slice(i, j).replace(/\s+$/, ""), line, trailing, blankBefore: blankLines > 0});
      blankLines = 0;
      sawTokenOnLine = true;
      i = j;
    } else if (c === "<") {
      const j = text.indexOf(">", i);
      push("iri", text.slice(i + 1, j));
      i = j + 1;
    } else if (c === '"' || c === "'") {
      const long = text.startsWith(c.repeat(3), i);
      const quote = long ? c.repeat(3) : c;
      let j = i + quote.length, value = "";
      while (!text.startsWith(quote, j)) {
        if (text[j] === "\\") {
          const e = text[j + 1];
          if (e === "u") { value += String.fromCodePoint(parseInt(text.slice(j + 2, j + 6), 16)); j += 6; }
          else if (e === "U") { value += String.fromCodePoint(parseInt(text.slice(j + 2, j + 10), 16)); j += 10; }
          else { value += ({n: "\n", t: "\t", r: "\r", b: "\b", f: "\f"})[e] || e; j += 2; }
        } else {
          if (text[j] === "\n")
            ++line;
          value += text[j++];
        }
      }
      j += quote.length;
      const extra = {};
      if (text.startsWith("^^", j)) {
        j += 2;
        if (text[j] === "<") {
          const k = text.indexOf(">", j);
          extra.datatype = {type: "iri", value: text.slice(j + 1, k)};
          j = k + 1;
        } else {
          const m = /^[A-Za-z][\w.-]*:[\w.-]*/.exec(text.slice(j));
          extra.datatype = {type: "pname", value: m[0]};
          j += m[0].length;
        }
      } else if (text[j] === "@") {
        const m = /^@[A-Za-z]+(?:-[A-Za-z0-9]+)*/.exec(text.slice(j));
        extra.language = m[0].slice(1);
        j += m[0].length;
      }
      push("literal", value, extra);
      i = j;
    } else if (".;,[]()".includes(c) && !(c === "." && /[0-9]/.test(text[i + 1] || ""))) {
      push(c, c);
      ++i;
    } else if (c === "_" && text[i + 1] === ":") {
      const m = /^_:[\w.-]*\w/.exec(text.slice(i));
      push("bnode", m[0]);
      i += m[0].length;
    } else {
      // a directive, `a`, a number, a boolean or a prefixed name
      const m = /^(?:@prefix|@base|[+-]?\d+\.\d+(?:[eE][+-]?\d+)?|[+-]?\d+|[A-Za-z][\w-]*(?:\.[\w-]+)*:(?:[\w%-]|\.(?=[\w%-]))*|[A-Za-z][\w-]*:|[A-Za-z]+)/.exec(text.slice(i));
      if (!m)
        throw new Error(`${INFILE}:${line}: cannot lex ${JSON.stringify(text.slice(i, i + 30))}`);
      const word = m[0];
      if (word === "@prefix" || word === "@base" || /^(?:PREFIX|BASE)$/i.test(word))
        push("directive", word.replace("@", "").toLowerCase(), {sparqlStyle: !word.startsWith("@")});
      else if (/^[+-]?\d/.test(word))
        push("number", word);
      else if (word === "true" || word === "false")
        push("boolean", word);
      else if (word === "a")
        push("a", "a");
      else
        push("pname", word);
      i += word.length;
    }
  }
  return tokens;
}

// --- the parser: the shape a manifest has, each comment kept where it was ---------

function parse (tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const fail = (what) => {
    const t = tokens[p] || {line: "EOF", value: ""};
    throw new Error(`${INFILE}:${t.line}: expected ${what}, got ${JSON.stringify(t.value)}`);
  };
  /** the comments at the cursor: [leading, ...] with a flag on each */
  const comments = () => {
    const found = [];
    while (p < tokens.length && tokens[p].type === "comment")
      found.push(tokens[p++]);
    return found;
  };
  const expect = (type) => {
    if (!peek() || peek().type !== type)
      fail(`"${type}"`);
    return tokens[p++];
  };
  const prefixes = {};
  let base = null;
  const items = [];                     // top-level: comments and subject blocks, in order

  const object = () => {
    const t = peek();
    if (!t)
      fail("an object");
    if (["iri", "pname", "bnode", "literal", "number", "boolean"].includes(t.type)) {
      ++p;
      return t;
    }
    if (t.type === "[") {
      ++p;
      const node = {type: "node", statements: predicateObjectList("]")};
      expect("]");
      return node;
    }
    if (t.type === "(") {
      ++p;
      const members = [];
      for (;;) {
        const lead = comments();
        if (peek() && peek().type === ")") {
          ++p;
          return {type: "list", members, closing: lead};
        }
        const member = object();
        member.lead = lead;
        // a comment on the member's own line trails it
        if (peek() && peek().type === "comment" && peek().trailing)
          member.trail = tokens[p++];
        members.push(member);
      }
    }
    fail("an object");
  };

  /** verb objectList (';' (verb objectList)?)* up to (not past) `end` */
  const predicateObjectList = (end) => {
    const statements = [];
    for (;;) {
      const lead = comments();
      const t = peek();
      if (!t)
        fail(`"${end}"`);
      if (t.type === end) {
        if (lead.length)
          statements.push({closing: lead});
        return statements;
      }
      if (t.type === ";") {             // a stray `;` before the end
        ++p;
        if (lead.length)
          statements.push({closing: lead});
        continue;
      }
      if (t.type !== "pname" && t.type !== "a" && t.type !== "iri")
        fail("a predicate");
      ++p;
      const statement = {verb: t, objects: [], lead};
      for (;;) {
        const between = comments();
        const o = object();
        o.lead = (o.lead || []).concat(between);
        statement.objects.push(o);
        if (peek() && peek().type === ",") {
          ++p;
          continue;
        }
        break;
      }
      if (peek() && peek().type === ";")
        ++p;
      if (peek() && peek().type === "comment" && peek().trailing)
        statement.trail = tokens[p++];
      statements.push(statement);
    }
  };

  while (p < tokens.length) {
    const lead = comments();
    lead.forEach(c => items.push(c));
    const t = peek();
    if (!t)
      break;
    if (t.type === "directive") {
      ++p;
      if (t.value === "base") {
        base = expect("iri").value;
      } else {
        const prefix = expect("pname").value.replace(/:$/, "");
        prefixes[prefix] = expect("iri").value;
      }
      if (!t.sparqlStyle)
        expect(".");
      continue;
    }
    if (t.type !== "iri" && t.type !== "pname" && t.type !== "bnode")
      fail("a subject");
    ++p;
    const block = {type: "block", subject: t, statements: predicateObjectList(".")};
    expect(".");
    if (peek() && peek().type === "comment" && peek().trailing)
      block.trail = tokens[p++];
    items.push(block);
  }
  return {prefixes, base, items};
}

// --- the emitter ------------------------------------------------------------------

const RESERVED = /^(?:true|false|yes|no|on|off|null|y|n|~)$/i;
/** a string as a YAML scalar: plain when that is unmistakably a string and
 * unmistakably this string, else double-quoted (JSON's quoting is YAML's) */
function scalar (s, {flow = false} = {}) {
  if (typeof s !== "string")
    return String(s);
  const plain = s.length > 0
        && /^[A-Za-z_.\/][^\s"'`#]*$/.test(s) && !/^\.+$/.test(s)   // one word, starting like a name or a path
        && !/[:,]$/.test(s) && !/[\[\]{}*&!|>%@\\]/.test(s)
        && !(flow && /[,\[\]{}]/.test(s))
        && !RESERVED.test(s);
  return plain ? s : JSON.stringify(s);
}

const out = [];
const emit = (indent, text) => out.push(text === "" ? "" : " ".repeat(indent) + text);
/** the prefixes of keys written as compact IRIs, which the manifest binds */
const keyPrefixes = new Set();
const emitComment = (indent, c) => {
  if (c.blankBefore && out.length && out[out.length - 1] !== "")
    out.push("");
  // an editor's mode line said this was N3; it is YAML now
  emit(indent, c.value.replace(/(-\*-.*\bmode:\s*)n3\b/, "$1yaml"));
};

function convert (text) {
  const {prefixes, items} = parse(lex(text));
  const expand = (t) => t.type === "a" ? RDF_TYPE : t.type === "iri" ? t.value : expandWith(prefixes, t.value);
  const oops = (t, what) => { throw new Error(`${INFILE}:${t.line}: ${what}`); };

  /** one object as a YAML value, the way its row's kind says */
  const value = (o, row, flow = false) => {
    switch (row.kind) {
    case "iri":
      if (o.type !== "iri")
        oops(o, `${row.legacy} wants an IRI`);
      return scalar(o.value, {flow});
    case "term":
      if (o.type === "iri")
        return scalar(o.value, {flow});
      if (o.type === "pname")
        return scalar(expand(o), {flow});
      if (o.type === "bnode")
        return JSON.stringify(o.value);
      if (o.type === "literal") {
        // a value object: a literal where the term would make a string an IRI
        const parts = [`"@value": ${JSON.stringify(o.value)}`];
        if (o.language)
          parts.push(`"@language": ${JSON.stringify(o.language)}`);
        if (o.datatype)
          parts.push(`"@type": ${JSON.stringify(o.datatype.type === "iri" ? o.datatype.value : expandWith(prefixes, o.datatype.value))}`);
        return `{${parts.join(", ")}}`;
      }
      return oops(o, `${row.legacy} wants a term`);
    case "text":
      if (o.type !== "literal")
        oops(o, `${row.legacy} wants a string`);
      return JSON.stringify(o.value);   // prose is always quoted: it is full of YAML's punctuation
    case "number":
      if (o.type !== "number")
        oops(o, `${row.legacy} wants a number`);
      return o.value;
    case "mfname": {
      const iri = expand(o);
      if (!iri || !iri.startsWith(MF))
        oops(o, `${row.legacy} wants an mf: name`);
      return scalar(iri.slice(MF.length));
    }
    default:
      return oops(o, `${row.legacy}: unexpected ${row.kind}`);
    }
  };

  /** the statements of a test (or of its action node, or of a member of its
   * extensionResults), as the keys of a YAML mapping at `indent`.  `where`
   * is which rows of the table apply; `sort` whether this is a validation
   * test or a schema test */
  const emitStatements = (indent, statements, where, sort, skip) => {
    for (const s of statements) {
      if (s.closing) {
        s.closing.forEach(c => emitComment(indent, c));
        continue;
      }
      (s.lead || []).forEach(c => emitComment(indent, c));
      s.objects.forEach(o => (o.lead || []).forEach(c => emitComment(indent, c)));
      const trail = s.trail ? " " + s.trail.value : "";
      const predicate = expand(s.verb);
      if (skip && skip(s, predicate, trail))
        continue;
      if (where === "test" && predicate === MF + "action") {
        // no action node: its contents are the entry's own
        if (s.objects.length !== 1 || s.objects[0].type !== "node")
          oops(s.verb, "mf:action wants one blank node");
        if (trail)
          emit(indent, trail.trim());
        emitAction(indent, s.objects[0].statements, sort);
        continue;
      }
      const rows = (byLegacy.get(predicate) || []).filter(r => r.in === where && (!r.only || r.only === sort));
      if (rows.length !== 1)
        oops(s.verb, `no place in the YAML for ${s.verb.value} ${where === "test" ? "on a test" : "in " + where}`);
      const row = rows[0];
      const key = /^[A-Za-z_][\w.-]*(?::[\w.-]+)?$/.test(row.key) ? row.key : JSON.stringify(row.key);
      if (row.key.includes(":"))
        keyPrefixes.add(row.key.split(":")[0]);   // bound in the @context, below
      if (row.kind === "list") {
        if (s.objects.length !== 1 || s.objects[0].type !== "list")
          oops(s.verb, `${row.legacy} wants a collection`);
        emit(indent, `${key}:${trail}`);
        for (const member of s.objects[0].members) {
          (member.lead || []).forEach(c => emitComment(indent + 2, c));
          if (member.type !== "node")
            oops(s.verb, `${row.legacy} wants a collection of nodes`);
          const mark = out.length;
          emitStatements(indent + 4, member.statements, "ext", sort);
          // the mapping's first key takes the list item's dash
          for (let i = mark; i < out.length; ++i)
            if (out[i] !== "" && !out[i].trimStart().startsWith("#")) {
              out[i] = " ".repeat(indent + 2) + "- " + out[i].slice(indent + 4);
              break;
            }
        }
        (s.objects[0].closing || []).forEach(c => emitComment(indent + 2, c));
      } else if (row.kind === "names") {
        const names = s.objects.map(o => {
          const iri = expand(o);
          if (!iri || !iri.startsWith(PREFIXES.sht))
            oops(o, `${row.legacy} wants sht: names`);
          return scalar(iri.slice(PREFIXES.sht.length), {flow: true});
        });
        emit(indent, `${key}: [${names.join(", ")}]${trail}`);
      } else if (s.objects.length === 1) {
        emit(indent, `${key}: ${value(s.objects[0], row)}${trail}`);
      } else {
        // several values of one predicate
        emit(indent, `${key}: [${s.objects.map(o => value(o, row, true)).join(", ")}]${trail}`);
      }
    }
  };

  /** an action node's contents, as the entry's own.  A focus and a shape
   * that are IRIs are `node` and `shape`; a blank node or a literal among
   * them cannot be a reference, so the pair is said as a query map */
  const emitAction = (indent, statements, sort) => {
    const of = (local) => statements.find(s => s.verb && expand(s.verb) === PREFIXES.sht + local);
    const focus = of("focus"), shape = of("shape");
    const isIri = (s) => s.objects.length === 1 && s.objects[0].type === "iri";
    if (!focus || (isIri(focus) && (!shape || isIri(shape)))) {
      emitStatements(indent, statements, "action", sort);
      return;
    }
    const termOf = (o) => {
      if (o.type === "iri") {
        if (!/^[a-z][a-z0-9+.-]*:/i.test(o.value))
          oops(o, "a relative IRI in a test whose focus or shape is not an IRI: a query map would resolve it differently");
        return {iri: o.value};
      }
      if (o.type === "bnode")
        return {bnode: o.value};
      if (o.type === "literal")
        return Object.assign({value: o.value},
                             o.datatype ? {datatype: o.datatype.type === "iri" ? o.datatype.value : expandWith(prefixes, o.datatype.value)} : {},
                             o.language ? {language: o.language} : {});
      return oops(o, "not a node");
    };
    const association = writeAssociation({node: termOf(focus.objects[0]), shape: shape ? termOf(shape.objects[0]) : null});
    let written = false;
    emitStatements(indent, statements, "action", sort, (s, predicate, trail) => {
      if (s !== focus && s !== shape)
        return false;
      if (!written) {
        // where the first of the two was
        emit(indent, `queryMap: ${JSON.stringify(association)}${trail}`);
        written = true;
      } else if (trail) {
        emit(indent, trail.trim());
      }
      return true;
    });
  };

  // the manifest block, and the definitions by subject
  const isEntries = (s) => s.verb && expand(s.verb) === MF + "entries";
  const manifestIndex = items.findIndex(it => it.type === "block" && it.statements.some(isEntries));
  if (manifestIndex === -1)
    throw new Error(`${INFILE}: no subject with mf:entries`);
  const manifest = items[manifestIndex];
  const listed = manifest.statements.find(isEntries).objects[0];

  /** each definition with the comments that travel with it: those before it
   * lead it -- but a section's closing marker (`## } name`, or a `}` line)
   * belongs after the definition before it */
  const definitions = new Map();
  const preamble = [];
  let pending = [];
  let previous = null;
  const isCloser = (c) => /^#+\s*\}/.test(c.value);
  items.forEach((it, i) => {
    if (i < manifestIndex) {
      preamble.push(it);
    } else if (i === manifestIndex) {
      // emitted below
    } else if (it.type === "comment") {
      if (isCloser(it) && previous && pending.length === 0)
        previous.trailing.push(it);
      else
        pending.push(it);
    } else {
      if (it.subject.type !== "iri" || !it.subject.value.startsWith("#"))
        oops(it.subject, "a test is expected to be <#name>");
      if (definitions.has(it.subject.value))
        oops(it.subject, `${it.subject.value} is defined twice`);
      const def = {block: it, leading: pending, trailing: []};
      definitions.set(it.subject.value, def);
      pending = [];
      previous = def;
    }
  });
  const after = pending;

  // --- write it
  preamble.forEach(it => {
    if (it.type !== "comment")
      oops(it.subject, "a subject before the manifest");
    emitComment(0, it);
  });
  if (out.length && out[out.length - 1] !== "")
    out.push("");
  emit(0, `"@context":`);
  CONTEXTS.forEach(c => emit(2, `- ${scalar(c)}`));
  const contextEnd = out.length;            // where a key's prefix binding goes, once the entries are written
  for (const s of manifest.statements) {
    if (s.closing) {
      s.closing.forEach(c => emitComment(0, c));
      continue;
    }
    (s.lead || []).forEach(c => emitComment(0, c));
    const predicate = expand(s.verb);
    if (predicate === RDF_TYPE) {
      if (expand(s.objects[0]) !== MF + "Manifest")
        oops(s.verb, "the manifest is expected to be an mf:Manifest");
    } else if (predicate === PREFIXES.rdfs + "comment") {
      emit(0, `comment: ${JSON.stringify(s.objects[0].value)}${s.trail ? " " + s.trail.value : ""}`);
    } else if (!isEntries(s)) {
      oops(s.verb, `no place in the YAML for ${s.verb.value} on the manifest`);
    }
  }
  emit(0, "entries:");
  (listed.lead || []).forEach(c => emitComment(2, c));

  const emitDefinition = (def, id) => {
    def.leading.forEach(c => emitComment(2, c));
    if (out.length && out[out.length - 1] !== "" && !out[out.length - 1].trimStart().startsWith("#"))
      out.push("");
    const fragment = id.slice(1);
    const statements = def.block.statements;
    const typeStatement = statements.find(s => s.verb && expand(s.verb) === RDF_TYPE);
    if (!typeStatement)
      oops(def.block.subject, `${id} has no type`);
    const type = typeByLegacy.get(expand(typeStatement.objects[0]));
    if (!type)
      oops(typeStatement.verb, `${id}: no place in the YAML for the type ${typeStatement.objects[0].value}`);
    const names = statements.filter(s => s.verb && expand(s.verb) === MF + "name");
    if (names.length !== 1)
      oops(def.block.subject, `${id} has ${names.length} names`);
    const name = names[0].objects[0].value;
    if (name === fragment) {
      emit(2, `- name: ${scalar(name)}`);
    } else {
      // the Turtle's own inconsistency, kept so that it can be written back
      emit(2, `# The Turtle identified this test as <${id}> and named it ${JSON.stringify(name)}.`);
      emit(2, `- "@id": ${JSON.stringify(id)}`);
      emit(4, `name: ${scalar(name)}`);
    }
    emitStatements(4, statements, "test", type.sort, (s, predicate, trail) => {
      if (predicate === MF + "name") {
        if (trail)
          emit(4, trail.trim());
        return true;
      }
      if (predicate === RDF_TYPE) {
        // what the type said, said by the entry's own attributes
        for (const [key, v] of Object.entries(type.says))
          emit(4, `${key}: ${v}${trail}`);
        return true;
      }
      return false;
    });
    if (def.block.trail)
      emitComment(4, def.block.trail);
    def.trailing.forEach(c => emitComment(2, c));
  };

  const written = new Set();
  for (const member of listed.members) {
    (member.lead || []).forEach(c => emitComment(2, c));
    if (member.type !== "iri")
      oops(member, "mf:entries wants <#name> references");
    const id = member.value;
    const def = definitions.get(id);
    if (written.has(id))
      oops(member, `${id} is listed twice in mf:entries`);
    if (def === undefined)
      oops(member, `${id} is listed in mf:entries and never defined`);
    emitDefinition(def, id);
    written.add(id);
    if (member.trail)
      emitComment(4, member.trail);
  }
  (listed.closing || []).forEach(c => emitComment(2, c));
  for (const [id, def] of definitions)
    if (!written.has(id))
      oops(def.block.subject, `${id} is defined and not listed in mf:entries`);
  after.forEach(c => emitComment(0, c));
  // a key written as a compact IRI (mf:comment, as the Turtle had it) is a
  // term of neither vocabulary: the manifest binds its prefix itself
  out.splice(contextEnd, 0, ...[...keyPrefixes].sort().map(p => `  - ${p}: ${PREFIXES[p]}`));
  return out.join("\n") + "\n";
}

const yaml = convert(Fs.readFileSync(INFILE, "utf8"));
if (OUTFILE)
  Fs.writeFileSync(OUTFILE, yaml);
else
  process.stdout.write(yaml);
