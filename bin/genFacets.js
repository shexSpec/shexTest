#!/usr/bin/env node

var shexProfiles = {
  "INTEGER": { "": "5", "Lead": "05" },
  "xsd:integer": { "": "\"5\"^^<http://www.w3.org/2001/XMLSchema#integer>", "Lead": "05" },
  "xsd:decimal": { "": "\"5.5\"^^<http://www.w3.org/2001/XMLSchema#decimal>" },
  "xsd:float": { "": "\"5.5\"^^<http://www.w3.org/2001/XMLSchema#float>" },
  "xsd:double": { "": "\"5.5e0\"^^<http://www.w3.org/2001/XMLSchema#double>" },
  "xsd:byte": { "": "true" },
  "roman:numeral": { "": "\"V\"^^<http://roman.example/numeral>" },
  "DECIMAL": { "": "5.5", "LeadTrail": "05.50", "int": "5.0", "intLeadTrail": "05.00" },
  "DOUBLE": { "": "5.5e0", "LeadTrail": "05.50e0", "int": "5.0e0", "intLeadTrail": "05.00e0" },
};
var dataProfiles = {
  "xsd:integer": {
    label: "INT",
    values: {"low": "4", "equal": "5", "equalLead": "05", "high": "6"}
  },
  "xsd:decimal": {
    label: "DEC",
    values: {"low": "5.4", "equal": "5.5", "equalLeadTrail": "05.50", "high": "5.6"}
  },
  "xsd:float": {
    label: "FLT",
    values: {"low": "5.4", "equal": "5.5", "equalLeadTrail": "05.50", "high": "5.6"}
  },
  "xsd:double": {
    label: "DBL",
    values: {"low": "5.4", "equal": "5.5", "equalLeadTrail": "05.50", "high": "5.6"}
  },
  "xsd:byte": {
    label: "BYT",
    values: {"low": "4", "equal": "5", "equalLead": "05", "high": "6"}
  },
  "xsd:dateTime": {
    label: "DT",
    values: {"equal": "2015-12-25T01:23:45Z"}
  },
  "xsd:string": {
    label: "STR",
    values: {"equal": "ab"}
  },
  "roman:numeral": {
    label: "RMN",
    values: {"low": "IV", "equal": "V", "high": "VI"}
  }
};

var xlsx = require('xlsx');
var args = process.argv.slice(2);
var workbook = xlsx.readFile(args[0]);
var worksheet = workbook.Sheets['tests'];
var testList = [];
var testDfns = {};

/**
 * Parses spreadsheet and creates tests in sht Turtle format.
 * @example
 * Spreadsheet:
 *   A   B         C     D           E       F   G    H     I           J     K    L          M              N    O
 * 1 range         count nodeKind    argument/--features--\ estDT       low   equal equalLead equalLeadTrail high ShEx filename
 * 2 Min inclusive
 * 3               1     xsd:integer DECIMAL int            xsd:integer        pass                               1integerMininclusiveDECIMAL
 * 4               1     xsd:integer DECIMAL int Lead Trail xsd:integer  fail  pass  pass                    pass 1integerMininclusiveDECIMALLeadTrail
 * gen( "O", 3, 4, 1); // ShEs filename, row 3 - row 4, headings in row 1.
 * // returns 5 tests
 */
