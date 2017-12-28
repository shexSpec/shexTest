= 16 non-unique validation comments =

- "<S> { <p1> [<v1>] } on { <s1> <p1> <v1> }"
- "<S1> { <p1> LITERAL PATTERN "^bc$" } on { <s1> <p1> "^bc$" }"
- ":S1 {:p1 .|:p2 .,:p3 .} / { :s1 :p1 "p1-0"; :p2 "p2-0"; :p3 "p3-0" . }"
- "<vc1> ... <vc3> ... <S> { <p1> @<vc1> AND @<vc2> OR @<vc3> } on { <s1> <p1> 'abcd' }"
- "<S> EXTRA <p1> CLOSED { <p1> . } on { <s1> <p1> <o1> }"
- "<S> EXTRA <p1> CLOSED { <p1> . } on { <s1> <p1> <o1>, <o2> }"
- "<S> EXTRA <p1> CLOSED { <p1> . } on { <s1> <p1> <o1>, <o2>; <p2> <o2> }"
- "<S> BNODE {  } on { }"
- "<S> <dt1> on {  }"
- "<S> [<v1> <v2> <v3>] AND IRI on {  }"
- "<S> [<v1> <v2> <v3>] OR <dt1> on {  }"
- "<Sext> EXTERNAL + <Sext> { <p2> . } on { <s1> <p1> <n2> . <n2> <p2> "X" }"
- "<S1> { <p1> [<o1>] } / { <s1> <p1> <o1> }"
- "<S> { :a .*, (:a .+ | :a .), :a . } / { <x> :a 1, 3 }"
- "<S1> {:a @<P>*, :a @<T>} / { <n> :a <pt1>,  <pt2>,  <p>,  <t> }"
- "<S2> {:a @<P>, :a @<T>*} / { <n> :a <pt1>,  <pt2>,  <p>,  <t> }"

```
c = data["@graph"][0].entries.reduce((acc, t) => { if (t.comment in acc) { acc[t.comment].push(t); } else { acc[t.comment] = [t]; } return acc; }, {})
d = Object.keys(c).filter(k => c[k].length > 1)
```

= What do we do with recursive structures like: =
```
<http://all.example/S1> {
  $<http://all.example/S1e> (
    &<http://all.example/S1e>;
    <http://all.example/p1> . ?)
}
```
```
{
  "@context": "https://shexspec.github.io/context.jsonld",
  "type": "Schema",
  "shapes": [
    {
      "id": "http://all.example/S1",
      "type": "Shape",
      "expression": {
        "id": "http://all.example/S1e",
        "type": "EachOf",
        "expressions": [
          "http://all.example/S1e",
          {
            "type": "TripleConstraint",
            "predicate": "http://all.example/p1",
            "min": 0,
            "max": 1
          }
        ]
      }
    }
  ]
}
```
```
BASE <http://all.example/>
PREFIX sx: <http://shex.io/ns/shex#>

[] a sx:Schema ;
  sx:shapes <S1> .

<S1> a sx:Shape ;
  sx:expression <S1e> .

<S1e> a sx:EachOf ;
  sx:expressions (
    <S1e>
    [ a sx:TripleConstraint ; sx:predicate <p1> ; sx:min 0 ; sx:max 1 ]
  ) .
```
