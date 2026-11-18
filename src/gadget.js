var WeatherGadget = (function () {
    var locations = [{ name: "Харьковка, Оршанский район", lat: 54.44190663514991, lon: 30.41421211633299 }];
    var active = 0;
    var units = "C";
    var intervalMinutes = 30;
    var animateWeather = true;
    var animationStartedAt = new Date().getTime();
    var animatedLayers = [];
    var animationTimer = null;
    var data = null;
    var forecasts = {};
    var lastAttempt = 0;
    var refreshStartTimer = null;
    var refreshRequest = null;
    var refreshGeneration = 0;
    var refreshCheckMs = 1000;
    var refreshRetryMs = 120000;
    var placeButtonTimer = null;
    var placeButtonOpacity = 48;
    var hourlyOffset = 0;
    var visibleHours = 8;
    var hourlyPosition = 0;
    var hourlyTimer = null;
    var hourWidth = 62;
    var dashboardHeight = 318;
    var frameCapHeight = 28;
    var frameMiddle = null;
    var frameBottom = null;
    var metricsSection = 1;
    var hourlySection = 2;
    var allSections = metricsSection | hourlySection;
    var openSections = allSections;
    var fullMetricsHeight = 42;
    var fullHourlyHeight = 81;
    var fullMetricsHeadingHeight = 17;
    var fullHourlyHeadingHeight = 27;
    var frameWithoutSections = dashboardHeight - fullMetricsHeight - fullHourlyHeight - fullMetricsHeadingHeight - fullHourlyHeadingHeight;
    var sectionLayout = null;
    var sectionTimer = null;
    var foldedHeadingsVisible = false;
    var hideHeadingsTimer = null;
    var hideHeadingsDelay = 2000;

    function element(id) { return document.getElementById(id); }
    function value(key) { return System.Gadget.Settings.readString(key); }
    function store(key, item) { System.Gadget.Settings.writeString(key, String(item)); }
    function write(id, text) { element(id).innerText = text; }
    function safe(text) { return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function pad(number) { return number < 10 ? "0" + number : String(number); }
    function showUpdatedTime() {
        var timestamp = data && Number(data.updatedAt);
        var date = timestamp > 0 ? new Date(timestamp) : null;
        if (!date || isNaN(date.getTime())) {
            write("updated-time", "--:--");
            element("updated-time").title = "Погода ещё не обновлялась";
            return;
        }
        var time = pad(date.getHours()) + ":" + pad(date.getMinutes());
        write("updated-time", time);
        element("updated-time").title = "Последнее успешное обновление: " + pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear() + " " + time + ":" + pad(date.getSeconds());
    }
    function format(number, digits) { return Number(number).toFixed(digits).replace(".", ","); }
    function degrees(celsius) {
        if (celsius === null || celsius === undefined || isNaN(Number(celsius))) { return "—°"; }
        var number = units === "F" ? Number(celsius) * 9 / 5 + 32 : Number(celsius);
        number = Math.round(number);
        return (number > 0 ? "+" : number < 0 ? "\u2212" : "") + Math.abs(number) + "°";
    }
    function gaugeTone(kind, value, gauge) {
        var tone = gauge && gauge.tone;
        if (/^(neutral|none|low|moderate|average|strong|storm|extreme|uv-extreme)$/.test(tone)) { return tone; }
        if (kind === "magnetic") { return value <= 2 ? "neutral" : value <= 4 ? "low" : value <= 5 ? "moderate" : value <= 6 ? "strong" : "storm"; }
        if (kind === "uv") { return value <= 2 ? "none" : value <= 5 ? "low" : value <= 7 ? "average" : value <= 10 ? "strong" : "uv-extreme"; }
        return "none";
    }
    function gaugeFrame(length) {
        var frame = Math.round(Number(length) / 3);
        return isNaN(frame) ? 0 : Math.max(0, Math.min(70, frame));
    }
    function showGauge(valueId, kind, gauge, value, defaultLength) {
        if (value === null || value === undefined) { clearGauge(valueId); return; }
        var tone = gaugeTone(kind, value, gauge);
        var length = gauge && gauge.length !== null && gauge.length !== undefined ? gauge.length : defaultLength;
        var segment = gauge && gauge.segment !== null && gauge.segment !== undefined ? Math.max(0, Math.min(2, gauge.segment)) : 1;
        var marker = gauge && gauge.markerOffset !== null && gauge.markerOffset !== undefined ? gauge.markerOffset : defaultLength;
        var frame = gaugeFrame(kind === "pressure" ? marker : length);
        var file = kind === "pressure"
            ? "metric-pressure-" + tone + "-" + segment + ".png"
            : "metric-status-" + tone + ".png";
        var icon = element(valueId).parentNode;
        icon.style.backgroundImage = "url(" + file + ")";
        icon.style.backgroundPosition = (-(kind === "pressure" ? 44 : 40) * frame) + "px 0px";
    }
    function clearGauge(id) {
        var style = element(id).parentNode.style;
        style.backgroundImage = "";
        style.backgroundPosition = "";
        write(id, "—");
    }
    function iconIndex(condition, code, index, night) {
        if (index !== null && index !== undefined && !isNaN(Number(index)) && index >= 0 && index <= 27) { return Number(index); }
        var name = (String(condition || "") + " " + String(code || "")).toLowerCase();
        if (/гроз|thunder/.test(name)) { return 20; }
        if (/снег|snow/.test(name)) { return 16; }
        if (/дожд|лив|rain|showers/.test(name)) { return 13; }
        if (/ясно|clear/.test(name)) { return night ? 27 : 26; }
        if (/малооблач|переменн|partly/.test(name)) { return night ? 24 : 23; }
        return 25;
    }
    function setIcon(node, condition, code, index, night, size, motion) {
        var selected = iconIndex(condition, code, index, night);
        var particles = WeatherParticles[size] && WeatherParticles[size][selected];
        var split = particles && animateWeather && motion;
        node.innerHTML = "";
        node.style.width = size + "px";
        node.style.height = size + "px";
        node.style.backgroundImage = "url(yandex-weather-" + (split ? "base" : "icons") + "-" + size + ".png)";
        node.style.backgroundPosition = (-selected * size) + "px 0px";
        node.setAttribute("data-weather-icon", selected);
        node.title = condition || "Погода";
        if (split) {
            for (var part = 0; part < particles.length; part++) {
                var bounds = particles[part];
                var overlay = document.createElement("span");
                overlay.className = "wx-precip";
                overlay.style.width = bounds[2] + "px";
                overlay.style.height = bounds[3] + "px";
                overlay.style.left = bounds[0] + "px";
                overlay.style.top = bounds[1] + "px";
                overlay.style.backgroundImage = "url(yandex-weather-precip-" + size + ".png)";
                overlay.style.backgroundPosition = (-(selected * size + bounds[0])) + "px " + (-bounds[1]) + "px";
                node.appendChild(overlay);
                var snow = selected >= 3 && selected <= 5 || selected >= 9 && selected <= 11 || selected >= 15 && selected <= 17 || selected === 18 && part === 0;
                var hail = selected === 19 || selected === 22;
                var start = Math.round(size * 0.12);
                var bottom = size - 2;
                animatedLayers.push({ node: overlay, left: bounds[0], top: bounds[1], height: bounds[3], snow: snow, cycle: snow ? 1450 : hail ? 840 : 760, shift: part * (snow ? 400 : 245), start: start, travel: start + bottom - bounds[1] - bounds[3], fadeEnd: bottom, fadeBand: Math.max(4, Math.round(size * 0.1)), opacity: -1 });
            }
        }
    }
    function updateAnimationTimer() {
        if (animatedLayers.length && animationTimer === null) {
            animationStartedAt = new Date().getTime();
            animationTimer = setInterval(animateIcons, 30);
        } else if (!animatedLayers.length && animationTimer !== null) {
            clearInterval(animationTimer);
            animationTimer = null;
        }
    }
    function animateIcons() {
        var elapsed = new Date().getTime() - animationStartedAt;
        for (var i = 0; i < animatedLayers.length; i++) {
            var layer = animatedLayers[i];
            var progress = ((elapsed + layer.shift) % layer.cycle) / layer.cycle;
            var offset = -layer.start + progress * layer.travel;
            var entrance = Math.min(1, progress / 0.17);
            var exit = Math.max(0, Math.min(1, (layer.fadeEnd - layer.top - layer.height - offset) / layer.fadeBand));
            var opacity = Math.round(100 * entrance * exit);
            layer.node.style.top = (layer.top + Math.round(offset)) + "px";
            if (layer.snow) { layer.node.style.left = (layer.left + Math.round(Math.sin(progress * Math.PI * 2) * 2)) + "px"; }
            if (opacity !== layer.opacity) { layer.node.style.filter = "alpha(opacity=" + opacity + ")"; layer.opacity = opacity; }
        }
    }
    function location() { return locations[active]; }
    function weatherUrl() {
        return WeatherParser.weatherUrl(location());
    }
    function loadSettings() {
        var count = parseInt(value("locationCount"), 10);
        var saved = [];
        if (count > 0 && count <= 10) {
            for (var i = 0; i < count; i++) {
                var name = value("location" + i + "Name");
                var lat = parseFloat(value("location" + i + "Lat"));
                var lon = parseFloat(value("location" + i + "Lon"));
                if (name && !isNaN(lat) && !isNaN(lon)) {
                    saved.push({ name: name, lat: lat, lon: lon, autoName: value("location" + i + "AutoName") === "true" });
                }
            }
        }
        if (saved.length) { locations = saved; }
        active = parseInt(value("activeLocation"), 10) || 0;
        if (active < 0 || active >= locations.length) { active = 0; }
        var savedUnits = value("units");
        if (/^(C|F)$/.test(savedUnits)) { units = savedUnits; }
        var savedInterval = parseInt(value("intervalMinutes"), 10);
        if (savedInterval === 15 || savedInterval === 30 || savedInterval === 60) { intervalMinutes = savedInterval; }
        animateWeather = value("animateWeather") !== "false";
    }
    function cacheKey(place) { return "cache_" + place.lat + "_" + place.lon; }
    function readCacheText(key) {
        var raw = value(key);
        var header = /^([ab])([1-9]\d?)$/.exec(raw);
        if (!header) { return raw; }
        var parts = [];
        for (var i = 0; i < Number(header[2]); i++) {
            var part = value(key + "_" + header[1] + i);
            if (!part) { return ""; }
            parts.push(part);
        }
        return decodeURIComponent(parts.join(""));
    }
    function writeCacheText(key, text) {
        var previous = "";
        try { previous = value(key); } catch (error) { }
        var slot = previous.charAt(0) === "a" ? "b" : "a";
        var encoded = encodeURIComponent(text);
        // Short ASCII chunks also fit after Sidebar escapes a setting value
        var size = 480;
        var count = Math.ceil(encoded.length / size);
        if (count > 99) { return; }
        for (var i = 0; i < count; i++) {
            store(key + "_" + slot + i, encoded.substr(i * size, size));
        }
        // Publish the new slot only after all its chunks have been written
        store(key, slot + count);
    }
    function clearCacheText(key) {
        store(key, "");
        for (var slot = 0; slot < 2; slot++) {
            var prefix = key + (slot ? "_b" : "_a");
            for (var i = 0; value(prefix + i); i++) { store(prefix + i, ""); }
        }
    }
    function readForecast(key, place) {
        try {
            var raw = readCacheText(key);
            if (!raw) { return null; }
            var cache = JSON.parse(raw);
            if (!cache || cache.lat !== place.lat || cache.lon !== place.lon) { return null; }
            var forecast = cache.weather;
            var type = Object.prototype.toString;
            if (!forecast || typeof forecast.temperature !== "number" || !isFinite(forecast.temperature) ||
                typeof forecast.condition !== "string" || typeof forecast.updatedAt !== "number" || !(forecast.updatedAt > 0) ||
                type.call(forecast.hours) !== "[object Array]" || type.call(forecast.periods) !== "[object Array]") { return null; }
            for (var h = 0; h < forecast.hours.length; h++) {
                var hour = forecast.hours[h];
                if (!hour || typeof hour.time !== "string" ||
                    (hour.event !== "sunrise" && hour.event !== "sunset" && typeof hour.temperature !== "number")) { return null; }
            }
            for (var p = 0; p < forecast.periods.length; p++) {
                var period = forecast.periods[p];
                if (!period || typeof period.name !== "string" || typeof period.temperature !== "number") { return null; }
            }
            return forecast;
        } catch (error) { return null; }
    }
    function loadCache() {
        var place = location();
        var key = cacheKey(place);
        data = forecasts[key] || readForecast(key, place) || readForecast("cache", place);
    }
    function forgetRemovedPlaces(previous) {
        var saved = {};
        for (var i = 0; i < locations.length; i++) { saved[cacheKey(locations[i])] = true; }
        for (var j = 0; j < previous.length; j++) {
            var key = cacheKey(previous[j]);
            if (!saved[key]) {
                delete forecasts[key];
                clearCacheText(key);
                if (readForecast("cache", previous[j])) { store("cache", ""); }
            }
        }
    }
    function saveCache() {
        try {
            var compact = {
                temperature: data.temperature, feelsLike: data.feelsLike, condition: data.condition, outlook: data.outlook, iconIndex: data.iconIndex,
                conditionCode: data.conditionCode, placeName: data.placeName, wind: data.wind,
                pressure: data.pressure, pressureDescription: data.pressureDescription,
                pressureGauge: data.pressureGauge ? { tone: data.pressureGauge.tone, segment: data.pressureGauge.segment, markerOffset: data.pressureGauge.markerOffset } : null,
                humidity: data.humidity, isNight: data.isNight,
                uvIndex: data.uvIndex, uvDescription: data.uvDescription,
                uvGauge: data.uvGauge ? { tone: data.uvGauge.tone, length: data.uvGauge.length } : null,
                magneticIndex: data.magneticIndex, magneticDescription: data.magneticDescription,
                magneticGauge: data.magneticGauge ? { tone: data.magneticGauge.tone, length: data.magneticGauge.length } : null,
                hours: [], periods: data.periods.slice(0, 3), updatedAt: data.updatedAt
            };
            for (var h = 0; h < data.hours.length && h < 8; h++) {
                var hour = data.hours[h];
                compact.hours.push(hour.event ? { time: hour.time, event: hour.event } : { time: hour.time, hour: hour.hour, temperature: hour.temperature, condition: hour.condition, iconIndex: hour.iconIndex, precipitationProbability: hour.precipitationProbability });
            }
            writeCacheText(cacheKey(location()), JSON.stringify({ lat: location().lat, lon: location().lon, weather: compact }));
        } catch (error) { }
    }
    function applyAppearance() {
        var width = 516;
        document.body.className = locations.length > 1 ? "has-locations" : "";
        document.body.style.width = width + "px";
        document.body.style.height = dashboardHeight + "px";
        document.documentElement.style.width = width + "px";
        document.documentElement.style.height = dashboardHeight + "px";
        element("card").style.width = (width - 8) + "px";
        var placeWidth = width - 140 - (locations.length > 1 ? 18 : 0);
        element("place").style.maxWidth = placeWidth + "px";
        showSections(sectionLayout);
    }
    function drawFrame(height) {
        // Align the center-scaled strip to whole pixels and overlap its ends
        height += height % 2;
        if (!frameMiddle) {
            var background = element("background");
            var file = "background-night-dashboard";
            background.removeObjects();
            background.src = file + ".png";
            background.style.height = dashboardHeight + "px";
            frameMiddle = background.addImageObject(file + "-middle.png", 0, frameCapHeight);
            frameBottom = background.addImageObject(file + "-bottom.png", 0, height - frameCapHeight);
        }
        frameMiddle.height = Math.min(dashboardHeight, height + 4) - 2 * frameCapHeight;
        frameMiddle.top = frameCapHeight - (dashboardHeight - height) / 2;
        frameBottom.top = height - frameCapHeight;
    }
    function showSections(layout) {
        sectionLayout = layout;
        var metricsHeight = Math.round(layout.metrics);
        var hourlyHeight = Math.round(layout.hourly);
        var metricsHeadingHeight = Math.round(layout.metricsHeading);
        var hourlyHeadingHeight = Math.round(layout.hourlyHeading);
        var trailingSpace = hourlyHeadingHeight + hourlyHeight + (metricsHeight ? 0 : metricsHeadingHeight);
        // Keep the last visible panel inside the rounded frame corners
        var cornerSpace = Math.max(7 - trailingSpace, Math.min(7, fullHourlyHeight - hourlyHeight, hourlyHeight));
        var height = frameWithoutSections + metricsHeight + hourlyHeight + metricsHeadingHeight + hourlyHeadingHeight + cornerSpace;
        element("metrics-heading").style.height = metricsHeadingHeight + "px";
        element("hourly-heading").style.height = hourlyHeadingHeight + "px";
        var metricsStyle = element("metrics").style;
        var hourlyStyle = element("hourly-body").style;
        metricsStyle.height = metricsHeight + "px";
        metricsStyle.display = metricsHeight ? "" : "none";
        hourlyStyle.height = hourlyHeight + "px";
        hourlyStyle.display = hourlyHeight ? "" : "none";
        drawFrame(height);
        element("card").style.height = (height - 8) + "px";
    }
    function sectionOpen(section) { return (openSections & section) !== 0; }
    function targetSectionLayout() {
        var metricsOpen = sectionOpen(metricsSection);
        var hourlyOpen = sectionOpen(hourlySection);
        return {
            metrics: metricsOpen ? fullMetricsHeight : 0,
            hourly: hourlyOpen ? fullHourlyHeight : 0,
            metricsHeading: metricsOpen || foldedHeadingsVisible ? fullMetricsHeadingHeight : 0,
            hourlyHeading: hourlyOpen || foldedHeadingsVisible ? fullHourlyHeadingHeight : 0
        };
    }
    function updateSectionControl(id, name, expanded) {
        var button = element(id);
        button.setAttribute("aria-expanded", String(expanded));
        button.title = (expanded ? "Свернуть " : "Развернуть ") + name;
    }
    function updateSectionControls() {
        updateSectionControl("metrics-toggle", "показатели погоды", sectionOpen(metricsSection));
        updateSectionControl("hourly-toggle", "почасовой прогноз", sectionOpen(hourlySection));
        element("hourly-section").className = sectionOpen(hourlySection) ? "" : "folded";
    }
    function loadSections() {
        var saved = value("openSections");
        if (/^[0-3]$/.test(saved)) {
            openSections = Number(saved);
        } else {
            var oldLevel = value("sectionLevel");
            if (oldLevel === "0") { openSections = 0; }
            if (oldLevel === "1") { openSections = metricsSection; }
        }
        foldedHeadingsVisible = openSections !== allSections;
        sectionLayout = targetSectionLayout();
        updateSectionControls();
    }
    function animateSections() {
        if (sectionTimer !== null) { clearInterval(sectionTimer); sectionTimer = null; }
        var from = sectionLayout;
        var target = targetSectionLayout();
        var metricsDelta = target.metrics - from.metrics;
        var hourlyDelta = target.hourly - from.hourly;
        var metricsHeadingDelta = target.metricsHeading - from.metricsHeading;
        var hourlyHeadingDelta = target.hourlyHeading - from.hourlyHeading;
        var distance = Math.max(Math.abs(metricsDelta), Math.abs(hourlyDelta), Math.abs(metricsHeadingDelta), Math.abs(hourlyHeadingDelta));
        if (!distance) { return; }
        var duration = 150 + distance;
        var startedAt = new Date().getTime();
        sectionTimer = setInterval(function () {
            var progress = Math.max(0, Math.min(1, (new Date().getTime() - startedAt) / duration));
            var eased = progress * progress * (3 - 2 * progress);
            showSections({
                metrics: from.metrics + metricsDelta * eased,
                hourly: from.hourly + hourlyDelta * eased,
                metricsHeading: from.metricsHeading + metricsHeadingDelta * eased,
                hourlyHeading: from.hourlyHeading + hourlyHeadingDelta * eased
            });
            if (progress === 1) { clearInterval(sectionTimer); sectionTimer = null; }
        }, 16);
    }
    function cancelHeadingHide() {
        if (hideHeadingsTimer === null) { return; }
        clearTimeout(hideHeadingsTimer);
        hideHeadingsTimer = null;
    }
    function hideHeadingsLater() {
        if (!foldedHeadingsVisible || hideHeadingsTimer !== null) { return; }
        hideHeadingsTimer = setTimeout(function () {
            hideHeadingsTimer = null;
            foldedHeadingsVisible = false;
            animateSections();
        }, hideHeadingsDelay);
    }
    function revealHeadings() {
        cancelHeadingHide();
        if (foldedHeadingsVisible) { return; }
        foldedHeadingsVisible = true;
        animateSections();
    }
    function nearHeading(event, id) {
        var bounds = element(id).getBoundingClientRect();
        return event.clientX >= bounds.left && event.clientX < bounds.right &&
            event.clientY >= bounds.top - 12 && event.clientY < bounds.bottom + 4;
    }
    function trackHeadingHover(event) {
        if (openSections === allSections) { return; }
        event = event || window.event;
        if ((!sectionOpen(metricsSection) && nearHeading(event, "metrics-heading")) ||
            (!sectionOpen(hourlySection) && nearHeading(event, "hourly-heading"))) {
            revealHeadings();
        } else {
            hideHeadingsLater();
        }
    }
    function toggleSection(section) {
        openSections ^= section;
        updateSectionControls();
        store("openSections", openSections);
        cancelHeadingHide();
        if (!sectionOpen(section)) { foldedHeadingsVisible = true; }
        if (openSections === allSections) { foldedHeadingsVisible = false; }
        animateSections();
        hideHeadingsLater();
    }
    function bindSectionButton(id, section) {
        var button = element(id);
        button.onclick = function () { toggleSection(section); };
        button.onfocus = function () { if (!sectionOpen(section)) { revealHeadings(); } };
        button.onblur = hideHeadingsLater;
    }
    function clearWeather() {
        write("temperature", "—°");
        write("condition", "Загрузка погоды");
        write("outlook", "");
        element("outlook").title = "";
        write("feels", "");
        element("weather-icon").innerHTML = "";
        element("weather-icon").style.backgroundImage = "none";
        element("weather-icon").title = "";
        for (var i = 0; i < 3; i++) {
            write("period-name-" + i, "—");
            write("period-temp-" + i, "—°");
            element("period-icon-" + i).style.backgroundImage = "none";
        }
        write("wind", "—");
        write("humidity", "—");
        clearGauge("pressure");
        write("pressure-description", "—");
        clearGauge("uv-index");
        write("uv-description", "—");
        clearGauge("magnetic-index");
        write("magnetic-description", "—");
        element("hourly").innerHTML = "";
        if (hourlyTimer) { clearInterval(hourlyTimer); hourlyTimer = null; }
        hourlyPosition = 0;
        element("hourly-prev").disabled = true;
        element("hourly-next").disabled = true;
    }
    function updateHourlyControls() {
        var maximum = data ? Math.max(0, data.hours.length - visibleHours) : 0;
        element("hourly-prev").disabled = hourlyOffset === 0;
        element("hourly-next").disabled = hourlyOffset === maximum;
    }
    function moveHourlyTrack(position) {
        hourlyPosition = position;
        element("hourly-track").style.left = -Math.round(position) + "px";
    }
    function renderHours() {
        if (hourlyTimer) { clearInterval(hourlyTimer); hourlyTimer = null; }
        var hours = data ? data.hours : [];
        var maximum = Math.max(0, hours.length - visibleHours);
        hourlyOffset = Math.max(0, Math.min(hourlyOffset, maximum));
        updateHourlyControls();
        var hourHtml = "";
        for (var h = 0; h < hours.length; h++) {
            var hour = hours[h];
            if (hour.event) {
                var event = hour.event === "sunrise" ? "sunrise" : "sunset";
                hourHtml += '<div class="hour-item hour-sun"><span class="hour-time">' + safe(hour.time) + '</span><span class="sun-icon ' + event + '-icon"></span><span class="hour-temp">' + (event === "sunrise" ? "Восход" : "Закат") + '</span></div>';
            } else {
                var chance = hour.precipitationProbability;
                hourHtml += '<div class="hour-item"><span class="hour-time">' + safe(hour.time) + '</span><span class="symbol wx-icon" id="hour-icon-' + h + '"></span><span class="hour-chance" title="Вероятность осадков">' + (chance === null || chance === undefined ? "" : chance + "%") + '</span><span class="hour-temp">' + degrees(hour.temperature) + '</span></div>';
            }
        }
        element("hourly").innerHTML = '<div id="hourly-track" style="width:' + hours.length * hourWidth + 'px">' + hourHtml + '</div>';
        moveHourlyTrack(hourlyOffset * hourWidth);
        for (var hi = 0; hi < hours.length; hi++) {
            var hourly = hours[hi];
            if (!hourly.event) { setIcon(element("hour-icon-" + hi), hourly.condition, "", hourly.iconIndex, hourly.hour < 6 || hourly.hour >= 20, 32); }
        }
    }
    function scrollHours(amount) {
        var maximum = data ? Math.max(0, data.hours.length - visibleHours) : 0;
        var next = Math.max(0, Math.min(hourlyOffset + amount, maximum));
        if (next === hourlyOffset) { return; }
        hourlyOffset = next;
        updateHourlyControls();
        if (hourlyTimer) { clearInterval(hourlyTimer); }
        var from = hourlyPosition;
        var to = hourlyOffset * hourWidth;
        var startedAt = new Date().getTime();
        hourlyTimer = setInterval(function () {
            var progress = Math.max(0, Math.min(1, (new Date().getTime() - startedAt) / 220));
            var eased = progress * progress * (3 - 2 * progress);
            moveHourlyTrack(from + (to - from) * eased);
            if (progress === 1) { clearInterval(hourlyTimer); hourlyTimer = null; }
        }, 16);
    }
    function wheelHours(event) {
        if (!sectionOpen(hourlySection)) { return; }
        event = event || window.event;
        if (!event.wheelDelta) { return; }
        scrollHours(event.wheelDelta < 0 ? 1 : -1);
        event.returnValue = false;
        return false;
    }
    function render() {
        animatedLayers = [];
        applyAppearance();
        showUpdatedTime();
        if (location().autoName && data && typeof data.placeName === "string" && data.placeName) {
            location().name = data.placeName.substring(0, 75);
            location().autoName = false;
            store("location" + active + "Name", location().name);
            store("location" + active + "AutoName", "false");
        }
        write("place", location().name);
        element("place").title = location().name;
        element("open-site").href = weatherUrl();
        if (!data) { clearWeather(); updateAnimationTimer(); return; }
        write("temperature", degrees(data.temperature));
        write("condition", data.condition);
        write("outlook", data.outlook || "");
        element("outlook").title = data.outlook || "";
        write("feels", "Ощущается как " + degrees(data.feelsLike));
        setIcon(element("weather-icon"), data.condition, data.conditionCode, data.iconIndex, data.isNight, 64, true);
        for (var i = 0; i < 3; i++) {
            var period = data.periods[i];
            write("period-name-" + i, period ? period.name : "—");
            setIcon(element("period-icon-" + i), period ? period.condition : "", "", period ? period.iconIndex : null, period && period.name === "Ночь", 32);
            write("period-temp-" + i, period ? degrees(period.temperature) : "—°");
        }
        write("wind", data.wind === null || data.wind === undefined ? "—" : format(data.wind, 1) + " м/с");
        write("humidity", data.humidity === null || data.humidity === undefined ? "—" : data.humidity + "%");
        write("pressure", data.pressure === null || data.pressure === undefined ? "—" : data.pressure);
        write("pressure-description", data.pressureDescription || "—");
        showGauge("pressure", "pressure", data.pressureGauge, data.pressure, data.pressure === null || data.pressure === undefined ? 108 : Number(data.pressure) * 0.4 - 196.4);
        write("uv-index", data.uvIndex === null || data.uvIndex === undefined ? "—" : data.uvIndex);
        write("uv-description", data.uvDescription || "—");
        showGauge("uv-index", "uv", data.uvGauge, data.uvIndex, data.uvIndex === null || data.uvIndex === undefined ? 0 : Number(data.uvIndex) * 17);
        write("magnetic-index", data.magneticIndex === null || data.magneticIndex === undefined ? "—" : data.magneticIndex);
        write("magnetic-description", data.magneticDescription || "—");
        showGauge("magnetic-index", "magnetic", data.magneticGauge, data.magneticIndex, data.magneticIndex === null || data.magneticIndex === undefined ? 0 : Math.max(0, Number(data.magneticIndex) * 14 - 8));
        renderHours();
        updateAnimationTimer();
    }
    function setStatus(message, detail) {
        var status = element("status");
        status.innerText = message;
        status.title = detail || message || "Состояние обновления";
        status.style.display = message ? "block" : "none";
    }
    function finishRefresh(error, response) {
        refreshRequest = null;
        try {
            if (error) { throw error; }
            data = WeatherParser.parseYandex(response);
            forecasts[cacheKey(location())] = data;
            hourlyOffset = 0;
            saveCache();
            render();
            setStatus("");
        } catch (failure) {
            if (!data) { write("condition", "Нет данных"); }
            setStatus(data ? "Данные устарели" : "Ошибка загрузки", failure.message || String(failure));
        }
    }
    function performRefresh() {
        refreshStartTimer = null;
        try {
            var headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "ru-RU,ru;q=0.9",
                "Cache-Control": "no-cache"
            };
            var generation = refreshGeneration;
            refreshRequest = WeatherHttp.get(weatherUrl(), 40000, headers, function (error, response) {
                if (generation === refreshGeneration) { finishRefresh(error, response); }
            });
        } catch (error) { finishRefresh(error); }
    }
    function cancelRefresh() {
        refreshGeneration++;
        if (refreshStartTimer !== null) { clearTimeout(refreshStartTimer); refreshStartTimer = null; }
        if (refreshRequest) { refreshRequest.abort(); refreshRequest = null; }
    }
    function refresh(force) {
        var now = new Date().getTime();
        if (refreshStartTimer !== null || refreshRequest) { return; }
        if (force && now >= lastAttempt && now - lastAttempt < 10000) { return; }
        if (!force) {
            var updatedAt = data && Number(data.updatedAt);
            if (data && forecasts[cacheKey(location())] === data && updatedAt > 0 && now >= updatedAt && now - updatedAt < intervalMinutes * 60000) { return; }
            if (lastAttempt > 0 && now >= lastAttempt && now - lastAttempt < refreshRetryMs) { return; }
        }
        lastAttempt = now;
        setStatus("Обновление...");
        refreshStartTimer = setTimeout(performRefresh, 30);
    }
    function showLocation() {
        cancelRefresh();
        hourlyOffset = 0;
        lastAttempt = 0;
        loadCache();
        setStatus("");
        render();
        refresh(false);
    }
    function nextLocation() {
        if (locations.length < 2) { return; }
        element("next-place").blur();
        active = (active + 1) % locations.length;
        store("activeLocation", active);
        showLocation();
    }
    function highlightPlaceButton(highlight) {
        if (placeButtonTimer) { clearInterval(placeButtonTimer); }
        var target = highlight ? 100 : 48;
        placeButtonTimer = setInterval(function () {
            var difference = target - placeButtonOpacity;
            placeButtonOpacity += Math.abs(difference) <= 9 ? difference : difference > 0 ? 9 : -9;
            var button = element("next-place");
            button.style.filter = "alpha(opacity=" + placeButtonOpacity + ")";
            button.style.left = Math.round(-2 + (placeButtonOpacity - 48) / 26) + "px";
            if (placeButtonOpacity === target) { clearInterval(placeButtonTimer); placeButtonTimer = null; }
        }, 25);
    }
    function settingsClosed(event) {
        if (event.closeAction != event.Action.commit) { return; }
        var previous = location();
        var previousLocations = locations;
        loadSettings();
        forgetRemovedPlaces(previousLocations);
        var current = location();
        var moved = previous.lat !== current.lat || previous.lon !== current.lon;
        if (moved) { showLocation(); }
        else { render(); }
    }
    function start() {
        System.Gadget.settingsUI = "settings.html";
        System.Gadget.onSettingsClosed = settingsClosed;
        element("refresh").onclick = function () { refresh(true); };
        bindSectionButton("metrics-toggle", metricsSection);
        bindSectionButton("hourly-toggle", hourlySection);
        document.body.onmousemove = trackHeadingHover;
        document.body.onmouseleave = hideHeadingsLater;
        element("hourly-prev").onclick = function () { scrollHours(-4); };
        element("hourly-next").onclick = function () { scrollHours(4); };
        element("hourly-section").onmousewheel = wheelHours;
        element("next-place").onclick = nextLocation;
        element("next-place").onmouseover = function () { highlightPlaceButton(true); };
        element("next-place").onmouseout = function () { highlightPlaceButton(document.activeElement === element("next-place")); };
        element("next-place").onfocus = function () { highlightPlaceButton(true); };
        element("next-place").onblur = function () { highlightPlaceButton(false); };
        loadSections();
        loadSettings();
        setInterval(function () { refresh(false); }, refreshCheckMs);
        showLocation();
        hideHeadingsLater();
    }
    return { start: start };
}());
