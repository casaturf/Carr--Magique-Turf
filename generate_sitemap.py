import requests
import xml.etree.ElementTree as ET
from datetime import datetime

GITHUB_USER = "casaturf"
GITHUB_REPO = "Carr--Magique-Turf"
BASE_URL = "https://carremagique-turf.com"
BRANCH = "main"

def get_all_files():
    api_url = f"https://api.github.com/repos/{GITHUB_USER}/{GITHUB_REPO}/git/trees/{BRANCH}?recursive=1"
    response = requests.get(api_url)
    response.raise_for_status()
    tree = response.json().get("tree", [])
    files = [item["path"] for item in tree if item["type"] == "blob"]
    return files

def build_sitemap(files):
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Page racine
    url = ET.SubElement(urlset, "url")
    ET.SubElement(url, "loc").text = f"{BASE_URL}/"
    ET.SubElement(url, "lastmod").text = today
    ET.SubElement(url, "changefreq").text = "hourly"
    ET.SubElement(url, "priority").text = "1.0"

    for path in files:
        # Exclure fichiers cachés, workflows, scripts Python, sitemap lui-même
        if any(path.startswith(p) for p in [".github", ".git"]):
            continue
        if path in ["generate_sitemap.py", "sitemap.xml"]:
            continue

        loc = f"{BASE_URL}/{path}"
        url = ET.SubElement(urlset, "url")
        ET.SubElement(url, "loc").text = loc
        ET.SubElement(url, "lastmod").text = today
        ET.SubElement(url, "changefreq").text = "hourly"
        ET.SubElement(url, "priority").text = "0.8"

    tree = ET.ElementTree(urlset)
    ET.indent(tree, space="  ")
    tree.write("sitemap.xml", encoding="UTF-8", xml_declaration=True)
    print(f"sitemap.xml généré avec {len(files)} fichiers.")

if __name__ == "__main__":
    files = get_all_files()
    build_sitemap(files)
