test: Manifests ShExTests

Manifests: schemas/manifest.jsonld validation/manifest.jsonld negativeSyntax/manifest.jsonld negativeStructure/manifest.jsonld

schemas/manifest.jsonld: schemas/manifest.ttl
	cd schemas && make manifest.jsonld

validation/manifest.jsonld: validation/manifest.ttl
	cd validation && make manifest.jsonld

negativeSyntax/manifest.jsonld: negativeSyntax/manifest.ttl
	cd negativeSyntax && make manifest.jsonld

negativeStructure/manifest.jsonld: negativeStructure/manifest.ttl
	cd negativeStructure && make manifest.jsonld

ShExTests: ShExJTests ShExVTests

ShExJTests: doc/ShExJ.jsg
	(ls schemas/*.json | grep -vE '(coverage|representationTests)\.json' | xargs \
	 npx json-grammar doc/ShExJ.jsg)

# validation/*.val never existed in this repo (only *.err); the historical
# npm-bin bug masked that this line has always been dead
ShExVTests: doc/ShExV.jsg
	npx json-grammar doc/ShExV.jsg validation/*.err

