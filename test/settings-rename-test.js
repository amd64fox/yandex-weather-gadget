var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
var parser = require("../src/weather-parser.js");

var stored = {
    locationCount: "2",
    location0Name: "Харьковка", location0Lat: "54.4419", location0Lon: "30.4142",
    location1Name: "Пески", location1Lat: "59.9386", location1Lon: "30.3141",
    activeLocation: "0"
};
var nodes = {};
var now = 0;
var timerId = 0;
var timers = {};
var requests = [];
var activeXCalls = 0;
var focused;
function node(id) {
    if (!nodes[id]) {
        nodes[id] = { checked: false, style: {}, focus: function () { focused = id; }, select: function () {} };
        var value = "";
        Object.defineProperty(nodes[id], "value", {
            get: function () { return value; },
            set: function (next) { value = String(next); }
        });
    }
    return nodes[id];
}
node("saved").options = [];
node("saved").add = function (item) { this.options.push(item); };
node("results").options = [];
node("results").add = function (item) { this.options.push(item); };
var gadget = { version: "2.4.1.7", Settings: {
    readString: function (key) { return stored[key] || ""; },
    writeString: function (key, value) { stored[key] = value; }
} };
var context = {
    document: { body: { className: "" }, getElementById: node, createElement: function () { return {}; } },
    System: { Gadget: gadget },
    WeatherParser: parser,
    ActiveXObject: function (progId) {
        activeXCalls++;
        assert.strictEqual(progId, "Msxml2.ServerXMLHTTP.6.0");
        this.headers = {};
        this.setRequestHeader = function (name, value) { this.headers[name] = value; };
        this.open = function (method, url, async) { this.url = url; assert.strictEqual(async, true); };
        this.send = function () { requests.push(this); };
        this.abort = function () { this.aborted = true; };
    },
    setTimeout: function (callback, delay) { return addTimer(callback, delay, false); },
    setInterval: function (callback, delay) { return addTimer(callback, delay, true); },
    clearTimeout: function (id) { delete timers[id]; },
    clearInterval: function (id) { delete timers[id]; }
};
function addTimer(callback, delay, repeating) {
    timers[++timerId] = { callback: callback, at: now + delay, delay: repeating ? delay : 0 };
    return timerId;
}
function advance(milliseconds) {
    now += milliseconds;
    Object.keys(timers).forEach(function (id) {
        var timer = timers[id];
        if (!timer || timer.at > now) { return; }
        if (timer.delay) { timer.at = now + timer.delay; }
        else { delete timers[id]; }
        timer.callback();
    });
}
vm.runInNewContext(fs.readFileSync("src/weather-http.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("src/settings.js", "utf8"), context);
context.SettingsPage.start();
assert.strictEqual(node("gadgetVersion").innerText, "Версия 2.4.1.7");
gadget.version = "1.0.0.0";
context.SettingsPage.start();
assert.strictEqual(node("gadgetVersion").innerText, "Версия 1.0.0");
node("placeName").value = "Дача";
node("units").value = "F";
var beforeAbout = JSON.stringify(stored);
node("openAbout").onclick();
assert.strictEqual(context.document.body.className, "show-about");
assert.strictEqual(focused, "backToSettings");
gadget.onSettingsClosing({ Action: { commit: 1 }, closeAction: 0 });
assert.strictEqual(JSON.stringify(stored), beforeAbout);
node("backToSettings").onclick();
assert.strictEqual(context.document.body.className, "");
assert.strictEqual(focused, "openAbout");
assert.strictEqual(node("placeName").value, "Дача");
assert.strictEqual(node("units").value, "F");
node("openAbout").onclick();
gadget.onSettingsClosing({ Action: { commit: 1 }, closeAction: 1 });
assert.strictEqual(stored.units, "F");
node("backToSettings").onclick();

node("saved").selectedIndex = 1;
node("edit").onclick();
assert.strictEqual(node("editName").value, "Пески");
assert.strictEqual(node("editCoords").value, "https://yandex.ru/pogoda/ru?lat=59.9386&lon=30.3141");
assert.strictEqual(node("editPanel").style.display, "block");
node("editName").value = "   ";
assert.strictEqual(node("saveEdit").onclick(), false);
node("editName").value = "Пески, Санкт-Петербург";
node("editCoords").value = "https://yandex.ru/pogoda/ru?lat=120&lon=30.31";
assert.strictEqual(node("saveEdit").onclick(), false);
assert.strictEqual(node("editPanel").style.display, "block");

var close = { Action: { commit: "commit" }, closeAction: "commit", cancel: false };
gadget.onSettingsClosing(close);
assert.strictEqual(close.cancel, true);
assert.strictEqual(stored.location1Name, "Пески");
node("cancelEdit").onclick();
node("edit").onclick();
assert.strictEqual(node("editName").value, "Пески");
node("editName").value = "Пески, Санкт-Петербург";
node("editCoords").value = "https://yandex.by/pogoda/ru?lon=30.3123&lat=59.9301#weather";
assert.strictEqual(node("saveEdit").onclick(), true);
assert.strictEqual(node("editPanel").style.display, "none");
assert.strictEqual(node("saved").options[1].text, "Пески, Санкт-Петербург");
gadget.onSettingsClosing(close);
assert.strictEqual(close.cancel, false);
assert.strictEqual(stored.location0Name, "Харьковка");
assert.strictEqual(stored.location1Name, "Пески, Санкт-Петербург");
assert.strictEqual(stored.location1Lat, "59.9301");
assert.strictEqual(stored.location1Lon, "30.3123");
assert.strictEqual(stored.activeLocation, "0");

node("saved").selectedIndex = 1;
node("edit").onclick();
assert.strictEqual(node("editCoords").value, "https://yandex.ru/pogoda/ru?lat=59.9301&lon=30.3123");
node("editCoords").value = "-12.5, 34.75";
node("editCoords").onkeydown({ keyCode: 13 });
gadget.onSettingsClosing(close);
assert.strictEqual(stored.location1Lat, "-12.5");
assert.strictEqual(stored.location1Lon, "34.75");

function typeCity(query) {
    node("city").value = query;
    node("city").onpropertychange({ propertyName: "value" });
    node("city").oninput();
}
function finishSearch(request, name, latitude, longitude) {
    request.status = 200;
    request.readyState = 4;
    request.responseText = JSON.stringify({ results: [{ name: name, latitude: latitude, longitude: longitude }] });
}
typeCity("Мо");
advance(350);
assert.strictEqual(requests.length, 0);
typeCity("Мос");
advance(349);
assert.strictEqual(requests.length, 0);
typeCity("Моск");
advance(350);
assert.strictEqual(requests.length, 1);
assert.strictEqual(requests[0].headers["Accept-Encoding"], "identity");
assert.ok(requests[0].url.indexOf(encodeURIComponent("Моск")) >= 0);
typeCity("Орша");
assert.strictEqual(requests[0].aborted, true);
finishSearch(requests[0], "Москва", 55.75, 37.62);
advance(350);
assert.strictEqual(node("results").options.length, 0);
finishSearch(requests[1], "Орша", 54.51, 30.43);
advance(75);
assert.strictEqual(node("results").options[0].text, "Орша");
node("results").selectedIndex = 0;
node("results").onchange();
assert.strictEqual(node("coords").value, "54.51, 30.43");
typeCity("Минск");
node("city").onkeydown({ keyCode: 13 });
assert.strictEqual(requests.length, 3);
advance(350);
assert.strictEqual(requests.length, 3);
typeCity("");
assert.strictEqual(requests[2].aborted, true);
assert.strictEqual(node("results").options.length, 0);
node("city").value = "москва";
node("search").onclick();
assert.strictEqual(requests[3].url, "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent("москва") + "&count=8&language=ru&format=json");
finishSearch(requests[3], "Москва", 55.75204, 37.61781);
advance(75);
assert.strictEqual(node("results").options[0].text, "Москва");
console.log("settings: editing places and automatic city search OK");

var callsBeforeAdd = activeXCalls;
node("coords").value = "55.75, 37.62";
node("placeName").value = "";
node("add").onclick();
assert.strictEqual(activeXCalls, callsBeforeAdd, "Adding unnamed coordinates must not open a connection");
assert.strictEqual(node("saved").options[2].text, "● Точка 55.750, 37.620");
gadget.onSettingsClosing(close);
assert.strictEqual(stored.location2AutoName, "true");
node("edit").onclick();
node("editName").value = "Дом";
node("saveEdit").onclick();
gadget.onSettingsClosing(close);
assert.strictEqual(stored.location2Name, "Дом");
assert.strictEqual(stored.location2AutoName, "false");