function gen (shexCol, start, end, headings) {
  for (var row = start; row <= end; ++row) {
    var testAddress = shexCol + row;
    function warn (msg, obj, key) {
      var m = testAddress + ": " + msg;
      console.warn(m);
      return key ? extend(obj, {key: m}) : "[["+m+"]]";
    }
    var shex = worksheet[testAddress];
    if (shex && "f" in shex && shex.v !== "") {
      var m = shex.f.match(/^IF\(COUNTA\(([A-Z]+)([0-9]+):([A-Z]+)(?:[0-9]+)\) > 0, CONCATENATE\(([A-Z]+[0-9]+),MID\(([A-Z]+[0-9]+), FIND\(":", (?:[A-Z]+[0-9]+)\)\+1, 99\),([A-Z]+)\$([0-9]+),([A-Z]+)\$(?:[0-9]+),([A-Z]+[0-9]+),([A-Z]+[0-9]+),([A-Z]+[0-9]+)\), ""\)$/); // 
      // ["...", "J", "4", "N", "C4", "D4", "A", "2", "B", "E4", "G4", "H4']

      var type = worksheet[m[6]+m[7]].v+worksheet[m[8]+m[7]].v;      // Mininclusive
      var facet = type.toUpperCase();                                // MININCLUSIVE
      var nodeKind = worksheet[colToAddr(addrToCol(m[1])-6)+m[2]].v; // xsd:integer
      var argument = worksheet[colToAddr(addrToCol(m[1])-5)+m[2]].v; // DECIMAL
      var shexFeatures =
        [4, 3, 2].map(function (delta) {
          var contents = worksheet[colToAddr(addrToCol(m[1])-delta)+m[2]];
          return contents ? contents.v : "";
        }).join("");                                                 // intLeadTrail
      var testDT = worksheet[colToAddr(addrToCol(m[1])-1)+m[2]].v;   // xsd:integer
      var shexProfile = shexProfiles[argument] ||
        warn("undefined feature shexProfiles["+argument+"]", {}, shexFeatures);
      var shexRepresentation = shexProfile[shexFeatures] ||
        warn("undefined feature shexProfiles["+argument+"]["+shexFeatures+"]");
      var testProfile = dataProfiles[testDT] ||
        warn("undefined feature dataProfiles["+testDT+"]", {values: {}}, "label");
      // scan for enabled tests.
      for (var testColNo = addrToCol(m[1]);                          // 9..13
           testColNo <= addrToCol(m[3]);
           ++testColNo) {
        var testCol = colToAddr(testColNo);                          // J..N
        var passfail = worksheet[testCol + row];                     // {v: "pass"}
        if (passfail) {
          var testHeading = worksheet[testCol + headings].v;         // equalLead
          var testName = shex.v + "_" + passfail.v + "-" + testHeading; // 1integerMininclusiveDECIMALLeadTrail_pass-equalLead
          var typeRes = passfail.v !== "fail" ?
            [ "sht:ValidationTest", "    mf:result <" + testName + ".val>\n" ] :
            [ "sht:ValidationFailure", "" ];
          var testValue = testHeading in testProfile.values ?
            testProfile.values[testHeading] :           // 05
            warn("undefined feature dataProfiles["+testDT+"].values["+testHeading+"]");
          var suffix = testProfile.label+testValue;                  // INT05
          testList.push(testName);
          testDfns[testName] =
            "<#" + testName + "> a " + typeRes[0] + " ;\n" +
            "    mf:name \"" + testName + "\" ;\n" +
            "    rdfs:comment \"<S1> { <p1> "+nodeKind+" " + facet + " "+shexRepresentation+" } / { <s1> <p1> '"+testValue+"'^^"+testDT+" }\" ;\n" +
            "    mf:status mf:proposed ;\n" +
            "    mf:action [\n" +
            "      sht:schema <../schemas/" + shex.v + ".shex> ;\n" +
            "      sht:shape <http://a.example/S1> ;\n" +
            "      sht:data <Is1_Ip1_" + suffix + ".ttl> ;\n" +
            "      sht:focus <http://a.example/s1>\n" +
            "    ] ;\n" +
            typeRes[1] +
            "    .\n";
        }
      }//);
    }
  }
}


gen( "O", 6, 175, 3);
gen("AE", 6, 175, 3);

testList.forEach(function (test) {
  console.log(testDfns[test]);
});

// debugger;
// var c = addrToCol(args[1]);
// console.log(c);
// var a = colToAddr(c);
// console.log(a);
// process.exit(0);

function addrToCol (a) {
    return a.match(/^[A-Z]+/g)[0].
    split("").
    reduce(function (r, c, i, l) {
      return r + Math.pow(26, l.length - i - 1)*(c.charCodeAt(0) - "A".charCodeAt(0) + 1);
    }, -1); // 0-based column number
}

// JS double (IEE754) works up to 9007199254740991 (column BKTXHSOGHKKF)
function colToAddr (column) {
  ++column; // 1-based column-letters
  var ret = '';

  do {
    ret = String.fromCharCode(64 + // charCode of 'A'
                              (column % 26 || 26) // 1-based modulus in 1's digit
                              ) + ret; // Shift letters in at left
  } while ((column = Math.floor((column - 1) / 26)) > 0); // Chop off 1's digit.
    
  return ret
}

function extend(base) {
  if (!base) base = {};
  for (var i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
    for (var name in arg)
      base[name] = arg[name];
  return base;
}
