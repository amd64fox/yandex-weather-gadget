var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var context = {};
vm.runInNewContext(fs.readFileSync("src/weather-particles.js", "utf8"), context);
var tested = 0;
for (var sizeKey in context.WeatherParticles) {
    var size = Number(sizeKey);
    var icons = context.WeatherParticles[sizeKey];
    for (var icon in icons) {
        var particles = icons[icon];
        for (var i = 0; i < particles.length; i++) {
            var bounds = particles[i];
            var start = Math.round(size * 0.12);
            var end = size - 2;
            var travel = start + end - bounds[1] - bounds[3];
            assert.ok(travel > 0);
            for (var frame = 0; frame <= 100; frame++) {
                var top = bounds[1] + Math.round(-start + frame / 100 * travel);
                assert.ok(top >= 0);
                assert.ok(top + bounds[3] <= end, sizeKey + " icon " + icon + " particle " + i + " frame " + frame);
            }
            tested++;
        }
    }
}
console.log("Verified " + tested + " precipitation particles stay inside their icons");
