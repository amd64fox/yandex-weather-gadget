var SettingsPage = (function () {
    var locations = [{ name: "Харьковка, Оршанский район", lat: 54.44190663514991, lon: 30.41421211633299 }];
    var active = 0;
    var results = [];
    var editingLocation = -1;
    var citySearchTimer = null;
    var citySearchRequest = null;
    var typedCity = "";

    function element(id) { return document.getElementById(id); }
    function read(key) { return System.Gadget.Settings.readString(key); }
    function write(key, value) {
        var text = String(value);
        if (read(key) !== text) { System.Gadget.Settings.writeString(key, text); }
    }
    function status(message) { element("status").innerText = message; }
    function option(label, value) {
        var item = document.createElement("option");
        item.text = label;
        item.value = value;
        return item;
    }
    function displayLocations() {
        var list = element("saved");
        list.options.length = 0;
        for (var i = 0; i < locations.length; i++) {
            list.add(option((i === active ? "● " : "") + locations[i].name, i));
        }
        list.selectedIndex = active;
    }
    function load() {
        var count = parseInt(read("locationCount"), 10);
        var saved = [];
        if (count > 0 && count <= 10) {
            for (var i = 0; i < count; i++) {
                var name = read("location" + i + "Name");
                var lat = parseFloat(read("location" + i + "Lat"));
                var lon = parseFloat(read("location" + i + "Lon"));
                if (name && !isNaN(lat) && !isNaN(lon)) {
                    saved.push({ name: name, lat: lat, lon: lon, autoName: read("location" + i + "AutoName") === "true" });
                }
            }
        }
        if (saved.length) { locations = saved; }
        active = parseInt(read("activeLocation"), 10) || 0;
        if (active >= locations.length) { active = 0; }
        displayLocations();
        element("units").value = read("units") || "C";
        element("intervalMinutes").value = read("intervalMinutes") || "30";
        element("animateWeather").checked = read("animateWeather") !== "false";
    }
    function cityQuery() { return element("city").value.replace(/^\s+|\s+$/g, ""); }
    function cancelCitySearch() {
        if (citySearchTimer !== null) { clearTimeout(citySearchTimer); citySearchTimer = null; }
        if (citySearchRequest) {
            var request = citySearchRequest;
            citySearchRequest = null;
            request.abort();
        }
    }
    function clearCityResults() {
        results = [];
        element("results").options.length = 0;
    }
    function citySearchFailed() { status("Поиск недоступен — вставьте ссылку или координаты"); }
    function showCityResults(error, response) {
        citySearchRequest = null;
        if (error) { citySearchFailed(); return; }
        try {
            results = JSON.parse(response).results || [];
            var list = element("results");
            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                list.add(option(result.name + (result.admin1 ? ", " + result.admin1 : "") + (result.country ? ", " + result.country : ""), i));
            }
            list.selectedIndex = -1;
            status(results.length ? "Выберите найденное место" : "Город не найден — вставьте ссылку или координаты");
        } catch (error) { clearCityResults(); citySearchFailed(); }
    }
    function searchCity() {
        var query = cityQuery();
        cancelCitySearch();
        clearCityResults();
        typedCity = query;
        if (query.length < 2) { status("Введите хотя бы 2 буквы"); return; }
        status("Ищу города...");
        try {
            var url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(query) + "&count=8&language=ru&format=json";
            citySearchRequest = WeatherHttp.getUncompressed(url, 30000, showCityResults);
        } catch (error) { cancelCitySearch(); citySearchFailed(); }
    }
    function queueCitySearch() {
        var query = cityQuery();
        if (query === typedCity) { return; }
        typedCity = query;
        cancelCitySearch();
        clearCityResults();
        if (query.length < 3) {
            status(query ? "Для подсказок введите хотя бы 3 буквы" : "Выберите место и нажмите ОК");
            return;
        }
        citySearchTimer = setTimeout(searchCity, 350);
    }
    function chooseResult() {
        var index = element("results").selectedIndex;
        if (index < 0 || !results[index]) { return; }
        var result = results[index];
        element("coords").value = result.latitude + ", " + result.longitude;
        element("placeName").value = result.name + (result.admin1 ? ", " + result.admin1 : "");
        status("Координаты заполнены — нажмите «Добавить»");
    }
    function coordinateName(point) { return "Точка " + point.lat.toFixed(3) + ", " + point.lon.toFixed(3); }
    function addLocation() {
        var coordinates = WeatherParser.parseCoordinates(element("coords").value);
        if (!coordinates) { status("Нужна ссылка с lat/lon или две координаты через запятую"); return; }
        if (locations.length >= 10) { status("Можно сохранить до 10 мест"); return; }
        var name = element("placeName").value.replace(/^\s+|\s+$/g, "");
        closeLocationEditor();
        locations.push({ name: name ? name.substring(0, 75) : coordinateName(coordinates), lat: coordinates.lat, lon: coordinates.lon, autoName: !name });
        active = locations.length - 1;
        displayLocations();
        element("coords").value = "";
        element("placeName").value = "";
        status("Место добавлено. Нажмите ОК для сохранения");
    }
    function closeLocationEditor() {
        editingLocation = -1;
        element("editBackdrop").style.display = "none";
        element("editPanel").style.display = "none";
        element("editName").value = "";
        element("editCoords").value = "";
    }
    function editLocation() {
        var selected = element("saved").selectedIndex;
        if (selected < 0 || !locations[selected]) { return; }
        editingLocation = selected;
        element("editName").value = locations[selected].name;
        element("editCoords").value = WeatherParser.weatherUrl(locations[selected]);
        element("editMessage").innerText = "Ссылка должна содержать lat и lon";
        element("editBackdrop").style.display = "block";
        element("editPanel").style.display = "block";
        element("editName").focus();
        element("editName").select();
    }
    function saveLocation() {
        if (editingLocation < 0 || !locations[editingLocation]) { return true; }
        var name = element("editName").value.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").substring(0, 75);
        if (!name) { element("editMessage").innerText = "Введите название места"; element("editName").focus(); return false; }
        var coordinates = WeatherParser.parseCoordinates(element("editCoords").value);
        if (!coordinates) {
            element("editMessage").innerText = "Вставьте ссылку с lat и lon или введите две координаты";
            element("editCoords").focus();
            return false;
        }
        var selected = editingLocation;
        var autoName = locations[selected].autoName && name === locations[selected].name;
        locations[selected] = { name: autoName ? coordinateName(coordinates) : name, lat: coordinates.lat, lon: coordinates.lon, autoName: autoName };
        closeLocationEditor();
        displayLocations();
        element("saved").selectedIndex = selected;
        status("Место изменено. Нажмите ОК для сохранения");
        return true;
    }
    function activate() {
        var selected = element("saved").selectedIndex;
        if (selected < 0) { return; }
        closeLocationEditor();
        active = selected;
        displayLocations();
        status("Выбрано: " + locations[active].name);
    }
    function remove() {
        var selected = element("saved").selectedIndex;
        if (selected < 0) { return; }
        if (locations.length === 1) { status("Должно остаться хотя бы одно место"); return; }
        closeLocationEditor();
        locations.splice(selected, 1);
        if (selected < active) { active--; }
        if (active >= locations.length) { active = locations.length - 1; }
        displayLocations();
        status("Место удалено. Нажмите ОК для сохранения");
    }
    function closing(event) {
        if (event.closeAction == event.Action.commit) {
            if (!locations.length) { event.cancel = true; return; }
            if (!saveLocation()) { event.cancel = true; return; }
            write("locationCount", locations.length);
            for (var i = 0; i < locations.length; i++) {
                write("location" + i + "Name", locations[i].name);
                write("location" + i + "Lat", locations[i].lat);
                write("location" + i + "Lon", locations[i].lon);
                write("location" + i + "AutoName", locations[i].autoName === true);
            }
            write("activeLocation", active);
            write("units", element("units").value);
            write("intervalMinutes", element("intervalMinutes").value);
            write("animateWeather", element("animateWeather").checked);
        }
        cancelCitySearch();
        event.cancel = false;
    }
    function editorKeyDown(event) {
        var key = (event || window.event).keyCode;
        if (key === 13) { saveLocation(); return false; }
        if (key === 27) { closeLocationEditor(); return false; }
    }
    function showAbout(open) {
        if (editingLocation >= 0) { return; }
        document.body.className = open ? "show-about" : "";
        element(open ? "backToSettings" : "openAbout").focus();
    }
    function start() {
        System.Gadget.onSettingsClosing = closing;
        element("gadgetVersion").innerText = "Версия " + System.Gadget.version.replace(/^(\d+\.\d+\.\d+)\.0$/, "$1");
        element("openAbout").onclick = function () { showAbout(true); };
        element("backToSettings").onclick = function () { showAbout(false); };
        load();
        element("search").onclick = searchCity;
        element("results").onchange = chooseResult;
        element("add").onclick = addLocation;
        element("activate").onclick = activate;
        element("edit").onclick = editLocation;
        element("saveEdit").onclick = saveLocation;
        element("cancelEdit").onclick = closeLocationEditor;
        element("remove").onclick = remove;
        element("saved").onchange = closeLocationEditor;
        element("editName").onkeydown = editorKeyDown;
        element("editCoords").onkeydown = editorKeyDown;
        var city = element("city");
        city.oninput = queueCitySearch;
        city.onpropertychange = function (event) {
            if ((event || window.event).propertyName === "value") { queueCitySearch(); }
        };
        city.onkeydown = function (event) { if ((event || window.event).keyCode === 13) { searchCity(); return false; } };
    }
    return { start: start };
}());
