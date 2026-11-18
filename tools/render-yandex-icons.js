var fs = require("fs");
var path = require("path");
var sharp = require("sharp");

var svg = fs.readFileSync(path.join(__dirname, "yandex-weather-sprite.svg"));
var baseSvg = fs.readFileSync(path.join(__dirname, "yandex-weather-base.svg"));
var precipSvg = fs.readFileSync(path.join(__dirname, "yandex-weather-precip.svg"));
var output = path.join(__dirname, "..", "src");
var sizes = [32, 64];
var animatedSize = 64;
var animatedWidth = animatedSize * 29;

var renders = sizes.map(function (size) {
    return sharp(svg).resize(size * 29, size).png().toFile(path.join(output, "yandex-weather-icons-" + size + ".png"));
});
renders.push(
    sharp(baseSvg).resize(animatedWidth, animatedSize).png().toFile(path.join(output, "yandex-weather-base-" + animatedSize + ".png")),
    sharp(precipSvg).resize(animatedWidth, animatedSize).png().toFile(path.join(output, "yandex-weather-precip-" + animatedSize + ".png"))
);
Promise.all(renders).then(function () {
    console.log("Rendered Yandex weather sprites at 32 and 64 pixels");
    var refresh = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M16.5 10A6.5 6.5 0 1 1 14.2 5.2" fill="none" stroke="#a5d9ff" stroke-width="1.7" stroke-linecap="round"/><path d="M14.2 3.4v3.2H11" fill="none" stroke="#a5d9ff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    return sharp(Buffer.from(refresh)).png().toFile(path.join(output, "refresh-night.png"));
}).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
