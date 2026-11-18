const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const parser = require("../src/weather-parser.js");
const readStoredForecast = require("./read-stored-forecast");

const firstKey = "cache_54.44_30.41";
const secondKey = "cache_59.93_30.31";
function places() {
    return { locationCount: "2", location0Lat: "54.44", location0Lon: "30.41", location0Name: "Харьковка",
        location1Lat: "59.93", location1Lon: "30.31", location1Name: "Петербург", activeLocation: "0" };
}
function openGadget(stored) {
    let now = Date.UTC(2026, 10, 18);
    const nodes = {}, timers = new Map(), requests = [];
    let timerId = 0;
    function node(id) {
        if (!nodes[id]) {
            nodes[id] = { style: {}, parentNode: { style: {} }, blur() {}, appendChild() {}, setAttribute() {} };
        }
        return nodes[id];
    }
    node("background").removeObjects = function () {};
    node("background").addImageObject = function () { return {}; };
    function timer(fn, delay, repeat) {
        timers.set(++timerId, { fn, delay, repeat, at: now + delay });
        return timerId;
    }
    function advance(ms) {
        now += ms;
        for (const [id, task] of Array.from(timers)) {
            if (task.at > now || !timers.has(id)) continue;
            if (task.repeat) task.at = now + task.delay;
            else timers.delete(id);
            task.fn();
        }
    }
    const gadget = { Settings: { readString(key) { return stored[key] || ""; }, writeString(key, val) { stored[key] = val; } } };
    const context = {
        Date: function (stamp) { return new Date(stamp === undefined ? now : stamp); },
        document: { getElementById: node, createElement() { return { style: {} }; }, body: { style: {} }, documentElement: { style: {} } },
        System: { Gadget: gadget }, WeatherParticles: { 64: { 13: [[12, 10, 4, 4]] } },
        WeatherParser: { weatherUrl: parser.weatherUrl, parseYandex(forecast) { forecast.updatedAt = now; return forecast; } },
        WeatherHttp: { get(url, timeout, headers, done) {
            const request = { url, done, abort() { this.aborted = true; } };
            requests.push(request);
            return request;
        } },
        setInterval(fn, delay) { return timer(fn, delay, true); }, setTimeout(fn, delay) { return timer(fn, delay, false); },
        clearInterval(id) { timers.delete(id); }, clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(fs.readFileSync("src/gadget.js", "utf8"), context);
    context.WeatherGadget.start();
    advance(30);
    return { node, requests, advance,
        switchCity() { node("next-place").onclick(); advance(30); },
        settingsChanged() { gadget.onSettingsClosed({ closeAction: 1, Action: { commit: 1 } }); advance(30); },
        intervals(ms) { return Array.from(timers.values()).filter(t => t.repeat && t.delay === ms).length; },
        cards() { return (node("hourly").innerHTML.match(/class="hour-item/g) || []).length; }
    };
}
function forecast(temperature, iconIndex, placeName) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ time: hour + ":00", hour, temperature, condition: "Ясно" }));
    return { temperature, feelsLike: temperature, condition: "Погода", iconIndex, placeName, hours, periods: [],
        pressure: 750, pressureGauge: { tone: "low", segment: 2, markerOffset: 108 }, uvIndex: 5, magneticIndex: 4 };
}
const stored = places();
const app = openGadget(stored);
assert.equal(app.intervals(30), 0);
app.requests[0].done(null, forecast(2, 13, "Харьковка"));
assert.equal(app.intervals(30), 1);
app.settingsChanged();
assert.equal(app.intervals(30), 1);
stored.animateWeather = "false";
app.settingsChanged();
assert.equal(app.intervals(30), 0);
stored.animateWeather = "true";
app.settingsChanged();
assert.equal(app.intervals(30), 1);
app.switchCity();
for (const gauge of ["pressure", "uv-index", "magnetic-index"]) {
    assert.equal(app.node(gauge).innerText, "—");
    assert.equal(app.node(gauge).parentNode.style.backgroundImage, "");
    assert.equal(app.node(gauge).parentNode.style.backgroundPosition, "");
}
assert.equal(app.intervals(30), 0);
app.requests[1].done(null, forecast(3, 26, "Санкт-Петербург"));
assert.equal(app.intervals(30), 0);
app.switchCity();
assert.equal(app.requests.length, 2);
assert.equal(app.node("temperature").innerText, "+2°");
assert.equal(app.cards(), 24);
assert.equal(app.node("hourly-next").disabled, false);
assert.equal(app.node("status").innerText, "");
assert.equal(readStoredForecast(stored, firstKey).weather.temperature, 2);
assert.equal(readStoredForecast(stored, secondKey).weather.temperature, 3);
app.advance(30 * 60000);
app.advance(30);
assert.equal(app.requests.length, 3);
app.requests[2].done(new Error("HTTP 503"), "");
assert.equal(app.node("temperature").innerText, "+2°");
assert.equal(app.node("status").innerText, "Данные устарели");
assert.equal(app.node("status").title, "HTTP 503");

