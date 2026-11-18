const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const output = path.resolve(__dirname, "../src");
const blue = "#aed8ff";
const gray = "#536579";
const halo = "#20384f";
const frameWidth = 40;
const frameHeight = 34;
const pressureWidth = 44;
const pressureHeight = 37;
const frameStep = 3;
const frameCount = 71;
const tones = {
    neutral: { color: "#ffffff", opacity: 0.56 },
    none: { color: "#4dcb5d", opacity: 1 },
    low: { color: "#f6d13f", opacity: 1 },
    moderate: { color: "#e9974c", opacity: 1 },
    average: { color: "#ec8f1e", opacity: 1 },
    strong: { color: "#e05139", opacity: 1 },
    storm: { color: "#c92121", opacity: 1 },
    extreme: { color: "#941762", opacity: 1 },
    "uv-extreme": { color: "#a559ef", opacity: 1 }
};

function lineIcon(shape) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="${blue}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
}

function pressureGauge(tone, segment, markerOffset) {
    const curve = "M11.45 78.5a46 46 0 1 1 76.1 0";
    const active = tones[tone];
    const gap = segment === 1 ? 110 : 210;
    return `<svg width="${pressureWidth}" height="${pressureHeight}" viewBox="-16 -10 132 110" fill="none">
      <path d="${curve}" stroke="${gray}" stroke-width="8" stroke-linecap="round" stroke-dasharray="55.8 16"/>
      <path d="${curve}" stroke="${active.color}" stroke-opacity="${active.opacity}" stroke-width="8" stroke-linecap="round" stroke-dasharray="55.8 ${gap}" stroke-dashoffset="${-71.8 * segment}"/>
      <path d="${curve}" stroke="${halo}" stroke-width="24" stroke-linecap="round" stroke-dasharray="0 210" stroke-dashoffset="${markerOffset}"/>
      <path d="${curve}" stroke="${active.color}" stroke-opacity="${active.opacity}" stroke-width="14" stroke-linecap="round" stroke-dasharray="0 210" stroke-dashoffset="${markerOffset}"/>
    </svg>`;
}

function statusGauge(tone, length) {
    const curve = "M11.45 72.5a44 44 0 1 1 73.1 0";
    const active = tones[tone];
    const offset = 210 - length;
    return `<svg width="${frameWidth}" height="${frameHeight}" viewBox="-12 -10 120 100" fill="none">
      <path d="${curve}" stroke="${gray}" stroke-width="8" stroke-linecap="round"/>
      <path d="${curve}" stroke="${gray}" stroke-width="8" stroke-linecap="round" stroke-dasharray="210 210" stroke-dashoffset="${offset}"/>
      <path d="${curve}" stroke="${active.color}" stroke-opacity="${active.opacity}" stroke-width="8" stroke-linecap="round" stroke-dasharray="210 210" stroke-dashoffset="${offset}"/>
      <path d="${curve}" stroke="${halo}" stroke-width="24" stroke-linecap="round" stroke-dasharray="0 210" stroke-dashoffset="${offset}"/>
      <path d="${curve}" stroke="${active.color}" stroke-opacity="${active.opacity}" stroke-width="14" stroke-linecap="round" stroke-dasharray="0 210" stroke-dashoffset="${offset}"/>
    </svg>`;
}

const staticMetrics = {
    wind: lineIcon('<path d="M7 3.5S9.8 3 9.8 5.4C9.7 7.2 7.4 7 7.4 7H4.8m6.8-1s1.8-.3 1.8 1.2-1.3 1.5-1.3 1.5h-1.3m-3.4 3.8s2 .1 2-1.4c0-1.4-2-1.4-2-1.4H2.6"/>'),
    humidity: lineIcon('<path d="M8 2.5C22 17-6 17 8 2.5m2 6.9q0 1.4-1.4 2"/>')
};
staticMetrics.sunrise = fs.readFileSync(path.join(__dirname, "yandex-sunrise.svg"), "utf8");
staticMetrics.sunset = fs.readFileSync(path.join(__dirname, "yandex-sunset.svg"), "utf8");

async function render(svg, width, height) {
    return sharp(Buffer.from(svg), { density: 144 }).resize(width, height, { fit: "fill" }).png().toBuffer();
}

function sprite(frames, width, height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * frames.length}" height="${height}">${frames.map((frame, index) => frame.replace("<svg ", `<svg x="${index * width}" y="0" `)).join("")}</svg>`;
}

async function main() {
    for (const [name, svg] of Object.entries(staticMetrics)) {
        const sunEvent = name === "sunrise" || name === "sunset";
        const image = await sharp(Buffer.from(svg), { density: 300 }).resize(sunEvent ? 32 : 33, sunEvent ? 32 : 33, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        fs.writeFileSync(path.join(output, sunEvent ? `${name}-dashboard.png` : `metric-${name}.png`), image);
    }
    for (const tone of Object.keys(tones)) {
        const statusFrames = [];
        for (let index = 0; index < frameCount; index++) {
            statusFrames.push(statusGauge(tone, index * frameStep));
        }
        fs.writeFileSync(path.join(output, `metric-status-${tone}.png`), await render(sprite(statusFrames, frameWidth, frameHeight), frameWidth * frameCount, frameHeight));
        for (let segment = 0; segment < 3; segment++) {
            const frames = [];
            for (let index = 0; index < frameCount; index++) { frames.push(pressureGauge(tone, segment, index * frameStep)); }
            fs.writeFileSync(path.join(output, `metric-pressure-${tone}-${segment}.png`), await render(sprite(frames, pressureWidth, pressureHeight), pressureWidth * frameCount, pressureHeight));
        }
    }
    fs.writeFileSync(path.join(output, "metric-uv.png"), await render(`<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">${statusGauge("none", 17)}</svg>`, frameWidth, frameHeight));
    fs.writeFileSync(path.join(output, "metric-magnetic.png"), await render(`<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">${statusGauge("neutral", 20)}</svg>`, frameWidth, frameHeight));
    fs.writeFileSync(path.join(output, "metric-pressure.png"), await render(`<svg xmlns="http://www.w3.org/2000/svg" width="${pressureWidth}" height="${pressureHeight}">${pressureGauge("none", 1, 108)}</svg>`, pressureWidth, pressureHeight));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
