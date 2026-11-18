var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var parser = require("../src/weather-parser.js");
var fixture = fs.readFileSync(path.join(__dirname, "fixtures/hourly-forecast.html"), "utf8");
var fact = require("./fixtures/fact-cases.json").cases[0].fact;
var forecast = require("./fixtures/gauge-cases.json").forecastHtml;
var days = forecast.substring(forecast.indexOf('<div class="AppShortForecastDay_container'));

function page(hourly) {
    return "<script>" + JSON.stringify(JSON.stringify({ fact: fact })) + "</script>" + hourly + days;
}

var data = parser.parseYandex(page(fixture));
var solar = data.hours.filter(function (hour) { return hour.event; });
assert.strictEqual(data.hours.length, 46, "All available forecast cards are retained");
assert.deepStrictEqual(solar.map(function (hour) { return [hour.event, hour.time, hour.dateTime]; }), [
    ["sunrise", "08:05", "2026-11-04T05:05:00.000Z"],
    ["sunset", "17:18", "2026-11-04T14:18:00.000Z"],
    ["sunrise", "08:07", "2026-11-05T05:07:00.000Z"],
    ["sunset", "17:16", "2026-11-05T14:16:00.000Z"]
]);
assert.deepStrictEqual(parser.parseYandex(page(fixture + fixture)).hours, data.hours, "Repeated page layouts do not duplicate cards");
for (var i = 1; i < data.hours.length; i++) {
    assert.ok(data.hours[i].dateTime >= data.hours[i - 1].dateTime, "The timeline stays chronological across midnight");
}
solar.forEach(function (hour) {
    var index = data.hours.indexOf(hour);
    assert.ok(data.hours[index - 1].dateTime < hour.dateTime);
    assert.ok(data.hours[index + 1].dateTime > hour.dateTime);
});

var withoutSolar = fixture.replace(/<li\b[^>]*>[\s\S]*?<\/li>/g, function (block) {
    return /Восход|Закат/.test(block) ? "" : block;
});
var plain = parser.parseYandex(page(withoutSolar));
assert.deepStrictEqual(data.periods, plain.periods, "Sun events do not change day-part temperatures or icons");
assert.strictEqual(plain.hours.length, 42);
assert.ok(plain.hours.every(function (hour) { return !hour.event && typeof hour.temperature === "number"; }));
var onTheHour = fixture.replace(/2026-11-04T05:05:00.000Z/g, "2026-11-04T05:00:00.000Z").replace(/08:05/g, "08:00");
var matchingTime = parser.parseYandex(page(onTheHour)).hours.filter(function (hour) {
    return hour.dateTime === "2026-11-04T05:00:00.000Z";
});
assert.strictEqual(matchingTime.length, 2, "Weather and sunrise at the same instant both survive");
assert.strictEqual(matchingTime[1].event, "sunrise");

function gadget(stored, offline) {
    var nodes = {};
    var timeouts = {};
    var timeoutId = 0;
    var requests = 0;
    var now = Date.now();
    var intervals = {};
    var intervalId = 0;
    function FakeDate(value) { return new Date(value === undefined ? now : value); }
    function runTimeouts() {
        Object.keys(timeouts).forEach(function (id) {
            var timeout = timeouts[id];
            if (timeout && timeout.at <= now) {
                delete timeouts[id];
                timeout.callback();
            }
        });
    }
    function node(id) {
        if (!nodes[id]) {
            nodes[id] = { style: {}, parentNode: { style: {} }, innerText: "", innerHTML: "", title: "", disabled: false, setAttribute: function () {}, blur: function () {} };
        }
        return nodes[id];
    }
    node("background").removeObjects = function () {};
    node("background").addImageObject = function () { return {}; };
    function height(id) { return parseInt(node(id).style.height, 10) || 0; }
    node("metrics-heading").getBoundingClientRect = function () {
        return { left: 8, right: 508, top: 144, bottom: 144 + height("metrics-heading") };
    };
    node("hourly-heading").getBoundingClientRect = function () {
        var top = 144 + height("metrics-heading") + height("metrics");
        return { left: 8, right: 508, top: top, bottom: top + height("hourly-heading") };
    };
    function Request(progId) {
        assert.strictEqual(progId, "Msxml2.XMLHTTP.6.0");
        this.open = function () {};
        this.setRequestHeader = function () {};
        this.send = function () { requests++; this.status = offline ? 503 : 200; this.readyState = 4; };
        this.abort = function () {};
        this.responseText = page(fixture);
    }
    var context = {
        Date: FakeDate,
        document: { getElementById: node, body: { style: {} }, documentElement: { style: {} } },
        System: { Gadget: { Settings: {
            readString: function (key) { return stored[key] || ""; },
            writeString: function (key, value) { stored[key] = value; }
        } } },
        WeatherParticles: {},
        WeatherParser: parser,
        ActiveXObject: Request,
        setInterval: function (callback) { intervals[++intervalId] = callback; return intervalId; },
        clearInterval: function (id) { delete intervals[id]; },
        setTimeout: function (callback, delay) {
            timeouts[++timeoutId] = { callback: callback, at: now + delay };
            return timeoutId;
        },
        clearTimeout: function (id) { delete timeouts[id]; }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/weather-http.js"), "utf8"), context);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/gadget.js"), "utf8"), context);
    context.WeatherGadget.start();
    now += 30;
    runTimeouts();
    runIntervals();
    function runIntervals() {
        Object.keys(intervals).forEach(function (id) { if (intervals[id]) { intervals[id](); } });
    }
    return {
        node: node,
        body: context.document.body,
        requests: function () { return requests; },
        advance: function (milliseconds) {
            now += milliseconds;
            runTimeouts();
            runIntervals();
        }
    };
}

