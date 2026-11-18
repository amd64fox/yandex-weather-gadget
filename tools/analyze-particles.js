var fs = require("fs");
var path = require("path");
var sharp = require("sharp");

async function analyze(size) {
    var image = await sharp(path.join(__dirname, "..", "src", "yandex-weather-precip-" + size + ".png")).raw().toBuffer({ resolveWithObject: true });
    var pixels = image.data;
    var channels = image.info.channels;
    var width = image.info.width;
    var result = {};
    for (var icon = 0; icon < 23; icon++) {
        var visited = {};
        var parts = [];
        for (var y = 0; y < size; y++) {
            for (var x = 0; x < size; x++) {
                var key = y * size + x;
                if (visited[key] || pixels[(y * width + icon * size + x) * channels + 3] < 20) { continue; }
                var queue = [key];
                visited[key] = true;
                var bounds = [x, y, x, y, 0];
                while (queue.length) {
                    var current = queue.pop();
                    var cx = current % size;
                    var cy = Math.floor(current / size);
                    bounds[0] = Math.min(bounds[0], cx);
                    bounds[1] = Math.min(bounds[1], cy);
                    bounds[2] = Math.max(bounds[2], cx);
                    bounds[3] = Math.max(bounds[3], cy);
                    bounds[4]++;
                    var neighbors = [current - 1, current + 1, current - size, current + size];
                    for (var n = 0; n < neighbors.length; n++) {
                        var next = neighbors[n];
                        var nx = next % size;
                        var ny = Math.floor(next / size);
                        if (next < 0 || next >= size * size || Math.abs(nx - cx) + Math.abs(ny - cy) !== 1 || visited[next]) { continue; }
                        if (pixels[(ny * width + icon * size + nx) * channels + 3] >= 20) { visited[next] = true; queue.push(next); }
                    }
                }
                if (bounds[4] >= 3) { parts.push([bounds[0], bounds[1], bounds[2] - bounds[0] + 1, bounds[3] - bounds[1] + 1]); }
            }
        }
        if (parts.length) { result[icon] = parts; }
    }
    return result;
}

analyze(64).then(function (particles) {
    var target = path.join(__dirname, "..", "src", "weather-particles.js");
    fs.writeFileSync(target, "var WeatherParticles = " + JSON.stringify({ 64: particles }) + ";\n");
    console.log("Wrote " + target);
}).catch(function (error) { console.error(error); process.exitCode = 1; });
