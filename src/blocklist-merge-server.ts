/// <reference path="d.ts/DefinitelyTyped/node/node.d.ts" />
/// <reference path="d.ts/DefinitelyTyped/async/async.d.ts" />

// Import core modules.
import stream = module("stream");
import http = module("http");
import zlib = module("zlib");
import url = module("url");
import fs = module("fs");

// Import nodejs external modules.
var async = <Async>require("async");

// Represents an asynchronous HTTP request.
class AsyncHTTPRequestTask
{
    private _error: Error;                      // Error object, if any.
    private _total: number;                     // Total number of bytes to receive.
    private _result: string;                    // Result data, if any.
    private _progress: number;                  // Current progress.
    private _isSuccess: bool;                   // Has the task completed successfully?
    private _requestUrl: string;                // The request url.

    //=======================================================================
    //     Properties
    //=======================================================================

    // Gets the error object, if any.
    public get Error(): Error { return this._error; }
    // Gets the total number of bytes to receive.
    public get Total(): number { return this._total; }
    // Gets the HTTP result data, if any.
    public get Result(): string { return this._result; }
    // Gets the current number of bytes received.
    public get Progress(): number { return this._progress; }
    // Gets whether the task has completed successfully.
    public get IsSuccess(): bool { return this._isSuccess; }
    // Gets the request url string.
    public get RequestUrl(): string { return this._requestUrl; }

    //=======================================================================
    //     Constructors
    //=======================================================================

    // Constructor.
    constructor(requestUrl: string)
    {
        this._total = 0;
        this._error = null;
        this._result = null;
        this._progress = 0;
        this._isSuccess = false;
        this._requestUrl = requestUrl;
    }

    //=======================================================================
    //     Methods
    //=======================================================================

    // Returns a task to pass async.* functions.
    public GetAsyncTask()
    {
        // Anonymous function closure for callback.
        var This = this;
        return (cllbck: AsyncCallback) =>
        {
            This.InternalExecute(cllbck);
        };
    }

    //=======================================================================
    //     Non Public
    //=======================================================================

    // Executes the task asynchronously.
    private InternalExecute(callback: AsyncCallback)
    {
        // For closure of callbacks.
        var This = this;

        // Do the HTTP get.
        AsyncHTTPRequestTask.InternalHttpGet(this._requestUrl,
            (response: http.ClientResponse, responseUrl: url.Url) =>
            {
                //console.log(response.headers);

                // Get encoding.
                var encoding = response.headers['content-encoding'];
                if (!encoding && /\.gz(ip)?$/i.test(responseUrl.pathname))
                    encoding = "gzip";
                //console.log(encoding);

                // Unzip content if necessary.
                var output = <stream.ReadableStream>null;
                switch (encoding)
                {
                    case 'gzip':
                        var gzip = (<any>zlib).createGunzip();
                        response.pipe(gzip);
                        output = gzip;
                        break;
                    case 'deflate':
                        var inflate = (<any>zlib).createInflate();
                        response.pipe(inflate);
                        output = inflate;
                        break;
                    default:
                        output = response;
                        break;
                }

                // Prepare for download.
                This._result = "";
                This._total = parseInt(response.headers["content-length"]);
                This._progress = 0;

                // Register "data" event.
                output.on("data", function (chunk: any)
                {
                    // Add data that was read.
                    This._progress += chunk.length;
                    This._result += chunk.toString("utf-8");
                });

                // Register "end" event.
                output.on("end", function ()
                {
                    // We have successfully downloaded all the content.
                    This._isSuccess = true;
                    callback(null, This);
                });

                // Register "close" event.
                output.on("close", function ()
                {
                    // Error if it occurs before "end" event.
                    if (!This._isSuccess)
                    {
                        // Notify.
                        This._error = new Error("the underlying connection was terminated before all data was sent");
                        callback(null, This);
                    }
                });
            },
            (error: Error) =>
            {
                // Notify error.
                This._isSuccess = false;
                This._error = error;
                callback(null, This);
            });
    }

    // Does a direct HTTP GET at specified url by following any redirection (warning: redirection loops will cause a stack overflow).
    private static InternalHttpGet(requestUrl: string, success: (response: http.ClientResponse, responseUrl: url.Url) => void , error: (error: Error) => void )
    {
        //console.log("HTTP GET %s", requestUrl);

        // Parse the request url.
        var parsedRequestUrl = url.parse(requestUrl);

        // Build HTTP request options by accepting encodings that blocklist providers use.
        var options = <any>parsedRequestUrl;
        options.headers =
        {
            'accept': '*/*',
            'accept-encoding': 'gzip,deflate',
            'accept-charset': 'utf-8'
        };

        // Do the HTTP GET.
        var request = http.get(options, function (response: http.ClientResponse) =>
        {
            //console.log("HTTP %d %s", response.statusCode, requestUrl);

            // If it's a redirection...
            if (response.statusCode > 300 && response.statusCode < 400 && response.headers.location)
            {
                // Parse redirection url.
                var parsedRedirectUrl = url.parse(response.headers.location);

                // Set hostname if it's a relative redirection.
                if (!parsedRedirectUrl.hostname)
                    parsedRedirectUrl.hostname = parsedRequestUrl.hostname;

                // Follow redirection.
                InternalHttpGet(url.format(parsedRedirectUrl), success, error);
            }
                // If it's a 200 OK...
            else if (response.statusCode == 200)
            {
                // Call success callback.
                success(response, parsedRequestUrl);
            }
            else
            {
                // Call error callback.
                error(new Error("HTTP request failed with " + response.statusCode + " response code"));
            }
        });

        // Register "error" event.
        request.on("error", error);
    }
}

