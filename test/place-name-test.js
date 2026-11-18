var assert = require("assert");
var parser = require("../src/weather-parser.js");

assert.strictEqual(parser.parsePlaceName('<h1>Погода в Лос-Анджелесе<p class="visuallyHidden"> (район Даунтаун, Лос-Анджелес, штат Калифорния, США)</p></h1>'), "район Даунтаун, Лос-Анджелес");
assert.strictEqual(parser.parsePlaceName('<h1>Погода в Харьковке<p class="visuallyHidden"> (деревня Харьковка, Витебская область, Беларусь)</p></h1>'), "деревня Харьковка, Витебская область");
assert.strictEqual(parser.parsePlaceName('<h1>Прогноз погоды<p class="visuallyHidden"> (0&nbsp;ю.ш., 0&nbsp;з.д.)</p></h1>'), "");
assert.strictEqual(parser.parsePlaceName('<title>Погода в Лос-Анджелесе</title>'), "");
console.log("place-name parser: OK");
