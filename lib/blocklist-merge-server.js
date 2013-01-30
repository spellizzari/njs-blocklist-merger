
var http = require("http")
var zlib = require("zlib")
var url = require("url")
var fs = require("fs")
var exports;
(function (exports) {
    var async = require("async");
    var AsyncHTTPRequestTask = (function () {
        function AsyncHTTPRequestTask(requestUrl) {
            this._total = 0;
            this._error = null;
            this._result = null;
            this._progress = 0;
            this._isSuccess = false;
            this._requestUrl = requestUrl;
        }
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "Error", {
            get: function () {
                return this._error;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "Total", {
            get: function () {
                return this._total;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "Result", {
            get: function () {
                return this._result;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "Progress", {
            get: function () {
                return this._progress;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "IsSuccess", {
            get: function () {
                return this._isSuccess;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(AsyncHTTPRequestTask.prototype, "RequestUrl", {
            get: function () {
                return this._requestUrl;
            },
            enumerable: true,
            configurable: true
        });
        AsyncHTTPRequestTask.prototype.GetAsyncTask = function () {
            var This = this;
            return function (cllbck) {
                This.InternalExecute(cllbck);
            };
        };
        AsyncHTTPRequestTask.prototype.InternalExecute = function (callback) {
            var This = this;
            AsyncHTTPRequestTask.InternalHttpGet(this._requestUrl, function (response) {
                var output = null;
                switch(response.headers['content-encoding']) {
                    case 'gzip':
                        var gzip = zlib.createGunzip(undefined);
                        response.pipe(gzip);
                        output = gzip;
                        break;
                    case 'deflate':
                        var inflate = zlib.createInflate(undefined);
                        response.pipe(inflate);
                        output = inflate;
                        break;
                    default:
                        output = response;
                        break;
                }
                This._result = "";
                This._total = parseInt(response.headers["content-length"]);
                This._progress = 0;
                output.on("data", function (chunk) {
                    This._progress += chunk.length;
                    This._result += chunk.toString("utf-8");
                });
                output.on("end", function () {
                    This._isSuccess = true;
                    callback(null, This);
                });
                output.on("close", function () {
                    if(!This._isSuccess) {
                        This._error = new Error("the underlying connection was terminated before all data was sent");
                        callback(null, This);
                    }
                });
            }, function (error) {
                This._isSuccess = false;
                This._error = error;
                callback(null, This);
            });
        };
        AsyncHTTPRequestTask.InternalHttpGet = function InternalHttpGet(requestUrl, success, error) {
            var parsedRequestUrl = url.parse(requestUrl);
            var options = parsedRequestUrl;
            options.headers = {
                'Accept-Cncoding': 'gzip,deflate'
            };
            var request = http.get(options, function (response) {
                if(response.statusCode > 300 && response.statusCode < 400 && response.headers.location) {
                    var parsedRedirectUrl = url.parse(response.headers.location);
                    if(!parsedRedirectUrl.hostname) {
                        parsedRedirectUrl.hostname = parsedRequestUrl.hostname;
                    }
                    AsyncHTTPRequestTask.InternalHttpGet(url.format(parsedRedirectUrl), success, error);
                } else if(response.statusCode == 200) {
                    success(response);
                } else {
                    error(new Error("HTTP request failed with " + response.statusCode + " response code"));
                }
            });
            request.on("error", error);
        };
        return AsyncHTTPRequestTask;
    })();    
    var MergedBlocklistServer = (function () {
        function MergedBlocklistServer() { }
        MergedBlocklistServer.prototype.Listen = function (hostname, port) {
            var This = this;
            var server = http.createServer(function (request, response) {
                This.ProcessRequest(request, response);
            });
            server.listen(port, hostname);
        };
        MergedBlocklistServer.prototype.ProcessRequest = function (request, response) {
            console.info("Got HTTP request for %s", request.url);
            var requestUrl = url.parse(request.url);
            if(requestUrl.pathname && !requestUrl.query && requestUrl.pathname != '/') {
                var listFilePath = __dirname + "/../lists" + requestUrl.pathname;
                if(!fs.existsSync(listFilePath)) {
                    response.writeHead(404, {
                        "Content-Type": "text/plain"
                    });
                    response.end("404 Not Found\nSpecified file could not be found: " + listFilePath + "\n");
                    return;
                }
                var listText = fs.readFileSync(listFilePath, "utf-8");
                if(listText.charAt(0) === '\uFEFF') {
                    listText = listText.substr(1);
                }
                var listUrls = listText.split("\n").map(function (value) {
                    return value.trim();
                }).filter(function (value) {
                    return !value.match(/^#.*$/) && !value.match(/^\w*$/);
                });
                response.writeHead(200, {
                    "Content-Type": "text/plain",
                    "Content-Encoding": "utf-8"
                });
                MergedBlocklistServer.MergeListsAsync(listUrls, function (mergedData, failedUrls) {
                    for(var i = 0; i < failedUrls.length; i++) {
                        console.error("ERROR: could not fetch data from %s", failedUrls[i]);
                    }
                    response.end(mergedData, "utf-8");
                });
            } else {
                response.writeHead(404, {
                    "Content-Type": "text/plain"
                });
                response.end("404 Not Found\n");
            }
        };
        MergedBlocklistServer.MergeListsAsync = function MergeListsAsync(listUrls, completionCallback) {
            var tasks = [];
            for(var i = 0; i < listUrls.length; i++) {
                tasks.push(new AsyncHTTPRequestTask(listUrls[i] + "&fileformat=p2p&archiveformat=gz").GetAsyncTask());
            }
            async.parallel(tasks, function (error, results) {
                var failedUrls = [];
                var mergedResult = "";
                for(var i = 0; i < results.length; i++) {
                    if(!results[i].IsSuccess) {
                        failedUrls.push(results[i].RequestUrl);
                        mergedResult += "# failed to load url: " + results[i].RequestUrl + "\n";
                    }
                }
                for(var i = 0; i < results.length; i++) {
                    if(results[i].IsSuccess) {
                        mergedResult += "# list from " + results[i].RequestUrl + "\n";
                        mergedResult += results[i].Result + "\n";
                    }
                }
                completionCallback(mergedResult, failedUrls);
            });
        };
        return MergedBlocklistServer;
    })();
    exports.MergedBlocklistServer = MergedBlocklistServer;    
})(exports || (exports = {}));
//@ sourceMappingURL=blocklist-merge-server.js.map
