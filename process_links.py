import os
import re
import html
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser

class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = None
        self.description = None
        self.site_name = None
        self.in_title = False
        self.in_paragraph = False
        self.paragraphs = []
        self.current_paragraph = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'title':
            self.in_title = True
        elif tag == 'p':
            self.in_paragraph = True
            self.current_paragraph = []
        elif tag == 'meta':
            name = attrs_dict.get('name', '').lower()
            prop = attrs_dict.get('property', '').lower()
            content = attrs_dict.get('content', '')
            
            if name == 'description' or prop == 'og:description' or name == 'twitter:description':
                if not self.description:
                    self.description = content
            elif prop == 'og:site_name':
                if not self.site_name:
                    self.site_name = content

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        elif tag == 'p':
            self.in_paragraph = False
            p_text = "".join(self.current_paragraph).strip()
            if p_text and len(p_text) > 20:
                self.paragraphs.append(p_text)

    def handle_data(self, data):
        if self.in_title:
            if self.title is None:
                self.title = data.strip()
            else:
                self.title += " " + data.strip()
        elif self.in_paragraph:
            self.current_paragraph.append(data)

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def clean_weird_chars(text):
    if not text:
        return ""
    replacements = {
        '\u201c': '"', '\u201d': '"',
        '\u2018': "'", '\u2019': "'",
        '\u2013': '-', '\u2014': '-',
        '\u2022': '*',
        '\u00a0': ' ',
        '\u2026': '...',
        '\ufffd': ' ',
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text.strip()

def get_domain_publisher(url):
    try:
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        
        mapping = {
            "github.com": "GitHub",
            "youtube.com": "YouTube",
            "youtu.be": "YouTube",
            "hackaday.com": "Hackaday",
            "towardsdatascience.com": "Towards Data Science",
            "medium.com": "Medium",
            "x.com": "X",
            "twitter.com": "X",
            "reddit.com": "Reddit",
            "facebook.com": "Facebook",
            "sciencealert.com": "ScienceAlert",
            "tomshardware.com": "Tom's Hardware",
            "techradar.com": "TechRadar",
            "zdnet.com": "ZDNET",
            "euronews.com": "Euronews",
            "gq.com": "GQ",
            "archdaily.com": "ArchDaily",
            "huggingface.co": "Hugging Face",
            "observatornews.ro": "Observator News",
            "adevarul.ro": "Adevărul",
            "profit.ro": "Profit.ro",
            "digi24.ro": "Digi24",
            "m.digi24.ro": "Digi24",
            "antena3.ro": "Antena 3",
            "startupcafe.ro": "StartupCafe",
            "zf.ro": "Ziarul Financiar",
            "m.zf.ro": "Ziarul Financiar",
            "spotmedia.ro": "Spotmedia",
            "surubelcollect.ro": "Șurubel Collect",
            "megadoor.ro": "Mega Door",
            "zigrid.ro": "Zigrid",
            "mcagrup.ro": "MCA Grup",
            "oblonconfort.ro": "Oblon Confort"
        }
        for k, v in mapping.items():
            if k in domain:
                return v
        
        parts = domain.split('.')
        if len(parts) >= 2:
            return parts[-2].capitalize()
        return domain.capitalize()
    except Exception:
        return "Unknown"

def extract_items(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    items = []
    current_source = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if line.lower().startswith("source:"):
            current_source = line.replace("Source:", "").replace("source:", "").strip()
            continue
            
        urls = re.findall(r'https?://[^\s]+', line)
        
        if urls:
            for url in urls:
                title = line.replace(url, "").strip()
                item = {
                    "url": url,
                    "title": title if title else None,
                    "source": current_source if current_source else None
                }
                items.append(item)
            current_source = None
        else:
            current_source = line

    return items

def get_tags(url, title, desc, publisher):
    keywords_mapping = {
        "ai": "#AI", "artificial intelligence": "#AI", "intelligence artificial": "#AI",
        "llm": "#LLM", "large language model": "#LLM",
        "claude": "#AI", "gpt": "#AI", "gemini": "#AI", "deepseek": "#AI",
        "diffusion": "#GenerativeAI", "midjourney": "#GenerativeAI",
        "machine learning": "#MachineLearning", "deep learning": "#MachineLearning",
        "neural network": "#MachineLearning",
        "model": "#AIModel", "models": "#AIModel",
        "agent": "#AIAgents", "agents": "#AIAgents", "agentic": "#AIAgents",
        "prompt": "#PromptEngineering", "prompts": "#PromptEngineering",
        "code": "#Coding", "coding": "#Coding", "developer": "#Coding", "programming": "#Coding",
        "github": "#GitHub", "git": "#VersionControl", "version control": "#VersionControl",
        "python": "#Python", "javascript": "#JavaScript", "typescript": "#TypeScript", "rust": "#Rust",
        "docker": "#Docker", "container": "#Docker", "containers": "#Docker",
        "kubernetes": "#Kubernetes", "k8s": "#Kubernetes",
        "api": "#API", "apis": "#API", "mcp": "#MCP", "model context protocol": "#MCP",
        "web": "#WebDev", "website": "#WebDev", "app": "#Software", "apps": "#Software",
        "software": "#Software", "open source": "#OpenSource", "foss": "#OpenSource",
        "linux": "#Linux", "server": "#Server", "homelab": "#HomeLab", "hosting": "#Hosting",
        "nas": "#Storage", "synology": "#Storage",
        "home assistant": "#HomeAssistant", "hass": "#HomeAssistant", "ha": "#HomeAssistant",
        "smart home": "#SmartHome", "home automation": "#SmartHome",
        "iot": "#IoT", "internet of things": "#IoT",
        "esp32": "#Electronics", "arduino": "#Electronics", "raspberry pi": "#RaspberryPi", "raspbian": "#RaspberryPi",
        "sensor": "#IoT", "sensors": "#IoT", "lora": "#IoT", "lorawan": "#IoT",
        "3d print": "#3DPrinting", "3d printer": "#3DPrinting", "filament": "#3DPrinting", "bambu": "#3DPrinting",
        "hardware": "#Hardware", "robot": "#Robotics", "robotics": "#Robotics",
        "health": "#Health", "medicine": "#Health", "medical": "#Health", "doctor": "#Health", "spital": "#Health",
        "pacient": "#Health", "cancer": "#Health", "gastroenterolog": "#Health", "colon": "#Health",
        "microbiome": "#Microbiome", "gut": "#Microbiome", "bacterii": "#Microbiome",
        "osteoporosis": "#Health", "bones": "#Health", "vitamin": "#Health",
        "science": "#Science", "research": "#Research", "study": "#Research", "cercetare": "#Research",
        "romania": "#Romania", "român": "#Romania", "bucuresti": "#Romania", "romanian": "#Romania",
        "travel": "#Travel", "tourism": "#Travel", "turist": "#Travel", "hiking": "#Travel", "trail": "#Travel",
        "grecia": "#Travel", "greece": "#Travel", "plaje": "#Travel", "beach": "#Travel",
        "sua": "#Travel", "usa": "#Travel",
        "house": "#Home", "home": "#Home", "apartment": "#Home", "bloc": "#Home", "constructie": "#Home",
        "termopan": "#HouseImprovement", "gealan": "#HouseImprovement", "salamander": "#HouseImprovement",
        "ferestre": "#HouseImprovement", "usi": "#HouseImprovement", "door": "#HouseImprovement",
        "terasa": "#HouseImprovement", "balcon": "#HouseImprovement", "oblon": "#HouseImprovement",
        "sticla": "#HouseImprovement", "pergole": "#HouseImprovement", "rulouri": "#HouseImprovement",
        "heat pump": "#Energy", "panouri solare": "#Energy", "solar": "#Energy", "energie": "#Energy",
        "business": "#Business", "client": "#Business", "marketing": "#Business", "linkedin": "#Business",
        "finance": "#Finance", "bursa": "#Finance", "actiuni": "#Finance", "anaf": "#Finance", "tax": "#Finance",
        "factura": "#Finance", "e-factura": "#Finance",
        "news": "#News", "stiri": "#News", "protest": "#News", "politica": "#News",
        "video": "#Video", "youtube": "#YouTube", "play": "#Video", "movie": "#Video", "playback": "#Video",
        "vlc": "#Video", "mpv": "#Video"
    }
    
    tags = set()
    content = f"{url} {title or ''} {desc or ''} {publisher or ''}".lower()
    
    for kw, tag in keywords_mapping.items():
        if re.search(r'\b' + re.escape(kw) + r'\b', content):
            tags.add(tag)
            
    # Check for Romanian language indicators
    ro_words = ["și", "este", "sunt", "din", "pe", "cu", "la", "o", "un", "cât", "prin", "care"]
    if any(f" {w} " in content for w in ro_words) or ".ro" in url:
        tags.add("#Romania")
        
    # Expand to at least 3 tags using rules
    if len(tags) < 3:
        if "#HomeAssistant" in tags:
            tags.update(["#SmartHome", "#IoT", "#Hardware"])
        if "#AI" in tags or "#LLM" in tags:
            tags.update(["#Technology", "#MachineLearning", "#Software"])
        if "#Coding" in tags:
            tags.update(["#Software", "#Technology"])
        if "#Video" in tags or "#YouTube" in tags:
            tags.update(["#Media", "#Video"])
        if "#HouseImprovement" in tags or "#Home" in tags:
            tags.update(["#Home", "#HouseImprovement", "#Hardware"])
            
    # Universal fallback if still < 3
    fallbacks = ["#Technology", "#Resource", "#Article", "#Research", "#Internet"]
    for fb in fallbacks:
        if len(tags) >= 3:
            break
        tags.add(fb)
        
    # Keep between 3 and 5 tags
    sorted_tags = sorted(list(tags))
    if len(sorted_tags) > 5:
        sorted_tags = sorted_tags[:5]
        
    return " ".join(sorted_tags)

def split_into_sentences(text):
    if not text:
        return []
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [clean_text(s) for s in sentences if len(clean_text(s)) > 15]

def get_rich_summary(parser):
    all_sentences = []
    
    if parser.description:
        all_sentences.extend(split_into_sentences(parser.description))
        
    for p in parser.paragraphs:
        all_sentences.extend(split_into_sentences(p))
        
    filtered_sentences = []
    seen = set()
    
    noise_keywords = [
        "cookie", "privacy policy", "subscribe", "newsletter", "sign up", "written by", 
        "about the author", "all rights reserved", "copyright", "terms of service",
        "advertisement", "comment", "share this", "facebook", "twitter", "login", "register",
        "degree", "editor", "contributor", "writer", "lives in", "enjoys", "passionate about",
        "hobbies", "specializes", "freelance", "author", "pursue", "fascination"
    ]
    
    title_words = set(re.findall(r'\w+', (parser.title or "").lower()))
    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by", "of", "about", "is", "that", "it"}
    title_words = title_words - stop_words
    
    scored_sentences = []
    for s in all_sentences:
        s_lower = s.lower()
        if len(s) < 35 or len(s) > 200:
            continue
        if any(kw in s_lower for kw in noise_keywords):
            continue
        if s_lower in seen:
            continue
        seen.add(s_lower)
        
        s_words = set(re.findall(r'\w+', s_lower))
        score = len(title_words.intersection(s_words))
        scored_sentences.append((score, s))
        
    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored_sentences[:3]]

def process_item(item):
    url = item["url"]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    req = urllib.request.Request(url, headers=headers)
    
    final_url = url
    fetched_title = None
    fetched_desc = None
    fetched_site = None
    parser = MetadataParser()
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            final_url = response.geturl()
            charset = response.headers.get_content_charset() or 'utf-8'
            html_bytes = response.read()
            html_str = html_bytes.decode(charset, errors='ignore')
            parser.feed(html_str)
            
            fetched_title = clean_text(parser.title)
            fetched_desc = clean_text(parser.description)
            fetched_site = clean_text(parser.site_name)
    except Exception:
        pass

    title = item.get("title")
    if not title:
        title = fetched_title
    if not title:
        title = final_url
    title = clean_text(title)
    
    publisher = item.get("source")
    if not publisher:
        publisher = fetched_site
    if not publisher:
        publisher = get_domain_publisher(final_url)
    publisher = clean_text(publisher)
    
    summary_points = get_rich_summary(parser)
    
    # Fallbacks if summary is sparse
    if not summary_points:
        if fetched_desc:
            summary_points = split_into_sentences(fetched_desc)[:3]
        elif item.get("title"):
            summary_points = [item.get("title")]
            
    if len(summary_points) < 2:
        summary_points.append("See the full website for instructions, specifications, and related resources.")
    if len(summary_points) < 2:
        summary_points.append("Provides reference documentation and community guides.")
        
    formatted_points = []
    for pt in summary_points[:3]:
        pt = clean_weird_chars(pt)
        if not pt:
            continue
        if not pt[0].isupper():
            pt = pt[0].upper() + pt[1:]
        if not pt.endswith(('.', '!', '?')):
            pt = pt + '.'
        formatted_points.append(pt)
        
    tags = get_tags(final_url, title, fetched_desc or "", publisher)
    
    output_lines = []
    output_lines.append(f"- {tags}")
    output_lines.append(f"  link:: [{final_url}]")
    output_lines.append(f"  source:: [[{publisher}]]")
    output_lines.append(f"  - **{title}**")
    for pt in formatted_points:
        output_lines.append(f"    - {pt}")
        
    return "\n".join(output_lines)

def run_link_processor():
    base_dir = os.environ.get("OBSIDIAN_DIR", "./obsidian")
    input_file = os.environ.get("LINK_INPUT_FILE", os.path.join(base_dir, "Links.md"))
    json_file = os.path.join(base_dir, "enriched_links.json")
    processed_file = os.path.join(base_dir, "processed.md")
    
    items = []
    
    # Check if Links.md has items, else reload from enriched_links.json
    if os.path.exists(input_file) and os.path.getsize(input_file) > 0:
        print("Reading links from Links.md...")
        items = extract_items(input_file)
    elif os.path.exists(json_file):
        print("Links.md is empty. Loading original links from enriched_links.json for reprocessing...")
        with open(json_file, "r", encoding="utf-8") as f:
            items = json.load(f)
            
    if not items:
        print("No links found to process.")
        return
        
    print(f"Loaded {len(items)} links to process.")
    processed_blocks = []
    
    print("Processing and expanding links in parallel...")
    with ThreadPoolExecutor(max_workers=20) as executor:
        future_to_item = {executor.submit(process_item, item): item for item in items}
        for future in as_completed(future_to_item):
            try:
                block = future.result()
                processed_blocks.append(block)
            except Exception as e:
                print(f"Error processing item: {e}")
                
    output_content = "\n\n\n".join(processed_blocks)
    
    # Overwrite processed.md to cleanly replace the old bad run
    print(f"Writing output to {processed_file}...")
    with open(processed_file, "w", encoding="utf-8") as f:
        f.write(output_content + "\n")
        
    # Clear Links.md
    if os.path.exists(input_file):
        print("Clearing Links.md...")
        with open(input_file, "w", encoding="utf-8") as f:
            pass
            
    print("Success! Processed data written to processed.md")

if __name__ == "__main__":
    run_link_processor()