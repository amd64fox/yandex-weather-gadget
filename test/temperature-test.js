var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var parser = require("../src/weather-parser.js");
var fixture = require("./fixtures/negative-temperatures.json");

function page(hourly, days) {
    return "<script>" + JSON.stringify(JSON.stringify({ fact: fixture.fact })) + "</script>" + hourly + days;
}

var html = page(fixture.hourlyHtml, fixture.daysHtml);
var data = parser.parseYandex(html);
var expectedHours = { "02:00": 0, "03:00": 0, "04:00": -1, "05:00": -1, "06:00": -1, "07:00": -1, "08:00": -2, "09:00": -2, "10:00": -1 };
Object.keys(expectedHours).forEach(function (time) {
    var hours = data.hours.filter(function (hour) { return hour.time === time; });
    assert.strictEqual(hours.length, 1, time);
    assert.strictEqual(hours[0].temperature, expectedHours[time], time);
});
assert.deepStrictEqual(data.periods.map(function (period) { return [period.name, period.temperature]; }), [["Вечер", 2], ["Ночь", 0], ["Утро", -2]]);
assert.deepStrictEqual(data.days.map(function (day) { return [day.high, day.low]; }), [[4, -1], [3, 2], [5, 4], [6, 2], [5, -1], [4, 1], [4, 4], [3, -1], [3, 1], [4, -3]]);
assert.strictEqual(data.temperature, 4);
assert.strictEqual(data.feelsLike, -3);

["-", "\u2212", "&#8722;"].forEach(function (minus) {
    var variant = parser.parseYandex(html.split("\u2212").join(minus));
    assert.deepStrictEqual(variant.hours, data.hours);
    assert.deepStrictEqual(variant.periods, data.periods);
    assert.deepStrictEqual(variant.days, data.days);
});

var dailyIndex = 0;
var coldDays = fixture.daysHtml.replace(/(<span class="[^"]*AppShortForecastDay_temperature[^>]*>)[\s\S]*?(<\/span>)/g, function (_, before, after) {
    return before + (dailyIndex++ % 2 ? "\u221212°" : "\u22125°") + after;
});
assert.ok(parser.parseYandex(page(fixture.hourlyHtml, coldDays)).days.every(function (day) { return day.high === -5 && day.low === -12; }));

var hourlyCard = fixture.hourlyHtml.match(/<li\b[^>]*>[\s\S]*?<\/li>/)[0];
[[-15, "\u221215°"], [-15, "-15°"], [0, "0°"], [12, "+12°"]].forEach(function (sample) {
    var hourly = hourlyCard.replace(/(<p class="[^"]*AppHourlyItem_main[^>]*>)[\s\S]*?(<\/p>)/, "$1" + sample[1] + "$2");
    assert.strictEqual(parser.parseYandex(page(hourly, fixture.daysHtml)).hours[0].temperature, sample[0]);
});

var nodes = {};
var stored = {};
var pending = [];
function node(id) {
    if (!nodes[id]) {
        nodes[id] = { style: {}, parentNode: { style: {} }, innerText: "", innerHTML: "", title: "", setAttribute: function () {} };
    }
    return nodes[id];
}
node("background").removeObjects = function () {};
node("background").addImageObject = function () { return {}; };
function Request() {
    this.open = function () {};
    this.setRequestHeader = function () {};
    this.send = function () { this.status = 200; this.readyState = 4; };
    this.responseText = html;
}
var context = {
    document: { getElementById: node, body: { style: {} }, documentElement: { style: {} } },
    System: { Gadget: { Settings: {
        readString: function (key) { return stored[key] || ""; },
        writeString: function (key, value) { stored[key] = value; }
    } } },
    WeatherParticles: {},
    WeatherParser: parser,
    ActiveXObject: Request,
    setInterval: function (callback, milliseconds) {
        if (milliseconds === 75) { pending.push(callback); }
        return 1;
    },
    clearInterval: function () {},
    setTimeout: function (callback, delay) { if (delay === 30) { pending.push(callback); } return 1; },
    clearTimeout: function () {}
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/weather-http.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/gadget.js"), "utf8"), context);
context.WeatherGadget.start();
while (pending.length) { pending.shift()(); }
assert.strictEqual(node("period-name-2").innerText, "Утро");
assert.strictEqual(node("period-temp-2").innerText, "\u22122°");
assert.strictEqual(node("period-temp-0").innerText, "+2°");
assert.strictEqual(node("period-temp-1").innerText, "0°");
assert.strictEqual(node("feels").innerText, "Ощущается как \u22123°");
var cards = node("hourly").innerHTML.match(/<div class="hour-item\b[^>]*>[\s\S]*?<\/div>/g);
assert.ok(cards.some(function (card) { return /class="hour-time">04:00</.test(card) && /class="hour-temp">\u22121°</.test(card); }));
assert.strictEqual(require("./read-stored-forecast")(stored, "cache_54.44190663514991_30.41421211633299").weather.periods[2].temperature, -2);

console.log("negative temperatures: live hourly and daily markup, morning card, rendering, cache, ASCII and Unicode signs OK");
