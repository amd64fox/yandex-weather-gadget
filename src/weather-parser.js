(function (root) {
    function text(value) {
        return String(value || "").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, function (_, number) {
            return String.fromCharCode(parseInt(number, 10));
        }).replace(/[\u200b-\u200d\u2060]/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    }

    function field(html, pattern) {
        var match = pattern.exec(html);
        return match ? text(match[1]) : "";
    }

    function conditionName(code) {
        var names = {
            CLEAR: "Ясно",
            PARTLY_CLOUDY: "Малооблачно",
            CLOUDY: "Облачно с прояснениями",
            OVERCAST: "Пасмурно",
            LIGHT_RAIN: "Небольшой дождь",
            RAIN: "Дождь",
            HEAVY_RAIN: "Сильный дождь",
            SHOWERS: "Ливень",
            WET_SNOW: "Дождь со снегом",
            LIGHT_SNOW: "Небольшой снег",
            SNOW: "Снег",
            SNOW_SHOWERS: "Снегопад",
            HAIL: "Град",
            THUNDERSTORM: "Гроза",
            THUNDERSTORM_WITH_RAIN: "Дождь с грозой",
            THUNDERSTORM_WITH_HAIL: "Гроза с градом"
        };
        var key = String(code || "").toUpperCase().replace(/-/g, "_");
        return names.hasOwnProperty(key) ? names[key] : "Погода";
    }

    function temperature(value) {
        var match = /([+-]?\d+)/.exec(String(value).replace(/\u2212/g, "-"));
        return match ? parseInt(match[1], 10) : null;
    }

    function factFromPage(html) {
        var match = /\\"fact\\":(\{[^{}]*\})/.exec(html);
        if (!match) {
            return null;
        }
        try {
            return JSON.parse(match[1].replace(/\\"/g, '"'));
        } catch (error) {
            return null;
        }
    }

    function parseHours(html) {
        var result = [];
        var seen = {};
        var pattern = /<li class="[^"]*AppHourlyItem_container[^>]*>([\s\S]*?)<\/li>/g;
        var match;
        while ((match = pattern.exec(html))) {
            var block = match[1];
            var dateTime = field(block, /<time[^>]*dateTime="([^"]+)"/i);
            var timeLabel = field(block, /<time[^>]*>([\s\S]*?)<\/time>/i);
            var hourMatch = /(\d{1,2}):(\d{2})/.exec(timeLabel);
            var main = field(block, /<p class="[^"]*AppHourlyItem_main[^>]*>([\s\S]*?)<\/p>/i);
            var event = main === "Восход" ? "sunrise" : main === "Закат" ? "sunset" : "";
            var temp = temperature(main);
            var key = (event || "weather") + dateTime;
            if (!hourMatch || !dateTime || !event && temp === null || seen[key]) {
                continue;
            }
            seen[key] = true;
            if (event) {
                result.push({ time: timeLabel, dateTime: dateTime, event: event });
                continue;
            }
            var accessible = field(block, /<p class="[^"]*visuallyHidden[^>]*>([\s\S]*?)<\/p>/i);
            var condition = /°[,，]\s*([^,，]+)[,，]/.exec(accessible);
            var icon = /AppHourlyItem_icon[^\"]*" style="--icon:(\d+)"/.exec(block);
            var probability = field(block, /<span class="[^"]*AppHourlyItem_secondary[^>]*>([\s\S]*?)<\/span>/i);
            result.push({
                time: timeLabel,
                dateTime: dateTime,
                hour: parseInt(hourMatch[1], 10),
                temperature: temp,
                condition: condition ? text(condition[1]) : "",
                iconIndex: icon ? parseInt(icon[1], 10) : null,
                precipitationProbability: probability ? temperature(probability) : null
            });
        }
        return result;
    }

    function parseDays(html) {
        var result = [];
        var pattern = /<div class="[^"]*AppShortForecastDay_container[^>]*>/g;
        var matches = [];
        var match;
        while ((match = pattern.exec(html)) && matches.length < 11) {
            matches.push(match.index);
        }
        for (var i = 0; i < matches.length && i < 10; i++) {
            var block = html.substring(matches[i], i + 1 < matches.length ? matches[i + 1] : matches[i] + 1500);
            var title = field(block, /<span class="[^"]*AppShortForecastDay_title[^>]*>([\s\S]*?)<\/span>/i);
            var subtitle = field(block, /<span class="[^"]*AppShortForecastDay_subtitle[^>]*>([\s\S]*?)<\/span>/i);
            var temperatures = [];
            var icon = /AppShortForecastDay_icon[^\"]*" style="--icon:(\d+)"/.exec(block);
            var tempsPattern = /<span class="[^"]*AppShortForecastDay_temperature[^>]*>([\s\S]*?)<\/span>/g;
            var tempMatch;
            while ((tempMatch = tempsPattern.exec(block)) && temperatures.length < 2) {
                temperatures.push(temperature(text(tempMatch[1])));
            }
            if (title && temperatures.length === 2) {
                result.push({ title: title, subtitle: subtitle, high: temperatures[0], low: temperatures[1], iconIndex: icon ? parseInt(icon[1], 10) : null });
            }
        }
        return result;
    }

    function periodName(hour) {
        if (hour < 6) { return "Ночь"; }
        if (hour < 12) { return "Утро"; }
        if (hour < 18) { return "День"; }
        return "Вечер";
    }

    function parsePeriods(hours) {
        var groups = [];
        for (var i = 0; i < hours.length; i++) {
            if (hours[i].event) { continue; }
            var name = periodName(hours[i].hour);
            if (!groups.length || groups[groups.length - 1].name !== name) {
                groups.push({ name: name, hours: [] });
            }
            groups[groups.length - 1].hours.push(hours[i]);
        }
        var result = [];
        for (var j = 1; j < groups.length && result.length < 3; j++) {
            var group = groups[j];
            var point = group.hours[Math.floor(group.hours.length / 2)];
            result.push({ name: group.name, temperature: point.temperature, condition: point.condition, iconIndex: point.iconIndex, precipitationProbability: point.precipitationProbability });
        }
        return result;
    }

    function gaugeAppearance(block) {
        var uses = block.match(/<use\b[^>]*>/g) || [];
        var activeUse = uses.length > 1 ? uses[1] : "";
        var markerUse = uses.length > 2 ? uses[2] : "";
        var color = /stroke="var\((--[^)]+)\)"/.exec(activeUse);
        var tone = color ? color[1].replace(/^--parameter-/, "").replace(/^--text-secondary$/, "neutral") : "";
        var length = /--(?:line|gauge)-length:([\d.]+)px/.exec(block);
        var segment = /stroke-dasharray="55\.8 [\d.]+"/.test(activeUse) ? /stroke-dashoffset="(-?[\d.]+)"/.exec(activeUse) : null;
        var marker = /stroke-dasharray="0 210"/.test(markerUse) ? /stroke-dashoffset="(-?[\d.]+)"/.exec(markerUse) : null;
        return {
            tone: tone,
            length: length ? Number(length[1]) : null,
            segment: segment ? Math.round(Math.abs(Number(segment[1])) / 71.8) : null,
            markerOffset: marker ? Number(marker[1]) : null
        };
    }

    function wellbeing(html, label, numberClass) {
        var pattern = new RegExp('<li aria-label="[^"]*' + label + '[^"]*"[^>]*>([\\s\\S]*?)<\\/li>', 'i');
        var match = pattern.exec(html);
        if (!match) { return { value: null, description: "", gauge: gaugeAppearance("") }; }
        var number = field(match[1], new RegExp('<span class="[^"]*' + numberClass + '[^>]*>([\\s\\S]*?)<\\/span>', 'i'));
        var description = field(match[1], /<p class="[^"]*AppWellBeingCard_description__subtitle[^>]*>([\s\S]*?)<\/p>/i);
        return { value: temperature(number), description: description, gauge: gaugeAppearance(match[1]) };
    }

    function parseYandex(html) {
        if (typeof html !== "string" || html.length < 1000) {
            throw new Error("Пустой ответ Яндекса");
        }
        var fact = factFromPage(html);
        var factIcon = /(?:AppFact|FactWithoutCharacter)_condition__icon[^\"]*" style="--icon:(\d+)"/.exec(html);
        var condition = field(html, /<span class="[^"]*(?:AppFact|FactWithoutCharacter)_warning__first_text[^>]*>([\s\S]*?)<\/span>/i);
        var outlook = field(html, /<div class="[^"]*(?:AppFact|FactWithoutCharacter)_warning__second[^>]*>([\s\S]*?)<\/div>/i);
        if (!fact || typeof fact.temperature !== "number") {
            throw new Error("Яндекс изменил формат страницы");
        }
        var hours = parseHours(html);
        var days = parseDays(html);
        var uv = wellbeing(html, "УФ-индекс", "UvIndexRange_range__number");
        var magnetic = wellbeing(html, "Магнитные бури", "AppMagneticStormsRange_range__number");
        var pressureState = /<li aria-label="Давление[^\"]*:\s*([^\"]+)"/.exec(html);
        var pressureCard = /<li aria-label="Давление[^\"]*"[^>]*>([\s\S]*?)<\/li>/.exec(html);
        if (!hours.length || !days.length) {
            throw new Error("Прогноз Яндекса не найден на странице");
        }
        return {
            temperature: fact.temperatureInCelsius !== undefined ? fact.temperatureInCelsius : fact.temperature,
            placeName: parsePlaceName(html),
            feelsLike: fact.feelsLikeInCelsius !== undefined ? fact.feelsLikeInCelsius : fact.feelsLike,
            condition: condition || conditionName(fact.condition),
            outlook: outlook,
            conditionCode: fact.condition || "",
            iconIndex: factIcon ? parseInt(factIcon[1], 10) : null,
            wind: fact.windSpeedInMetersPerSecond !== undefined ? fact.windSpeedInMetersPerSecond : fact.windSpeed,
            windGust: fact.windGust,
            pressure: fact.pressure,
            pressureDescription: pressureState ? text(pressureState[1]) : "",
            pressureGauge: gaugeAppearance(pressureCard ? pressureCard[1] : ""),
            humidity: fact.humidity,
            uvIndex: uv.value,
            uvDescription: uv.description,
            uvGauge: uv.gauge,
            magneticIndex: magnetic.value,
            magneticDescription: magnetic.description,
            magneticGauge: magnetic.gauge,
            isNight: fact.daytime === "NIGHT",
            hours: hours,
            periods: parsePeriods(hours),
            days: days,
            updatedAt: new Date().getTime()
        };
    }

    function parseCoordinates(input) {
        var value = String(input || "").replace(/&amp;/g, "&").replace(/\\&/g, "&");
        var latMatch = /(?:[?&]|^)lat(?:itude)?=([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?=[&#\s"'<>]|$)/i.exec(value);
        var lonMatch = /(?:[?&]|^)lon(?:gitude)?=([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?=[&#\s"'<>]|$)/i.exec(value);
        var lat;
        var lon;
        if (latMatch && lonMatch) {
            lat = parseFloat(latMatch[1]);
            lon = parseFloat(lonMatch[1]);
        } else {
            var plain = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(value);
            if (!plain) { return null; }
            lat = parseFloat(plain[1]);
            lon = parseFloat(plain[2]);
        }
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return null;
        }
        return { lat: lat, lon: lon };
    }
    function weatherUrl(coordinates) {
        return "https://yandex.ru/pogoda/ru?lat=" + encodeURIComponent(coordinates.lat) + "&lon=" + encodeURIComponent(coordinates.lon);
    }

    function parsePlaceName(html) {
        if (typeof html !== "string") { return ""; }
        var heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        if (!heading) { return ""; }
        var detail = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(heading[1]);
        if (!detail) { return ""; }
        var location = text(detail[1]).replace(/^\s*\(\s*|\s*\)\s*$/g, "");
        if (!/[A-Za-zА-Яа-яЁё]{2}/.test(location) || /[сю]\.ш\.|[вз]\.д\./i.test(location)) { return ""; }
        var parts = location.split(",");
        return text(parts.slice(0, 2).join(", "));
    }

    root.WeatherParser = { parseYandex: parseYandex, parseCoordinates: parseCoordinates, parsePlaceName: parsePlaceName, weatherUrl: weatherUrl };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = root.WeatherParser;
    }
}(this));
