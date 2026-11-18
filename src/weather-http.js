var WeatherHttp = (function () {
    function send(progId, url, timeoutMs, headers, complete) {
        var request = new ActiveXObject(progId);
        request.open("GET", url, true);
        for (var name in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, name)) {
                request.setRequestHeader(name, headers[name]);
            }
        }
        request.send();
        var timer = setInterval(function () {
            if (timer === null) { return; }
            var error = null;
            var response = "";
            try {
                if (request.readyState !== 4) { return; }
                if (request.status !== 200) { throw new Error("HTTP " + request.status); }
                response = request.responseText;
            } catch (failure) { error = failure; }
            stop();
            complete(error, response);
        }, 75);
        var deadline = setTimeout(function () {
            if (timer === null) { return; }
            abort();
            complete(new Error("Истекло время ожидания ответа"), "");
        }, timeoutMs);
        function stop() {
            clearInterval(timer);
            clearTimeout(deadline);
            timer = null;
        }
        function abort() {
            if (timer === null) { return; }
            stop();
            try { request.abort(); } catch (error) { }
        }
        return { abort: abort };
    }
    function get(url, timeoutMs, headers, complete) {
        // WinINet negotiates gzip and decodes the forecast response
        return send("Msxml2.XMLHTTP.6.0", url, timeoutMs, headers, complete);
    }
    function getUncompressed(url, timeoutMs, complete) {
        // WinINet advertises deflate even when identity is requested
        return send("Msxml2.ServerXMLHTTP.6.0", url, timeoutMs, { "Accept-Encoding": "identity" }, complete);
    }
    return { get: get, getUncompressed: getUncompressed };
}());
