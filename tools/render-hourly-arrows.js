const path = require("path");
const sharp = require("sharp");

async function render(name, colors) {
    const paths = ["M7.5 2.5L4 6L7.5 9.5", "M4.5 2.5L8 6L4.5 9.5"];
    const frames = paths.map((shape, direction) => colors.map((color, state) => {
        const left = (direction * 3 + state) * 12;
        return `<path transform="translate(${left} 0)" d="${shape}" stroke="${color}"/>`
            + `<path transform="translate(${left} 12) rotate(90 6 6)" d="${shape}" stroke="${color}"/>`;
    }).join("")).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${frames}</svg>`;
    await sharp(Buffer.from(svg), { density: 288 }).resize(72, 24).png().toFile(path.join(__dirname, "../src", name));
}

render("hourly-arrows.png", ["#c7dcf5", "#ffffff", "#536579"])
    .catch(error => { console.error(error); process.exitCode = 1; });
