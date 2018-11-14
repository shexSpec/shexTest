## usage: make clean && GEM_HOME="$HOME/.gems" PATH=$PATH:~/.gems/bin make all

VER=2.1
TIME=time

all: $(VER)/index.html

clean:
	rm -f $(VER)/earl.jsonld $(VER)/earl.ttl $(VER)/index.html

$(VER)/earl.jsonld: #  --manifest ../../../shexTest/schemas/manifest.ttl
	earl-report --format json -o $(VER)/earl.jsonld $(VER)/*.ttl

$(VER)/earl.ttl: $(VER)/earl.jsonld
	earl-report --json --format ttl -o $(VER)/earl.ttl $(VER)/earl.jsonld

$(VER)/index.html: $(VER)/earl.jsonld template.haml
	earl-report --json --format html --template template.haml -o $(VER)/index.html $(VER)/earl.jsonld