function visibleCards(app) {
    var cards = app.node("hourly").innerHTML.match(/<div class="hour-item\b[^>]*>[\s\S]*?<\/div>/g) || [];
    var offset = Math.round(-(parseFloat(app.node("hourly-track").style.left) || 0) / 62);
    return cards.slice(offset, offset + 8).join("");
}

function times(app) {
    var result = [];
    var pattern = /class="hour-time">([^<]+)<\/span>/g;
    var match;
    while ((match = pattern.exec(visibleCards(app)))) { result.push(match[1]); }
    return result;
}

var stored = {};
var app = gadget(stored, false);
var initial = times(app);
assert.deepStrictEqual(initial, ["06:00", "07:00", "08:00", "08:05", "09:00", "10:00", "11:00", "12:00"]);
assert.ok(/sunrise-icon/.test(visibleCards(app)));
assert.ok(/>Восход</.test(visibleCards(app)));
assert.strictEqual(app.node("hourly-prev").disabled, true);
assert.strictEqual(app.node("hourly-next").disabled, false);
var temperature = app.node("temperature").innerText;

app.node("hourly-next").onclick();
assert.strictEqual(app.node("hourly-track").style.left, "0px", "Navigation starts without a jump");
app.advance(110);
assert.strictEqual(app.node("hourly-track").style.left, "-124px", "The track moves through an intermediate position");
app.advance(110);
assert.deepStrictEqual(times(app), data.hours.slice(4, 12).map(function (hour) { return hour.time; }));
assert.strictEqual(app.node("hourly-prev").disabled, false);
app.node("hourly-prev").onclick();
app.advance(220);
assert.deepStrictEqual(times(app), initial);
app.node("hourly-prev").onclick();
assert.deepStrictEqual(times(app), initial, "Scrolling before the first card is clamped");
var wheel = { wheelDelta: -120 };
assert.strictEqual(app.node("hourly-section").onmousewheel(wheel), false);
assert.strictEqual(wheel.returnValue, false);
app.advance(220);
assert.strictEqual(times(app)[0], "07:00");
app.node("hourly-section").onmousewheel({ wheelDelta: 120 });
app.advance(220);
assert.deepStrictEqual(times(app), initial);

app.node("hourly-next").onclick();
app.advance(70);
var intermediate = app.node("hourly-track").style.left;
app.node("hourly-next").onclick();
assert.strictEqual(app.node("hourly-track").style.left, intermediate, "Repeated clicks continue from the current position");
app.advance(110);
intermediate = app.node("hourly-track").style.left;
app.node("hourly-prev").onclick();
assert.strictEqual(app.node("hourly-track").style.left, intermediate, "Changing direction does not jump");
app.advance(220);
assert.deepStrictEqual(times(app), data.hours.slice(4, 12).map(function (hour) { return hour.time; }));
app.node("hourly-prev").onclick();
app.advance(220);
assert.deepStrictEqual(times(app), initial);

var seenSunset = false;
for (var step = 0; step < 20; step++) {
    app.node("hourly-next").onclick();
    app.advance(220);
    seenSunset = seenSunset || /sunset-icon/.test(visibleCards(app));
    assert.strictEqual(times(app).length, 8);
}
assert.ok(seenSunset, "Sunset remains visible while browsing later hours");
assert.deepStrictEqual(times(app), data.hours.slice(-8).map(function (hour) { return hour.time; }));
assert.strictEqual(app.node("hourly-next").disabled, true);
for (step = 0; step < 20; step++) { app.node("hourly-prev").onclick(); app.advance(220); }
assert.deepStrictEqual(times(app), initial);
assert.strictEqual(app.node("temperature").innerText, temperature);
assert.strictEqual(app.requests(), 1, "Scrolling uses the loaded forecast without network requests");

var compact = JSON.stringify(require("./read-stored-forecast")(stored, "cache_54.44190663514991_30.41421211633299"));
assert.ok(compact && compact.length < 2000, "The forecast still fits the gadget cache");
var cached = gadget(stored, true);
assert.deepStrictEqual(times(cached), initial);
assert.ok(/sunrise-icon/.test(visibleCards(cached)));
assert.strictEqual(cached.node("hourly-next").disabled, true);
assert.deepStrictEqual(times(gadget({ cache: compact }, true)), initial, "Existing installations can read the original cache");
var empty = gadget({}, true);
assert.deepStrictEqual(times(empty), []);
assert.strictEqual(empty.node("hourly-prev").disabled, true);
assert.strictEqual(empty.node("hourly-next").disabled, true);

app.node("hourly-next").onclick();
app.advance(220);
var scrolled = times(app);
app.node("metrics-toggle").onclick();
app.advance(90);
var partialMetrics = parseInt(app.node("metrics").style.height, 10);
assert.ok(partialMetrics > 0 && partialMetrics < 42);
assert.strictEqual(app.node("hourly-body").style.height, "81px");
app.advance(220);
assert.strictEqual(app.node("metrics").style.display, "none");
assert.strictEqual(app.node("background").style.height, "318px");
assert.strictEqual(app.node("card").style.height, "268px");
assert.deepStrictEqual(times(app), scrolled);
assert.strictEqual(stored.openSections, "2");
var hourlyOnly = gadget(stored, true);
assert.strictEqual(hourlyOnly.node("metrics").style.display, "none");
assert.strictEqual(hourlyOnly.node("hourly-body").style.display, "");

app.node("hourly-toggle").onclick();
app.advance(240);
assert.strictEqual(app.node("hourly-body").style.display, "none");
var hiddenWheel = { wheelDelta: 120 };
assert.strictEqual(app.node("hourly-section").onmousewheel(hiddenWheel), undefined);
assert.strictEqual(hiddenWheel.returnValue, undefined);
app.node("metrics-toggle").onclick();
app.advance(90);
var reopeningMetrics = app.node("metrics").style.height;
app.node("metrics-toggle").onclick();
assert.strictEqual(app.node("metrics").style.height, reopeningMetrics);
app.advance(220);
assert.strictEqual(app.node("metrics").style.display, "none");
app.node("metrics-toggle").onclick();
app.advance(220);
assert.strictEqual(app.node("metrics").style.display, "");
assert.strictEqual(app.node("hourly-body").style.display, "none");
app.node("hourly-toggle").onclick();
app.advance(240);
assert.deepStrictEqual(times(app), scrolled);
assert.strictEqual(app.node("card").style.height, "310px");

var legacy = gadget({ sectionLevel: "1" }, true);
assert.strictEqual(legacy.node("metrics").style.display, "");
assert.strictEqual(legacy.node("hourly-body").style.display, "none");

var hidden = gadget({ openSections: "2" }, true);
assert.strictEqual(hidden.node("metrics-heading").style.height, "17px");
hidden.advance(1980);
hidden.advance(220);
assert.strictEqual(hidden.node("metrics-heading").style.height, "0px");
assert.strictEqual(hidden.node("hourly-heading").style.height, "27px");
assert.strictEqual(hidden.node("card").style.height, "251px");

hidden.body.onmousemove({ clientX: 50, clientY: 141 });
hidden.advance(220);
assert.strictEqual(hidden.node("metrics-heading").style.height, "17px");
hidden.advance(3000);
assert.strictEqual(hidden.node("metrics-heading").style.height, "17px");
hidden.body.onmouseleave();
hidden.advance(2000);
hidden.advance(220);
assert.strictEqual(hidden.node("metrics-heading").style.height, "0px");

hidden.node("hourly-toggle").onclick();
hidden.advance(240);
assert.strictEqual(hidden.node("hourly-heading").style.height, "27px");
hidden.advance(1900);
hidden.advance(220);
assert.strictEqual(hidden.node("card").style.height, "150px");
assert.strictEqual(hidden.node("hourly-heading").style.height, "0px");
hidden.body.onmousemove({ clientX: 50, clientY: 145 });
hidden.advance(220);
assert.strictEqual(hidden.node("hourly-heading").style.height, "27px");
assert.strictEqual(hidden.node("metrics-heading").style.height, "17px");
hidden.body.onmousemove({ clientX: 50, clientY: 50 });
hidden.advance(2000);
hidden.advance(220);
assert.strictEqual(hidden.node("card").style.height, "150px");
hidden.node("hourly-toggle").onfocus();
hidden.advance(220);
assert.strictEqual(hidden.node("hourly-heading").style.height, "27px");

console.log("hourly forecast: events, scrolling, cache, independent sections and auto-hide OK");
