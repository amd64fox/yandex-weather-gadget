var assert = require("assert");
var parser = require("../src/weather-parser.js");
var fixture = require("./fixtures/fact-cases.json");
var forecast = require("./fixtures/gauge-cases.json").forecastHtml;

function page(fact, markup) {
    return "<script>" + JSON.stringify(JSON.stringify({ fact: fact })) + "</script>" + forecast + markup;
}

fixture.cases.forEach(function (sample) {
    var data = parser.parseYandex(page(sample.fact, sample.html));
    Object.keys(sample.expected).forEach(function (key) {
        assert.strictEqual(data[key], sample.expected[key], sample.name + " " + key);
    });

    var legacy = parser.parseYandex(page(sample.fact, sample.html.replace(/FactWithoutCharacter_/g, "AppFact_")));
    Object.keys(sample.expected).forEach(function (key) {
        assert.strictEqual(legacy[key], sample.expected[key], sample.name + " legacy " + key);
    });

    var fallback = parser.parseYandex(page(sample.fact, ""));
    assert.strictEqual(fallback.condition, sample.name === "kharkovka" ? "Небольшой дождь" : "Пасмурно");
    assert.strictEqual(fallback.conditionCode, sample.fact.condition);
    assert.strictEqual(fallback.iconIndex, null);
    assert.strictEqual(fallback.outlook, "");

    var unrelated = sample.html.replace(/FactWithoutCharacter_/g, "OtherFact_");
    var negative = parser.parseYandex(page(sample.fact, unrelated));
    assert.strictEqual(negative.condition, fallback.condition);
    assert.strictEqual(negative.iconIndex, null);
    assert.strictEqual(negative.outlook, "");
});

["NEW_CONDITION", "hasOwnProperty", "__proto__", "", null].forEach(function (code) {
    var fact = JSON.parse(JSON.stringify(fixture.cases[0].fact));
    fact.condition = code;
    assert.strictEqual(parser.parseYandex(page(fact, "")).condition, "Погода");
});

var fact = JSON.parse(JSON.stringify(fixture.cases[0].fact));
fact.condition = "light-rain";
assert.strictEqual(parser.parseYandex(page(fact, "")).condition, "Небольшой дождь");

console.log("current and legacy fact markup, Russian fallback: OK (2 locations)");
