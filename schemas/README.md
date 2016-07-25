# ShEx Test Schemas

ShEx tests are organized to simplify testing and implementation reports by testing orthogonal features in separate tests.
Each test focuses on a minimal number of features.
Test schemas are pairs of a ShExC syntax and a ShExJ file.
Validation tests can be performed on either of these files.
ShExC syntax tests appear in the validation manifest in order to verify the parsed structure.

## Naming Convention

Test filenames attempt to capture the features of the test.
For instance, [1doubleMaxexclusiveDECIMALintLeadTrail](1doubleMaxexclusiveDECIMALintLeadTrail.shex) contains: `\<S1\> { \<p1\> xsd:double MAXEXCLUSIVE 05.00 }`.
The name tells us that the tested shape has:
* 1 triple constraint with a
* datatype of xsd:double
* a MAXEXCLUSIVE facet
* with an argument encoded as an xsd:decimal (e.g. 5.0)
* which is numerically equivalent to an integer (5)
* and has leading and trailing '0's ("05.00")

An RDF **term type** is represented as either:
* Turtle shorthand syntax: [https://www.w3.org/TR/turtle/#abbrev](numbers) ("decimal", "double", "integer") or [https://www.w3.org/TR/turtle/#h4_booleans](booleans) ("true", "false")
* Turtle typed literal: xsd:byte, xsd:decimal

When representing a supplied value, shorthand numbers are capitolized ("DECIMAL", "DOUBLE", "INTEGER").

#### NC - Node constraints

* **nodeKind**: IRI, BNODE
* **stringFacet** termType?: Length, MinLength, MaxLength, Pattern. -- `1decimalMaxexclusiveDECIMAL`
* **numericFacet**: {Min,Max}{In,Ex}clusive

#### TE - Triple expression operators

* **Each**: EachOf is represented by a semicolon in ShExC: `:S1 { :p1 .; :p2 . }`. EachOf is usually indicated with just a number as indicated by in "ₙdot" and "ₙNC" in filename components.
* **Some**: SomeOf is represented by a pipe in ShExC: `:S1 { :p1 .| :p2 . }`.

#### SE - Shape expression operators

* **AND**: ShapeExpr conjunctions are reprented by "AND" in ShExC: `@\<S1\> AND @\<S2\>`, e.g. [1dotRefAND3.shex](1dotRefAND3) in node constraints in both value constraints and focus constraints.

#### filename components
* Ref₍ₙ₎ - ₍ₙ₎references to labeled shapes
* ₙdot - ₙ properties with wildcard values -- `<S> { :p . }`
* ₙNC - ₙ properties with node constraints -- `<S> { :p . }` NC types are lower case.
* focusNC - Node constraint on the focus node -- `<S> IRI {  }`
* A - keyword for '''rdf:type''' -- `<S> { a . }`
* card₍ₘ,ₙ₎|Opt|Plus|Star - repetition
* datatype - a datatype constraint, usually `\<http://a.example/dt1\>`
* Annot - 

## Exploration of SomeOf and EachOf

The following tests cover 2-levels of combinatorics of SomeOf and EachOf constructs.
The column on the right includes the same tests with extra semicolons added wherever possible.

| bare				     | extra ';'s					|
| ---				     | ---						|
| 1dot				     | 1dotSemi						|
| \<S\> { :p1 . }		     | \<S\> { :p1 .; }					|
| 2dot				     | 2dotSemis					|
| \<S\> { :p1 .; :p2 . }	     | \<S\> { :p1 .; :p2 .; }				|
| 1dotOr1dot			     | 1dotSemiOr1dotSemi				|
| \<S\> { :p1 .\| :p2 . }	     | \<S\> { :p1 .;\| :p2 .; }			|
| 2dotOr1dot			     | 2dotSemiOr1dotSemi				|
| \<S\> { :p1 .; :p2 .\| :p3 . }     | \<S\> { :p1 .; :p2 .;\| :p3 .; }			|
| 1dotOr2dot			     | 1dotSemiOr2dotSemis				|
| \<S\> { :p1 .\| :p2 .; :p3 . }     | \<S\> { :p1 .;\| :p2 .; :p3 .; }			|
| open2dotclose			     | open2dotsemisclose				|
| \<S\> { (:p1 .; :p2 .) }	     | \<S\> { (:p1 .; :p2 .;); }			|
| open1dotOr1dotClose		     | open1dotSemiOr1dotSemicloseSemi			|
| \<S\> { (:p1 .\| :p2 .) }	     | \<S\> { (:p1 .;\| :p2 .;); }			|
| openopen1dotOr1dotclose1dotclose   | openopen1dotSemiOr1dotSemiclose1dotSemicloseSemi |
| \<S\> { ((:p1 .\| :p2 .); :p3 .) } | \<S\> { ((:p1 .;\| :p2 .;); :p3 .;); }		|
| open1dotopen1dotOr1dotcloseclose   | open1dotopen1dotSemiOr1dotSemicloseSemicloseSemi |
| \<S\> { (:p1 .; (:p2 .\| :p3 .)) } | \<S\> { (:p1 .; (:p2 .;\| :p3 .;);); }		|
| openopen2dotcloseOr1dotclose	     | openopen2dotSemiscloseOr1dotSemiclose		|
| \<S\> { ((:p1 .; :p2 .)\| :p3 .) } | \<S\> { ((:p1 .; :p2 .;);\| :p3 .;); }		|
| open1dotOropen2dotcloseclose	     | open1dotSemiOropen2dotSemiscloseclose		|
| \<S\> { (:p1 .\| (:p2 .; :p3 .)) } | \<S\> { (:p1 .;\| (:p2 .; :p3 .;);); }		|
| open2dotOr1dotclose		     | open2dotSemisOr1dotSemiclose			|
| \<S\> { (:p1 .; :p2 .\| :p3 .) }   | \<S\> { (:p1 .; :p2 .;\| :p3 .;); }		|
| open1dotOr2dotclose		     | open1dotSemiOr2dotsemisclose			|
| \<S\> { (:p1 .\| :p2 .; :p3 .) }   | \<S\> { (:p1 .;\| :p2 .; :p3 .;); }		|

