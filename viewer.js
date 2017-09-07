(function () {
  if (location.search.substr(1) === "toy") // some examples from validation/manifest.jsonld
    renderManifest(aFewTests(), "validation/");
  else
    $.getJSON(location.search.substr(1) + "/manifest.jsonld", function(data) {
      renderManifest(data["@graph"][0].entries, location.search.substr(1) + "/");
    });

  $("#tests").colResizable({ fixed:false, liveDrag:true, gripInnerHtml:"<div class='grip2'></div>", 
 });
  let droparea = $("#droparea");
  let type = droparea.find("input");
  let data = droparea.find("textarea");
  droparea.on("drop", evt => {
    evt.preventDefault();
    droparea.removeClass("droppable");
    let xfer = evt.originalEvent.dataTransfer;
    console.dir(xfer.files.length);
    [ "files", "application/json", "text/uri-list", "text/plain"
    ].find(l => {
      if (l.indexOf("/") === -1) {
        if (xfer[l].length > 0) {
          type.val(l);
          data.text(JSON.stringify(xfer[l]));
          readfiles(xfer[l], data);
          return true;
        }
      } else {
        if (xfer.getData(l)) {
          type.val(l);
          data.text(xfer.getData(l));
          return true;
        }
      }
      return false;
    });
  }).on("dragenter", () => {
    droparea.addClass("droppable");
  }).on("dragleave", () => {
    droparea.removeClass("droppable");
  }).on("dragover", function (evt) {
    evt.preventDefault();
  });

  /* progressively render the tests, adjusting relative URLs by relPrepend.
   */
  function renderManifest (tests, relPrepend) {
    let testNo = 0;
    // assumes at least one test entry
    queue();
    function queue () {
      renderTest(tests[testNo]);
      if (++testNo < tests.length)
        setTimeout(queue, 0);
    }
    // tests.forEach(renderTest);
    function renderTest (test) {
      const stati = [ { str: "fails" , chr: "✗" }, { str: "passes", chr: "✓"} ];
      let statum = stati[0 + (test["@type"] === "sht:ValidationTest")];
      let titleText = "#" + (testNo+1) + " " + statum.str;

      let status = drag("td", { title: titleText, class: statum.str }, statum.chr, showTest, "application/json");      
      let shexc = link(test.action.schema);
      let data = link(test.action.data);

      // Change .schema and .data to absolute URLs.
      test.action.schema = shexc.prop("href");
      test.action.data = data.prop("href");
      let name = drag("td", { title: test.comment }, test["@id"], showTest, "application/json");
      let shapemap = makeShapeMap(test.action);
      $("table tbody").append(
        $("<tr/>").append(
          status, name, $("<td/>").append(shexc), $("<td/>").append(data), shapemap
        ));

      function showTest (elt) {
        return JSON.stringify(test, null, 2);
      }

      function ttl (ld) {
        return typeof ld === "object" ? lit(ld) :
          ld.startsWith("_:") ? ld :
          "<" + ld + ">";
        function lit (o) {
          let ret = o["@value"];
          if ("@type" in o)
            ret += "^^<" + o["@type"] + ">";
          if ("language" in o)
            ret += "@" + o["language"];
          return ret;
        }
      }

      function drag (name, attrs, text, val, type) {
        return $("<"+name+"/>", attrs).attr("draggable", true).text(text).
          on("dragstart", (evt) => {
            evt.originalEvent.dataTransfer.setData(type, val(evt.target));
          });
      }

      function link (rel) {
        return title(drag("a", { href: relPrepend + rel }, rel, elt => {
          return elt.href;
        }, "text/uri-list"));
      }

      function title (anchor) {
        $.ajax({
          url: anchor.get(0).href,
          dataType: 'text',
          type: 'GET',
          async: true,
          statusCode: {
            404: function (response) {
              alert(JSON.stringify([404, response]));
            }
          },
        }).then(function (data) {
          anchor.attr("title", data);
        }).fail(function (jqXHR, status, errorThrown) {
          alert(JSON.stringify([jqXHR, status, errorThrown]));
        });
        return anchor;
      }


      function makeShapeMap (action) {
        if ("map" in action) {
          var anchor = drag("a", { href: relPrepend + action.map }, action.map, elt => {
            return elt.href;
          }, "text/uri-list");
          return $("<td/>").append(title(anchor));
        }
        return drag("td", { }, ttl(action.focus) + "@" + ("shape" in action ? ttl(action.shape) : "START"), elt => {
          return elt.innerText;
        }, "text/plain")
      }
    };
  }

  function readfiles(files, target) {
    var formData = new FormData();
    for (var i = 0; i < files.length; i++) {
      var file = files[i], name = file.name;
      formData.append("file", file);
      var reader = new FileReader();
      reader.onload = (function (target) {
        return function (event) {
          target.text(event.target.result);
        };
      })(target);
      reader.readAsText(file);
    }
  }

  function aFewTests () {
    return [
      {
        "@id": "#0_otherbnode",
        "@type": "sht:ValidationTest",
        "action": {
          "schema": "../schemas/0.shex",
          "shape": "http://a.example/S1",
          "data": "Babcd_Ip1_Io1.ttl",
          "focus": "_:abcd"
        },
        "extensionResults": [],
        "name": "0_otherbnode",
        "trait": [
          "ToldBNode",
          "Empty"
        ],
        "comment": "<S1> {  } on { _:abcd <p1> <o1> }",
        "status": "mf:proposed"
      },
      {
        "@id": "#3groupdot3Extra_pass-iri1",
        "@type": "sht:ValidationTest",
        "action": {
          "schema": "../schemas/3groupdot3Extra.shex",
          "shape": "http://a.example/S1",
          "data": "Is_Ipn_IonX3.ttl",
          "focus": "http://a.example/s"
        },
        "extensionResults": [],
        "name": "3groupdot3Extra_pass-iri1",
        "trait": [
          "Extra",
          "IriEquivalence",
          "EachOf"
        ],
        "comment": "<S> EXTRA <p1> EXTRA <p2> EXTRA <p3> { <p1> [<o1>], <p2> [<o2>], <p3> [<o3>] } on { <s> <p1> <o1>; <p2> <o2>; <p3> <o3> }",
        "status": "mf:proposed"
      },
      {
        "@id": "#3circRefS1-IS2-IS3-IS3",
        "@type": "sht:ValidationTest",
        "action": {
          "schema": "../schemas/3circRefS1-IS2-IS3-IS3.shex",
          "shape": "http://a.example/S1",
          "data": "3circRefPlus1_pass-open.ttl",
          "focus": "http://a.example/n1"
        },
        "extensionResults": [],
        "name": "3circRefS1-IS2-IS3-IS3",
        "trait": [
          "Import"
        ],
        "comment": "I2 I3 <S1> { <p1> ., <p2> @<S2>? } | I3 <S2> { <p3> @<S3> } | <S3> { <p4> @<S1> } on { <n1> <p1> \"X\" ; <p2> <n2> . <n2> <p3> <n3> . <n3> <p4> <n5> . <n5> <p1> \"X\" }",
        "status": "mf:proposed",
        "result": "3circRefPlus1_pass-open.val"
      },
      {
        "@id": "#focusdatatype_pass",
        "@type": "sht:ValidationTest",
        "action": {
          "schema": "../schemas/focusdatatype.shex",
          "shape": "http://a.example/S1",
          "data": "Is1_Ip1_LabDTbloodType.ttl",
          "focus": {
            "@value": "ab",
            "@type": "http://a.example/bloodType"
          }
        },
        "extensionResults": [],
        "name": "focusdatatype_pass",
        "trait": [
          "FocusConstraint"
        ],
        "comment": "<S> <dt1> on { <s1> <p1> 'ab'^^my:bloodType }",
        "status": "mf:proposed"
      },
      {
        "@id": "#dependent_shape",
        "@type": "sht:ValidationTest",
        "action": {
          "schema": "../schemas/dependent_shape.shex",
          "data": "dependent_shape.ttl",
          "map": "dependent_shape_map.json"
        },
        "extensionResults": [],
        "name": "dependent_shape",
        "trait": [
          "ShapeMap"
        ],
        "comment": "<S1> {<p1> @<S2>} <S2> {<p2> [<s3>]} on { <s1> <p1> <s2> . <s2> <p2> <s3> .}",
        "status": "mf:proposed",
        "result": "dependent_shape_results.json"
      },
    ];
  }
})();

