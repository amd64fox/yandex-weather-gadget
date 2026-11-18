var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
var parser = require("../src/weather-parser.js");

var now = Date.UTC(2026, 8, 24, 18, 0, 0);
var requests = 0;
var failNext = false;
var holdNext = false;
var sent = [];
var aborted = 0;
var intervals = [];
var timeouts = [];
var nodes = {};

function FakeDate(value) { return new Date(value === undefined ? now : value); }
function node(id) {
    if (!nodes[id]) {
        nodes[id] = { style: {}, parentNode: { style: {} }, innerText: "", innerHTML: "", title: "", setAttribute: function () {} };
    }
    return nodes[id];
}
node("background").removeObjects = function () {};
node("background").addImageObject = function () { return {}; };
function Request(progId) {
    assert.strictEqual(progId, "Msxml2.XMLHTTP.6.0");
    this.open = function (method, url, async) {
        assert.strictEqual(async, true);
        this.url = url;
    };
    this.setRequestHeader = function () {};
    this.send = function () {
        requests++;
        this.status = failNext ? 503 : 200;
        this.readyState = holdNext ? 1 : 4;
        failNext = false;
        holdNext = false;
        sent.push(this);
    };
    this.abort = function () { aborted++; };
    this.responseText = "weather";
}
function weather() {
    return {
        temperature: 10, feelsLike: 8, condition: "Ясно", outlook: "", iconIndex: 26,
        conditionCode: "CLEAR", wind: 1, windGust: 2, pressure: 740, humidity: 60,
        isNight: false, hours: [], periods: [], days: [], updatedAt: now
    };
}
var stored = { intervalMinutes: "30" };
var context = {
    Date: FakeDate,
    document: { getElementById: node, body: { style: {} }, documentElement: { style: {} } },
    System: { Gadget: { Settings: {
        readString: function (key) { return stored[key] || ""; },
        writeString: function (key, value) { stored[key] = value; }
    } } },
    WeatherParticles: {},
    WeatherParser: { parseYandex: weather, weatherUrl: parser.weatherUrl },
    ActiveXObject: Request,
    setInterval: function (callback, milliseconds) { intervals.push({ callback: callback, milliseconds: milliseconds }); return intervals.length; },
    clearInterval: function (id) { intervals[id - 1].cancelled = true; },
    setTimeout: function (callback, delay) {
        var timer = { callback: callback, at: now + delay };
        timeouts.push(timer);
        return timer;
    },
    clearTimeout: function (timer) { timer.cancelled = true; }
};
function flush() {
    var timers = timeouts;
    timeouts = [];
    timers.forEach(function (timer) {
        if (timer.cancelled) { return; }
        if (timer.at <= now + 30) { timer.callback(); }
        else { timeouts.push(timer); }
    });
    intervals.forEach(function (timer) {
        if (timer.milliseconds === 75 && !timer.cancelled) { timer.callback(); }
    });
}
function check() {
    heartbeat.callback();
    flush();
}

vm.runInNewContext(fs.readFileSync("src/weather-http.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("src/gadget.js", "utf8"), context);
context.WeatherGadget.start();
flush();
assert.strictEqual(requests, 1);
var heartbeat = intervals.filter(function (item) { return item.milliseconds === 1000; })[0];
assert.ok(heartbeat);

now += 40 * 60000;
check();
assert.strictEqual(requests, 2, "An overdue update runs on the next heartbeat");

now += 30 * 60000 - 1000;
check();
assert.strictEqual(requests, 2, "No update before the configured interval");
now += 1000;
failNext = true;
check();
assert.strictEqual(requests, 3, "Update runs after 30 minutes");
assert.strictEqual(node("status").innerText, "Данные устарели");
assert.strictEqual(node("status").title, "HTTP 503");

now += 2 * 60000 - 1000;
check();
assert.strictEqual(requests, 3, "Retry waits for its backoff");
now += 1000;
check();
assert.strictEqual(requests, 4, "Failed update retries after two minutes");
assert.strictEqual(node("status").innerText, "");

var action = { commit: "commit", cancel: "cancel" };
var gadget = context.System.Gadget;
gadget.onSettingsClosed({ Action: action, closeAction: action.cancel });
flush();
assert.strictEqual(requests, 4, "Cancel keeps the current forecast");
stored.units = "F";
gadget.onSettingsClosed({ Action: action, closeAction: action.commit });
flush();
assert.strictEqual(requests, 4, "Display changes keep the current forecast");
assert.strictEqual(node("temperature").innerText, "+50°");

now += 11000;
holdNext = true;
node("refresh").onclick();
flush();
assert.strictEqual(requests, 5);
var previous = sent[4];
stored.locationCount = "1";
stored.location0Name = "Новая точка";
stored.location0Lat = "55.7512";
stored.location0Lon = "37.6184";
gadget.onSettingsClosed({ Action: action, closeAction: action.commit });
flush();
assert.strictEqual(aborted, 1, "Moving the active location cancels its old request");
assert.strictEqual(requests, 6);
assert.strictEqual(sent[5].url, "https://yandex.ru/pogoda/ru?lat=55.7512&lon=37.6184");
assert.strictEqual(node("open-site").href, sent[5].url);
previous.readyState = 4;
flush();
assert.strictEqual(require("./read-stored-forecast")(stored, "cache_55.7512_37.6184").lat, 55.7512);
now += 11000;
holdNext = true;
node("refresh").onclick();
flush();
var late = sent[6];
now += 40000;
flush();
assert.strictEqual(aborted, 2, "A timed out request is aborted");
late.readyState = 4;
flush();
assert.strictEqual(node("status").innerText, "Данные устарели");
assert.strictEqual(node("status").title, "Истекло время ожидания ответа");
console.log("refresh timing, settings closure and changing location: OK");
