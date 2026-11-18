var assert = require("assert");
var fs = require("fs");
var parser = require("../src/weather-parser.js");

var html = fs.readFileSync(process.argv[2], "utf8");
var data = parser.parseYandex(html);
assert.strictEqual(typeof data.temperature, "number");
assert.strictEqual(typeof data.wind, "number");
assert.strictEqual(typeof data.humidity, "number");
assert.ok(data.hours.length >= 12);
assert.ok(data.days.length >= 3);
assert.ok(data.periods.length >= 3);
assert.deepStrictEqual(parser.parseCoordinates("https://yandex.by/pogoda/ru?lat=54.44190663514991&lon=30.41421211633299"), { lat: 54.44190663514991, lon: 30.41421211633299 });
assert.deepStrictEqual(parser.parseCoordinates("54.4419, 30.4142"), { lat: 54.4419, lon: 30.4142 });
assert.strictEqual(parser.parseCoordinates("120, 300"), null);
assert.deepStrictEqual(parser.parseCoordinates(parser.weatherUrl({ lat: 1e-7, lon: -2e-8 })), { lat: 1e-7, lon: -2e-8 });
assert.strictEqual(parser.parseCoordinates("https://yandex.by/pogoda/ru?lat=54.4oops&lon=30.41"), null);
console.log(JSON.stringify({ temperature: data.temperature, condition: data.condition, hours: data.hours.length, days: data.days.length, periods: data.periods }, null, 2));