// Represents a class for an HTTP server that merges a set of blocklists on request.
export class MergedBlocklistServer
{
    //=======================================================================
    //     Methods
    //=======================================================================

    // Starts the server on specified port.
    public Listen(hostname: string, port: number)
    {
        var This = this;

        // Create HTTP server.
        var server = http.createServer((request: http.ServerRequest, response: http.ServerResponse) =>
        {
            // Process the request.
            This.ProcessRequest(request, response);
        });

        // Listen.
        server.listen(port, hostname);
    }

    //=======================================================================
    //     Non Public
    //=======================================================================

    // Processes specified request.
    private ProcessRequest(request: http.ServerRequest, response: http.ServerResponse)
    {
        // Log it.
        console.info("Got HTTP request for %s", request.url);

        // Parse request url.
        var requestUrl = url.parse(request.url);
        if (requestUrl.pathname && !requestUrl.query && requestUrl.pathname != '/')
        {
            // Build local file path.
            var listFilePath = __dirname + "/../lists" + requestUrl.pathname;

            // Make sure it exists.
            if (!fs.existsSync(listFilePath))
            {
                // Respond with 404.
                response.writeHead(404,
                {
                    "Content-Type": "text/plain"
                });
                response.end("404 Not Found\nSpecified file could not be found: " + listFilePath + "\n");
                return;
            }

            // Read file content.
            var listText = fs.readFileSync(listFilePath, "utf-8");
            if (listText.charAt(0) === '\uFEFF') listText = listText.substr(1);

            // Split into lines, ignore empty lines and lines starting with #.
            var listUrls = listText.split("\n").map((value: string) => value.trim()).filter((value: string) => !value.match(/^#.*$/) && !value.match(/^\w*$/));

            // Write OK.
            response.writeHead(200, {
                "Content-Type": "text/plain",
                "Content-Encoding": "utf-8"
            });

            // Merge them asynchronously.
            MergedBlocklistServer.MergeListsAsync(listUrls, (mergedData: string, failedUrls: string[]) =>
            {
                // Log failures.
                for (var i = 0; i < failedUrls.length; i++)
                    console.error("ERROR: could not fetch data from %s", failedUrls[i]);

                // Write result.
                response.end(mergedData, "utf-8");
            });
        }
        else
        {
            // Respond with 404.
            response.writeHead(404, {
                "Content-Type": "text/plain"
            });
            response.end("404 Not Found\n");
        }
    }

    // Merges the lists downloaded from specified urls asynchronously.
    private static MergeListsAsync(listUrls: string[], completionCallback: (mergedData: string, failedUrls: string[]) => void )
    {
        var tasks = [];

        // Build the list of tasks.
        for (var i = 0; i < listUrls.length; i++)
            tasks.push(new AsyncHTTPRequestTask(listUrls[i] + "&fileformat=p2p&archiveformat=gz").GetAsyncTask());

        // Call asynchronously.
        async.parallel(tasks, (error: string, results: AsyncHTTPRequestTask[]) =>
        {
            var failedUrls = <string[]>[];
            var mergedResult = "";

            // Write failures as comments at the beginning of the file.
            for (var i = 0; i < results.length; i++)
                if (!results[i].IsSuccess)
                {
                    failedUrls.push(results[i].RequestUrl);
                    mergedResult += "# failed to load url: " + results[i].RequestUrl + "\n";
                }

            // Write data.
            for (var i = 0; i < results.length; i++)
                if (results[i].IsSuccess)
                {
                    mergedResult += "# list from " + results[i].RequestUrl + "\n";
                    mergedResult += results[i].Result + "\n";
                }

            // Call callback.
            completionCallback(mergedResult, failedUrls);
        });
    }
}

// Requires.
var argv = require('optimist').argv;

// Show help if necessary.
if (argv.h || argv.help)
{
    console.log([
		"usage: blocklist-merger-server [options]",
		"",
		"options:",
		"  --port [number]     Port to use (default is 1337)",
		"  --host [hostname]   Address to use (default is localhost)",
		"  --help              Print this list and exit.",
	].join('\n'));
	process.exit();
}

// Parse args.
var port = argv.port ? argv.port : (process.env.PORT ? process.env.PORT : 1337);
var host = argv.host ? argv.host : (process.env.IP ? process.env.IP : "localhost");

// Create the web server.
var server = new MergedBlocklistServer();
server.Listen(host, port);
console.log("Server is listening on %s:%d...", host, port);

if (process.platform !== 'win32')
{
	process.on('SIGINT', function ()
	{
		console.log("Server stopped.");
		process.exit();
	});
}