const restarted = openGadget(stored);
assert.equal(restarted.cards(), 8);
restarted.requests[0].done(new Error("offline"), "");
assert.equal(restarted.node("temperature").innerText, "+2°");
restarted.switchCity();
restarted.requests[1].done(new Error("offline"), "");
assert.equal(restarted.node("temperature").innerText, "+3°");
assert.equal(restarted.cards(), 8);
const interrupted = places();
const writer = openGadget(interrupted);
writer.requests[0].done(null, forecast(4, 26, "Первое место"));
const firstHeader = interrupted[firstKey];
Object.defineProperty(interrupted, firstKey + "_b1", { set() { throw new Error("Write interrupted"); } });
writer.advance(30 * 60000);
writer.advance(30);
writer.requests[1].done(null, forecast(9, 26, "Первое место"));
assert.equal(writer.node("temperature").innerText, "+9°");
assert.equal(interrupted[firstKey], firstHeader);
assert.equal(openGadget(interrupted).node("temperature").innerText, "+4°");
const missingChunk = { ...stored, activeLocation: "0" };
delete missingChunk[firstKey + "_a0"];
assert.equal(openGadget(missingChunk).node("temperature").innerText, "—°");
for (const invalid of [{ temperature: 1 }, { ...forecast(1, 26, ""), hours: [null], updatedAt: 10 }, { ...forecast(1, 26, ""), periods: {}, updatedAt: 10 }]) {
    const bad = places();
    bad[firstKey] = JSON.stringify({ lat: 54.44, lon: 30.41, weather: invalid });
    const recovered = openGadget(bad);
    assert.equal(recovered.requests.length, 1);
    assert.equal(recovered.intervals(1000), 1);
    recovered.requests[0].done(null, forecast(7, 26, ""));
    assert.equal(recovered.node("temperature").innerText, "+7°");
}
const pending = places();
pending.location0Name = "Точка 54.440, 30.410";
pending.location0AutoName = "true";
const moving = openGadget(pending);
moving.switchCity();
assert.equal(moving.requests[0].aborted, true);
moving.requests[1].done(null, forecast(3, 26, "Название от Яндекса"));
assert.equal(pending.location1Name, "Петербург");
moving.switchCity();
moving.requests[0].done(null, forecast(99, 26, "Старый ответ"));
assert.equal(moving.node("temperature").innerText, "—°");
moving.requests[2].done(null, forecast(2, 13, "Харьковка, Оршанский район"));
assert.equal(moving.node("place").innerText, "Харьковка, Оршанский район");
assert.equal(pending.location0Name, "Харьковка, Оршанский район");
assert.equal(pending.location0AutoName, "false");
assert.equal(moving.requests.length, 3);
console.log("Forecast switching, cache recovery, automatic names, gauges and animation timers passed");
