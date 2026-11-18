const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const parser = require("../src/weather-parser.js");
const fixture = require("./fixtures/gauge-cases.json");

const colors = {
    "--parameter-neutral": "#536579",
    "--surface-elevated-200": "#20384f",
    "--text-secondary": "rgba(255,255,255,0.56)",
    "--parameter-none": "#4dcb5d",
    "--parameter-low": "#f6d13f",
    "--parameter-moderate": "#e9974c",
    "--parameter-average": "#ec8f1e",
    "--parameter-strong": "#e05139",
    "--parameter-storm": "#c92121",
    "--parameter-extreme": "#941762",
    "--parameter-uv-extreme": "#a559ef"
};

function page(sample, cards) {
    return "<script>" + JSON.stringify(JSON.stringify({ fact: sample.fact })) + "</script>" + fixture.forecastHtml + (cards || sample.cards).join("\n");
}

async function checkSprite(sample, kind, gauge) {
    const pressure = kind === "pressure";
    const width = pressure ? 44 : 40;
    const height = pressure ? 37 : 34;
    const frame = Math.max(0, Math.min(70, Math.round((pressure ? gauge.markerOffset : gauge.length) / 3)));
    const label = pressure ? "Давление" : kind === "uv" ? "УФ-индекс" : "Магнитные бури";
    const card = sample.cards.find(value => value.includes('aria-label="' + label));
    let svg = /<svg[\s\S]*?<\/svg>/.exec(card)[0];
    const curve = /<path[^>]* d="([^"]+)"/.exec(svg)[1];
    svg = svg.replace(/\s(?:width|height|style)="[^"]*"/g, "");
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="' + (pressure ? "-16 -10 132 110" : "-12 -10 120 100") + '"');
    svg = svg.replace("<svg ", '<svg width="' + width + '" height="' + height + '" ');
    svg = svg.replace(/<use\b([^>]*)>(?:<\/use>)?/g, function (_, attributes) {
        attributes = attributes.replace(/\s(?:href|stroke-dashoffset)="[^"]*"/g, "");
        if (!pressure || /stroke-dasharray="0 210"/.test(attributes)) {
            attributes += ' stroke-dashoffset="' + (pressure ? frame * 3 : 210 - frame * 3) + '"';
        } else if (/stroke-dasharray="55\.8 (?:110|210)"/.test(attributes)) {
            attributes += ' stroke-dashoffset="' + (-71.8 * gauge.segment) + '"';
        }
        return '<path d="' + curve + '" stroke-linecap="round"' + attributes + '/>';
    });
    svg = svg.replace(/var\((--[^)]+)\)/g, function (_, name) { return colors[name]; });
    const reference = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' + svg + "</svg>";
    const expected = await sharp(Buffer.from(reference), { density: 144 }).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const file = pressure
        ? "metric-pressure-" + gauge.tone + "-" + gauge.segment + ".png"
        : "metric-status-" + gauge.tone + ".png";
    const sprite = sharp(path.join(__dirname, "../src", file));
    const metadata = await sprite.metadata();
    assert.strictEqual(metadata.width, width * 71, file + " frame count");
    assert.strictEqual(metadata.height, height, file + " frame height");
    const actual = await sprite.extract({ left: frame * width, top: 0, width, height }).ensureAlpha().raw().toBuffer();
    let error = 0;
    for (let index = 0; index < actual.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
            error += Math.abs(actual[index + channel] * actual[index + 3] / 255 - expected[index + channel] * expected[index + 3] / 255);
        }
        error += Math.abs(actual[index + 3] - expected[index + 3]);
    }
    const average = error / actual.length;
    assert.ok(average < 0.05, sample.name + " " + kind + " differs from the site SVG: " + average.toFixed(3));
}

async function main() {
    for (const sample of fixture.cases) {
        const data = parser.parseYandex(page(sample));
        for (const key of Object.keys(sample.expected)) {
            assert.deepStrictEqual(data[key], sample.expected[key], sample.name + " " + key);
        }
        const reordered = sample.cards.map(card => card.replace(/<use\b([^>]*)>/g, function (_, attributes) {
            return "<use " + attributes.match(/[\w-]+="[^"]*"/g).reverse().join(" ") + ">";
        }));
        const reorderedData = parser.parseYandex(page(sample, reordered));
        for (const key of ["pressureGauge", "uvGauge", "magneticGauge"]) {
            assert.deepStrictEqual(reorderedData[key], sample.expected[key], sample.name + " reordered " + key);
        }
        for (const kind of ["pressure", "uv", "magnetic"]) {
            await checkSprite(sample, kind, sample.expected[kind + "Gauge"]);
        }
    }
    for (const tone of ["neutral", "none", "low", "moderate", "average", "strong", "storm", "extreme", "uv-extreme"]) {
        const stroke = tone === "neutral" ? "var(--text-secondary)" : "var(--parameter-" + tone + ")";
        for (const kind of ["uv", "magnetic"]) {
            const label = kind === "uv" ? "УФ-индекс" : "Магнитные бури";
            const sample = {
                name: "boundary-" + tone,
                cards: fixture.cases[1].cards.map(card => card.includes('aria-label="' + label) ? card.replace(/var\(--(?:parameter-none|text-secondary)\)/g, stroke) : card)
            };
            for (const length of [0, 105, 210]) {
                await checkSprite(sample, kind, { tone, length });
            }
        }
        for (const segment of [0, 1, 2]) {
            const source = fixture.cases.find(sample => sample.expected.pressureGauge.segment === segment);
            const sample = {
                name: "boundary-" + tone,
                cards: source.cards.map(card => card.includes('aria-label="Давление') ? card.replace(/var\(--parameter-(?:none|low)\)/g, stroke) : card)
            };
            for (const markerOffset of [11, 110, 199]) {
                await checkSprite(sample, "pressure", { tone, segment, markerOffset });
            }
        }
    }
    console.log("gauge parsing and site SVG comparison: OK (" + fixture.cases.length + " locations)");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
