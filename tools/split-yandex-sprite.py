from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET


directory = Path(__file__).parent
source = ET.parse(directory / "yandex-weather-sprite.svg").getroot()
ET.register_namespace("", "http://www.w3.org/2000/svg")

for name, retained in (("base", {0, 1, *range(15, 27)}), ("precip", set(range(15)))):
    sprite = deepcopy(source)
    for index, child in reversed(list(enumerate(sprite))):
        if index not in retained:
            sprite.remove(child)
    ET.ElementTree(sprite).write(directory / f"yandex-weather-{name}.svg", encoding="unicode")
