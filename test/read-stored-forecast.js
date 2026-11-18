module.exports = function readStoredForecast(settings, key) {
    const header = /^([ab])([1-9]\d?)$/.exec(settings[key]);
    if (!header) return JSON.parse(settings[key]);
    let encoded = "";
    for (let i = 0; i < Number(header[2]); i++) {
        const part = settings[key + "_" + header[1] + i];
        if (!part || part.length > 480) throw new Error("Invalid cache chunk");
        encoded += part;
    }
    return JSON.parse(decodeURIComponent(encoded));
};
