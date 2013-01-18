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

njs-blocklist-merger is a NodeJS script that setups an HTTP server listening on a configured port number and wait for GET requests in the form http://host:port/listname. Then it looks for a file named _listname_ in local folder _./lists/_. Each file in this folder must be encoded in UTF-8 and contains a list of urls specifying where to download the blocklists to merge. Empty lines and lines starting with # are ignored by njs-blocklist-merger. After such file is parsed, njs-blocklist-merger downloads specified blocklists in parallel. Each downloaded blocklist must be in p2p format, encoded in UTF-8 and served either in plain text or gzip format. When all requested data is available, njs-blocklist-merger merges them and responds to the HTTP request with a blocklist in p2p format encoded in UTF-8 and served in plain text with MIME type text/plain.

Kown bugs and limitations
-------------------------

* Exceptions need to be handled in some parts of the code to keep the server live through some kinds of failures like problems accessing local list files, etc.
* HTTP redirections are handled when downloading blocklists from the Internet, but the server is not protected from looping redirections (will probably cause a stack overflow).
* Blocklist files are downloaded in parallel but the server waits for each request to complete before it merges the content and responds.
* When the HTTP server responds, it does not provide the Content-Length header field so client programs will not be able to display progress as they download the merged blocklist from it.

Installation
------------

1. Install NodeJS on your system (see http://nodejs.org/).
2. Install NPM on your system (see https://npmjs.org/).
3. Place _server.js_ in the folder of your choice.
4. Use NPM to install the _async_ module, either locally in the same folder as _server.js_, or globally (see https://github.com/caolan/async).
5. Create a folder alongside _server.js_ named _lists_.
6. Place list files inside the _lists_ folder in the format specified above.
7. Run the server by executing the command:

````````
node /path/to/folder/server.js host=localhost port=1337
````````

You can customize the host and port numbers.

Then, any program can then request http://localhost:1337/mylist to download a merged version of the blocklists specified in file _mylist_.

Development
-----------

njs-blocklist-merger is written in TypeScript (see http://www.typescriptlang.org/). You need it installed (eg. as a NodeJS module) to be able to compile server.ts.

You can compile njs-blocklist-merger with the following command line:
````
tsc --sourcemap --target ES5 server.ts
````
