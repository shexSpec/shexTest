## Naming Convention

##### NC - Node constraints
* node kinds: IRI, BNODE
* string facets: Length, MinLength, MaxLength, Pattern 
* numeric facets: {Min,Max}{In,Ex}clusive

##### filename components
* Ref₍ₙ₎ - ₍ₙ₎references to labeled shapes
* ₙdot - ₙ properties with wildcard values -- `<S> { :p . }`
* ₙNC - ₙ properties with node constraints -- `<S> { :p . }` NC types are lower case.
* focusNC - Node constraint on the focus node -- `<S> IRI {  }`
* A - keyword for '''rdf:type''' -- `<S> { a . }`

## Exploration of SomeOf and EachOf

The following tests cover 2-levels of combinatorics of SomeOf and EachOf constructs.
The column on the right includes the same tests with extra semicolons added wherever possible.

| bare				   | extra ';'s					      |
| ---				   | ---					      |
| 1dot				   | 1dotSemi					      |
| <S> { :p1 . }			   | <S> { :p1 ., }				      |
| 2dot				   | 2dotSemis					      |
| <S> { :p1 ., :p2 . }		   | <S> { :p1 ., :p2 ., }			      |
| 1dotOr1dot			   | 1dotSemiOr1dotSemi				      |
| <S> { :p1 .\| :p2 . }		   | <S> { :p1 .,\| :p2 ., }			      |
| 2dotOr1dot			   | 2dotSemiOr1dotSemi				      |
| <S> { :p1 ., :p2 .\| :p3 . }	   | <S> { :p1 ., :p2 .,\| :p3 ., }		      |
| 1dotOr2dot			   | 1dotSemiOr2dotSemis			      |
| <S> { :p1 .\| :p2 ., :p3 . }	   | <S> { :p1 .,\| :p2 ., :p3 ., }		      |
| open2dotclose			   | open2dotsemisclose				      |
| <S> { (:p1 ., :p2 .) }	   | <S> { (:p1 ., :p2 .,), }			      |
| open1dotOr1dotClose		   | open1dotSemiOr1dotSemicloseSemi		      |
| <S> { (:p1 .\| :p2 .) }	   |  <S> { (:p1 .,\| :p2 .,), }		      |
| openopen1dotOr1dotclose1dotclose | openopen1dotSemiOr1dotSemiclose1dotSemicloseSemi |
| <S> { ((:p1 .\| :p2 .), :p3 .) } | <S> { ((:p1 .,\| :p2 .,), :p3 .,), }	      |
| open1dotopen1dotOr1dotcloseclose | open1dotopen1dotSemiOr1dotSemicloseSemicloseSemi |
| <S> { (:p1 ., (:p2 .\| :p3 .)) } | <S> { (:p1 ., (:p2 .,\| :p3 .,),), }	      |
| openopen2dotcloseOr1dotclose	   | openopen2dotSemiscloseOr1dotSemiclose	      |
| <S> { ((:p1 ., :p2 .)\| :p3 .) } | <S> { ((:p1 ., :p2 .,),\| :p3 .,), }	      |
| open1dotOropen2dotcloseclose	   | open1dotSemiOropen2dotSemiscloseclose	      |
| <S> { (:p1 .\| (:p2 ., :p3 .)) } | <S> { (:p1 .,\| (:p2 ., :p3 .,),), }	      |
| open2dotOr1dotclose		   | open2dotSemisOr1dotSemiclose		      |
| <S> { (:p1 ., :p2 .\| :p3 .) }   | <S> { (:p1 ., :p2 .,\| :p3 .,), }		      |
| open1dotOr2dotclose		   | open1dotSemiOr2dotsemisclose		      |
| <S> { (:p1 .\| :p2 ., :p3 .) }   | <S> { (:p1 .,\| :p2 ., :p3 .,), }		      |

