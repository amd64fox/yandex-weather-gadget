(function () {
    var boot = weatherBoot;
    weatherBoot = function () {
        var fs = new ActiveXObject("Scripting.FileSystemObject");
        var path = System.Gadget.path + "\\";
        var input = fs.OpenTextFile(path + "sample.json", 1, false, -1);
        var sample = JSON.parse(input.ReadAll());
        input.Close();
        var result = { sample: sample.id };
        var recorded = false;
        function report(error) {
            if (recorded) { return; }
            recorded = true;
            if (error) { result.error = error.message || String(error); }
            var part = path + sample.id + ".part";
            var file = fs.CreateTextFile(part, true, true);
            file.Write(JSON.stringify(result));
            file.Close();
            fs.MoveFile(part, path + sample.id + ".json");
        }
        // Keep the test window alive until the driver finishes the paint
        var closeTimer = setInterval(function () {
            if (fs.FileExists(path + sample.id + ".done")) {
                clearInterval(closeTimer);
                System.Gadget.close();
            }
        }, 100);
        setTimeout(function () { System.Gadget.close(); }, 65000);
        try {
            var settings = System.Gadget.Settings;
            settings.writeString("cache", "");
            settings.writeString("cache_" + sample.lat + "_" + sample.lon, "");
            settings.writeString("locationCount", "1");
            settings.writeString("activeLocation", "0");
            settings.writeString("location0Name", "Санкт-Петербург");
            settings.writeString("location0Lat", sample.lat);
            settings.writeString("location0Lon", sample.lon);
            settings.writeString("openSections", "3");
            var expected;
            var parse = WeatherParser.parseYandex;
            WeatherParser.parseYandex = function (html) { expected = parse(html); return expected; };
            var get = WeatherHttp.get;
            WeatherHttp.get = function (url, timeout, headers, complete) {
                return get(sample.relay || url, timeout, headers, function (error, html) {
                    result.received = new Date().getTime();
                    try {
                        complete(error, html);
                        if (error) { throw error; }
                        var track = document.getElementById("hourly-track");
                        var status = document.getElementById("status").innerText;
                        if (status || !expected || !track || !track.offsetWidth || !track.offsetHeight ||
                            track.children.length !== expected.hours.length || !track.children.length) {
                            throw new Error(status || "Incomplete forecast layout");
                        }
                        result.started = window.weatherBenchmarkSent;
                        result.layout = new Date().getTime();
                        result.temperature = document.getElementById("temperature").innerText;
                        result.cards = track.children.length;
                        result.updated = document.getElementById("updated-time").innerText;
                        if (!/\d/.test(result.temperature) || !/^\d\d:\d\d$/.test(result.updated)) {
                            throw new Error("Missing temperature or update time");
                        }
                        report();
                    } catch (failure) { report(failure); }
                });
            };
            boot();
        } catch (failure) { report(failure); }
    };
}());
