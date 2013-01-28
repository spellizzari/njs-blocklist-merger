njs-blocklist-merger
====================

An HTTP server written with NodeJS that downloads blocklists in p2p format and merges them on demand.

Introduction
------------

Many network-related programs support blocking ranges of IP addresses from a text file that is periodically downloaded from a web server. Unfortunately, there are scenarios in which the desired IP ranges come from separated sources on the Internet, and some programs only allow for one source url to update their IP ranges.

njs-blocklist-merger is an HTTP server that can download multiple IP range files in p2p format (see http://sourceforge.net/p/peerguardian/wiki/dev-blocklist-format-p2p/) from the web simultaneously and merge them on demand. It is meant to be run locally (eg. on http://localhost:1337/) so that programs requiring a unique IP blocklist can query it to download IP ranges from many sources.

Sets of blocklist sources are arranged in text files and placed in a local folder. Then, njs-blocklist-merger will serve a merged version of all the blocklists in a given file when requested.

How it works
------------

njs-blocklist-merger is a NodeJS script that setups an HTTP server listening on a configured port number and waiting for requests in the form http://host:port/listname. Then it looks for a file named _listname_ in local folder _./lists/_. 

Each file in this folder must be encoded in UTF-8 and contains a list of urls specifying where to download the blocklists to merge. Empty lines and lines starting with # are ignored by njs-blocklist-merger.

After such file is parsed, njs-blocklist-merger downloads specified blocklists in parallel. Each downloaded blocklist must be in p2p format, encoded in UTF-8 and served either in plain text or gzip format. When all requested data is available, njs-blocklist-merger merges them and responds to the HTTP request with a blocklist in p2p format encoded in UTF-8 and served in plain text with MIME type text/plain.

Installation
------------

You must have NodeJS and NPM on your system (see http://nodejs.org/ and https://npmjs.org/). Then execute the following command:

````````
npm install njs-blocklist-merger -g
````````

Usage
-----

Place list files inside the _lists_ folder in the format specified above. Then run the server by executing the command:
````````
blocklist-merge-server --host localhost --port 1337
````````

You can customize the host and port numbers. Defaults are _localhost_ and _1337_.

When the server is up, any program can then request http://localhost:1337/mylist to download a merged version of the blocklists specified in file _./lists/mylist_.

Kown bugs and limitations
-------------------------

* Exceptions need to be handled in some parts of the code to keep the server alive through some kinds of failures like problems accessing local list files.
* HTTP redirections are handled when downloading blocklists from the Internet, but the server is not protected from looping redirections (will cause a stack overflow).
* Blocklist files are downloaded in parallel but the server waits for each request to complete before it merges the content and responds.
* When the HTTP server responds, it does not provide the Content-Length header field so client programs will not be able to display progress as they download the merged blocklist from it.

Development
-----------

njs-blocklist-merger is written in TypeScript (see http://www.typescriptlang.org/). You need it installed to be able to compile _./src/server.ts_:

1. Install TypeScript on your system (see http://www.typescriptlang.org/) as a global module:
````````
npm install typescript -g
````````
2. Install TypeScript Definitions (TSD, see http://www.tsdpm.com/) as a global module:
````````
npm install tsd -g
````````
3. Download definitions for _node_ and _async_ with the following command:
````````
cd ./src/
tsd install node async
````````
4. You can then compile njs-blocklist-merger with the following command line in its folder:
````
npm run-script build
````
or this command:
````
tsc --target ES5 --out ./lib/blocklist-merge-server.js ./src/blocklist-merge-server.ts
````

