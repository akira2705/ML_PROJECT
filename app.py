import json
import os
import re
import tempfile
import asyncio
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import matplotlib.pyplot as plt
import numpy as np
import requests
import streamlit as st
import tensorflow as tf
from bs4 import BeautifulSoup
try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    PLAYWRIGHT_AVAILABLE = False

st.set_page_config(page_title="AI Purchase Decision", layout="wide")

# Playwright needs subprocess support on Windows; force Proactor loop policy.
if os.name == "nt":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

# Ensure a writable temp directory exists for subprocess-based tools (Playwright/TensorFlow).
RUNTIME_TMP_DIR = Path(".runtime_tmp")
RUNTIME_TMP_DIR.mkdir(exist_ok=True)
os.environ["TMP"] = str(RUNTIME_TMP_DIR.resolve())
os.environ["TEMP"] = str(RUNTIME_TMP_DIR.resolve())
os.environ["TMPDIR"] = str(RUNTIME_TMP_DIR.resolve())
tempfile.tempdir = str(RUNTIME_TMP_DIR.resolve())

st.markdown(
    """
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;500;700&display=swap');
html, body, [class*="css"] { font-family: 'Poppins', sans-serif; }
.stApp { background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: white; }
.title { font-size: 50px; font-weight: 700; text-align: center; color: #c9b6ff; animation: fadeIn 2s ease-in; }
.card { background: rgba(255,255,255,0.05); border-radius: 15px; padding: 30px; box-shadow: 0 0 40px rgba(0,0,0,0.3); backdrop-filter: blur(10px); }
.stButton button { background: linear-gradient(90deg,#7f5af0,#2cb67d); border: none; color: white; font-size: 18px; padding: 10px 30px; border-radius: 10px; }
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
""",
    unsafe_allow_html=True,
)

st.markdown("<div class='title'>AI Purchase Decision System</div>", unsafe_allow_html=True)
st.write("")

BUY_THRESHOLD = 0.60
WAIT_THRESHOLD = 0.50
SUPPORTED_DOMAINS = (
    "amazon.com",
    "amazon.in",
    "amazon.co.uk",
    "amazon.ca",
    "amazon.de",
    "amazon.fr",
    "amazon.it",
    "amazon.es",
    "amazon.ae",
    "amazon.com.au",
    "amazon.co.jp",
)


class SavedModelWrapper:
    def __init__(self, fn):
        self.fn = fn

    def predict(self, values):
        arr = np.asarray(values).reshape(-1, 1).astype(str)
        outputs = self.fn(input_layer=tf.constant(arr, dtype=tf.string))
        if isinstance(outputs, dict):
            key = next(iter(outputs))
            return outputs[key].numpy()
        return outputs.numpy()


def load_single_model(candidates):
    for candidate in candidates:
        path = Path(candidate)
        if not path.exists():
            continue

        if path.is_file() and path.suffix in {".keras", ".h5"}:
            return tf.keras.models.load_model(str(path))

        if path.is_dir():
            saved_model = tf.saved_model.load(str(path))
            serving_fn = saved_model.signatures["serving_default"]
            return SavedModelWrapper(serving_fn)

    return None


@st.cache_resource
def load_models():
    viability_model = load_single_model([
        "viability_model.keras",
        "product_viability_model.keras",
        "viability_savedmodel",
    ])
    if viability_model is None:
        raise FileNotFoundError("No viability model found.")

    regret_model = load_single_model([
        "regret_model.keras",
        "product_regret_model.keras",
        "regret_savedmodel",
    ])
    return viability_model, regret_model


viability_model, regret_model = load_models()


def get_product_content(url):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Connection": "keep-alive",
    }

    def clean_text(value):
        return re.sub(r"\s+", " ", value or "").strip()

    def fetch(target_url):
        resp = requests.get(target_url, headers=headers, timeout=15)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser"), resp.url, resp.text

    def is_bot_page(soup):
        text = clean_text(soup.get_text(" ", strip=True)).lower()
        blockers = [
            "sorry, we just need to make sure you're not a robot",
            "enter the characters you see below",
            "type the characters you see in this image",
        ]
        return any(marker in text for marker in blockers)

    def extract_from_json_ld(soup):
        texts = []
        star = None

        scripts = soup.select("script[type='application/ld+json']")
        for script in scripts:
            raw = script.string or script.get_text(" ", strip=True)
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except Exception:
                continue

            items = payload if isinstance(payload, list) else [payload]
            for item in items:
                if not isinstance(item, dict):
                    continue

                name = clean_text(item.get("name", ""))
                description = clean_text(item.get("description", ""))
                if name:
                    texts.append(name)
                if description:
                    texts.append(description)

                aggregate = item.get("aggregateRating")
                if isinstance(aggregate, dict):
                    rating_value = aggregate.get("ratingValue")
                    if rating_value is not None:
                        try:
                            star = max(0.0, min(5.0, float(rating_value)))
                        except (TypeError, ValueError):
                            pass

        return " ".join(texts), star

    def extract_text(soup):
        parts = []

        title_candidates = [
            soup.select_one("#productTitle"),
            soup.select_one("#title span"),
            soup.select_one("meta[property='og:title']"),
            soup.select_one("meta[name='title']"),
        ]
        for node in title_candidates:
            if not node:
                continue
            text = clean_text(node.get("content") if node.name == "meta" else node.get_text(" ", strip=True))
            if text:
                parts.append(text)
                break

        selectors = [
            "#feature-bullets li span.a-list-item",
            "#detailBullets_feature_div li span",
            "#productDescription p",
            "#productDescription",
            "#bookDescription_feature_div",
            "div[data-hook='review-collapsed'] span",
            "span[data-hook='review-body']",
        ]
        for selector in selectors:
            for node in soup.select(selector):
                text = clean_text(node.get_text(" ", strip=True))
                if text:
                    parts.append(text)

        json_ld_text, _ = extract_from_json_ld(soup)
        if json_ld_text:
            parts.append(json_ld_text)

        # Deduplicate while preserving order.
        seen = set()
        deduped = []
        for part in parts:
            key = part.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(part)

        return " ".join(deduped).strip()

    def extract_review_entries(soup, raw_html="", limit=60):
        texts = []
        ratings = []

        review_blocks = soup.select("div[data-hook='review']")
        for block in review_blocks:
            body = (
                block.select_one("span[data-hook='review-body'] span")
                or block.select_one("span[data-hook='review-body']")
                or block.select_one("div[data-hook='review-collapsed'] span")
            )
            if body:
                text = clean_text(body.get_text(" ", strip=True))
                if text:
                    texts.append(text)

            star = (
                block.select_one("i[data-hook='review-star-rating'] span.a-icon-alt")
                or block.select_one("i[data-hook='cmps-review-star-rating'] span.a-icon-alt")
                or block.select_one("span.a-icon-alt")
            )
            if star:
                match = re.search(
                    r"(\d+(?:\.\d+)?)\s*(?:out of\s*5|/\s*5)",
                    clean_text(star.get_text(" ", strip=True)),
                    re.IGNORECASE,
                )
                if match:
                    try:
                        ratings.append(max(1.0, min(5.0, float(match.group(1)))))
                    except ValueError:
                        pass

            if len(texts) >= limit:
                break

        if not texts:
            selectors = [
                "#cm-cr-dp-review-list span[data-hook='review-body'] span",
                "#cm-cr-dp-review-list span[data-hook='review-body']",
                "#reviews-medley-footer ~ div span[data-hook='review-body'] span",
                "#reviews-medley-footer ~ div span[data-hook='review-body']",
                "span[data-hook='review-body'] span",
                "span[data-hook='review-body']",
                "div[data-hook='review-collapsed'] span",
                "div[data-hook='review'] span.a-size-base.review-text",
            ]
            for selector in selectors:
                for node in soup.select(selector):
                    text = clean_text(node.get_text(" ", strip=True))
                    if text:
                        texts.append(text)
                    if len(texts) >= limit:
                        break
                if len(texts) >= limit:
                    break

        if raw_html:
            # Fallback: parse JSON-like snippets in page source when selectors are missing.
            if not texts:
                json_patterns = [
                    r'"reviewBody"\s*:\s*"([^"]+)"',
                    r'"reviewText"\s*:\s*"([^"]+)"',
                ]
                for pattern in json_patterns:
                    for hit in re.findall(pattern, raw_html):
                        decoded = clean_text(
                            hit.encode("utf-8", "ignore").decode("unicode_escape", "ignore")
                        )
                        decoded = decoded.replace("\\n", " ").replace('\\"', '"')
                        if decoded:
                            texts.append(decoded)
                        if len(texts) >= limit:
                            break
                    if len(texts) >= limit:
                        break

            if not ratings:
                for hit in re.findall(
                    r'"ratingValue"\s*:\s*"?([1-5](?:\.\d)?)"?',
                    raw_html,
                    flags=re.IGNORECASE,
                ):
                    try:
                        ratings.append(max(1.0, min(5.0, float(hit))))
                    except ValueError:
                        pass
                    if len(ratings) >= limit:
                        break

        return " ".join(texts[:limit]), ratings[:limit]

    def extract_reviews_with_playwright(target_url, review_url, limit=60):
        if not PLAYWRIGHT_AVAILABLE:
            return "", "Playwright not available."
        try:
            helper = """
import json
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
target_url = {target_url}
review_url = {review_url}
limit = {limit}
user_agent = {user_agent}
selectors = [
    "span[data-hook='review-body'] span",
    "span[data-hook='review-body']",
    "div[data-hook='review-collapsed'] span",
]
reviews = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context(user_agent=user_agent, locale="en-US")
        page = context.new_page()
        page.goto(review_url, wait_until="domcontentloaded", timeout=45000)
        if "robot" in page.content().lower():
            page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
        for _ in range(8):
            page.mouse.wheel(0, 4000)
            page.wait_for_timeout(500)
        for selector in selectors:
            for node in page.query_selector_all(selector):
                text = " ".join(node.inner_text().split())
                if text:
                    reviews.append(text)
                if len(reviews) >= limit:
                    break
            if len(reviews) >= limit:
                break
        browser.close()
    print(json.dumps({{"reviews": " ".join(reviews), "error": ""}}))
except PlaywrightTimeoutError:
    print(json.dumps({{"reviews": "", "error": "Playwright timed out while loading Amazon reviews."}}))
except Exception as exc:
    print(json.dumps({{"reviews": "", "error": "Playwright failed: {{}}: {{}}".format(type(exc).__name__, str(exc)[:180])}}))
""".format(
                target_url=repr(target_url),
                review_url=repr(review_url),
                limit=int(limit),
                user_agent=repr(headers["User-Agent"]),
            )
            proc = subprocess.run(
                [sys.executable, "-c", helper],
                capture_output=True,
                text=True,
                timeout=90,
            )
            if proc.returncode != 0:
                stderr = (proc.stderr or "").strip()
                return "", f"Playwright helper failed: {stderr[:200] if stderr else 'unknown error'}"
            payload = json.loads((proc.stdout or "").strip() or "{}")
            return payload.get("reviews", ""), payload.get("error", "")
        except subprocess.TimeoutExpired:
            return "", "Playwright timed out while loading Amazon reviews."
        except Exception as exc:
            return "", f"Playwright wrapper failed: {type(exc).__name__}: {str(exc)[:180]}"

    def extract_image_url(soup):
        image = soup.select_one("#landingImage") or soup.select_one("#imgTagWrapperId img")
        if image:
            for attr in ("data-old-hires", "src", "data-a-dynamic-image"):
                value = image.get(attr)
                if value:
                    return value.strip()

        for selector in ["meta[property='og:image']", "meta[name='twitter:image']"]:
            tag = soup.select_one(selector)
            if tag and tag.get("content"):
                return tag["content"].strip()

        return None

    def extract_star_rating(soup):
        nodes = [
            soup.select_one("span[data-hook='rating-out-of-text']"),
            soup.select_one("#acrPopover"),
            soup.select_one("i.a-icon-star span.a-icon-alt"),
        ]
        for node in nodes:
            if not node:
                continue
            text = clean_text(node.get_text(" ", strip=True))
            match = re.search(r"(\d+(?:\.\d+)?)\s*(?:out of\s*5|/\s*5)", text, re.IGNORECASE)
            if match:
                return max(0.0, min(5.0, float(match.group(1))))

        _, json_ld_star = extract_from_json_ld(soup)
        return json_ld_star

    raw_url = clean_text(url)
    if not raw_url:
        return "", "", None, None, [], "Please paste an Amazon product link."

    parsed = urlparse(raw_url)
    normalized = raw_url if parsed.scheme else f"https://{raw_url}"
    parsed_normalized = urlparse(normalized)
    domain = (parsed_normalized.netloc or "www.amazon.com").split(":")[0]
    core_domain = domain.lower().replace("www.", "")
    if not any(core_domain.endswith(supported) for supported in SUPPORTED_DOMAINS):
        return "", "", None, None, [], f"Unsupported site: {domain}. Please use an Amazon product link."

    asin_match = re.search(
        r"/(?:dp|gp/product|gp/aw/d|product-reviews|gp/offer-listing)/([A-Z0-9]{10})",
        normalized,
        re.IGNORECASE,
    )

    candidates = [normalized]
    if asin_match:
        asin = asin_match.group(1).upper()
        candidates = [
            f"https://{domain}/dp/{asin}",
            f"https://{domain}/gp/aw/d/{asin}",
            f"https://{domain}/product-reviews/{asin}/",
            f"https://{domain}/product-reviews/{asin}/?pageNumber=2",
            f"https://{domain}/product-reviews/{asin}/?pageNumber=3",
            normalized,
        ]

    last_note = ""
    debug_note = ""
    best_product_text = ""
    all_review_chunks = []
    all_review_ratings = []
    image_url = None
    star_rating = None

    for candidate in candidates:
        try:
            soup, final_url, raw_html = fetch(candidate)
            if is_bot_page(soup):
                last_note = "Amazon anti-bot page detected; using limited fallback text."
                continue

            is_review_page = "/product-reviews/" in final_url.lower() or "/product-reviews/" in candidate.lower()
            if is_review_page:
                review_text, review_ratings = extract_review_entries(soup, raw_html=raw_html)
                if review_text:
                    all_review_chunks.append(review_text)
                if review_ratings:
                    all_review_ratings.extend(review_ratings)
            else:
                product_text = extract_text(soup)
                if product_text and len(product_text) > len(best_product_text):
                    best_product_text = product_text
                # Main product pages often include a small review snippet block.
                preview_reviews, preview_ratings = extract_review_entries(
                    soup, raw_html=raw_html, limit=20
                )
                if preview_reviews:
                    all_review_chunks.append(preview_reviews)
                if preview_ratings:
                    all_review_ratings.extend(preview_ratings)

            if image_url is None:
                image_url = extract_image_url(soup)
            if star_rating is None:
                star_rating = extract_star_rating(soup)

            if not best_product_text and not all_review_chunks:
                last_note = f"Could not find expected content on: {final_url}"
        except requests.RequestException:
            last_note = f"Request failed for: {candidate}"
            continue

    # Deduplicate identical review chunks gathered from multiple endpoints.
    seen_chunks = set()
    unique_chunks = []
    for chunk in all_review_chunks:
        key = chunk.lower()
        if key in seen_chunks:
            continue
        seen_chunks.add(key)
        unique_chunks.append(chunk)

    combined_reviews = " ".join(unique_chunks).strip()
    unique_ratings = [float(x) for x in all_review_ratings if 1.0 <= float(x) <= 5.0]

    # Browser-rendered fallback for JS/lazy-loaded review blocks.
    if not combined_reviews and asin_match:
        asin = asin_match.group(1).upper()
        rendered_review_url = f"https://{domain}/product-reviews/{asin}/?pageNumber=1"
        rendered_reviews, pw_note = extract_reviews_with_playwright(normalized, rendered_review_url, limit=80)
        if rendered_reviews:
            combined_reviews = rendered_reviews
        elif pw_note:
            # Some runtimes do not support subprocesses required by Playwright.
            if "NotImplementedError" in pw_note:
                debug_note = "Browser automation not supported in this runtime. Used static extraction only."
            else:
                debug_note = pw_note

    combined_text = " ".join(
        part for part in [best_product_text, combined_reviews] if part
    ).strip()
    if combined_text:
        if debug_note:
            return combined_text, combined_reviews, image_url, star_rating, unique_ratings, debug_note
        return combined_text, combined_reviews, image_url, star_rating, unique_ratings, ""

    # Fallback so model can still run even if scraping is partially blocked.
    fallback_text = f"Amazon product page {normalized}"
    return fallback_text, "", None, None, [], (last_note or "Used fallback text because product details were unavailable.")


def analyze_review_sentiment(reviews_text):
    text = (reviews_text or "").lower()
    if not text:
        return 0.5, 0.0, 0.0, 0, 0, 0

    positive_terms = [
        "good", "great", "excellent", "amazing", "awesome", "best", "worth",
        "satisfied", "love", "fast", "perfect", "recommended", "reliable", "premium",
        "value for money", "works well", "impressed", "superb",
    ]
    negative_terms = [
        "bad", "poor", "worst", "waste", "broken", "defect",
        "defective", "return", "refund", "disappointed", "overheat", "lag",
        "not good", "not worth", "very slow", "failed", "fail", "crash",
        "heating issue", "stopped working", "dead on arrival",
    ]
    hard_negative_terms = [
        "dead on arrival", "stopped working", "refund", "return", "defective",
        "broken", "overheat", "crash",
    ]

    pos_hits = sum(len(re.findall(rf"\b{re.escape(term)}\b", text)) for term in positive_terms)
    neg_hits = sum(len(re.findall(rf"\b{re.escape(term)}\b", text)) for term in negative_terms)
    hard_neg_hits = sum(len(re.findall(rf"\b{re.escape(term)}\b", text)) for term in hard_negative_terms)
    total_hits = pos_hits + neg_hits
    if total_hits == 0:
        return 0.5, 0.0, 0.0, pos_hits, neg_hits, total_hits

    sentiment_signal = max(0.0, min(1.0, 0.5 + ((pos_hits - neg_hits) / (2.0 * total_hits))))
    negative_ratio = neg_hits / total_hits
    hard_negative_ratio = hard_neg_hits / total_hits
    return sentiment_signal, negative_ratio, hard_negative_ratio, pos_hits, neg_hits, total_hits


def analyze_individual_ratings(ratings):
    if not ratings:
        return 0.5, 0, None, 0.0
    arr = np.asarray(ratings, dtype=float)
    avg = float(np.mean(arr))
    low_share = float(np.mean(arr <= 2.0))
    high_share = float(np.mean(arr >= 4.0))
    signal = max(0.0, min(1.0, (avg / 5.0) - (0.20 * low_share) + (0.08 * high_share)))
    return signal, int(arr.size), avg, low_share


def compute_final_score(viability_score, regret_score, reviews_text, individual_ratings):
    model_signal = (viability_score + (1.0 - regret_score)) / 2.0
    review_signal, negative_ratio, hard_negative_ratio, pos_hits, neg_hits, total_hits = analyze_review_sentiment(reviews_text)
    individual_signal, individual_count, individual_avg, low_individual_share = analyze_individual_ratings(
        individual_ratings
    )

    if individual_count >= 3:
        base_score = (0.58 * model_signal) + (0.28 * review_signal) + (0.14 * individual_signal)
    else:
        base_score = (0.65 * model_signal) + (0.35 * review_signal)

    penalty = (0.10 * negative_ratio) + (0.18 * hard_negative_ratio) + (0.08 * low_individual_share)
    final_score = max(0.0, min(1.0, base_score - penalty))

    diagnostics = {
        "review_signal": review_signal,
        "negative_ratio": negative_ratio,
        "hard_negative_ratio": hard_negative_ratio,
        "positive_hits": pos_hits,
        "negative_hits": neg_hits,
        "total_hits": total_hits,
        "individual_rating_signal": individual_signal,
        "individual_rating_count": individual_count,
        "individual_rating_avg": individual_avg,
    }
    return final_score, model_signal, diagnostics


def decide_label(score, model_signal, diagnostics):
    negative_ratio = diagnostics["negative_ratio"]
    hard_negative_ratio = diagnostics["hard_negative_ratio"]
    total_hits = diagnostics["total_hits"]
    review_signal = diagnostics["review_signal"]
    individual_count = diagnostics["individual_rating_count"]
    individual_avg = diagnostics["individual_rating_avg"] or 0.0

    # Strong negative evidence: force DO NOT BUY.
    if total_hits >= 6 and (negative_ratio >= 0.62 or hard_negative_ratio >= 0.28):
        return "DO NOT BUY"
    if individual_count >= 4 and individual_avg <= 2.6:
        return "DO NOT BUY"
    if score < 0.46 and model_signal < 0.50:
        return "DO NOT BUY"

    # Positive-evidence path: strong review quality can directly unlock BUY.
    if (
        review_signal >= 0.62
        and negative_ratio < 0.42
        and hard_negative_ratio < 0.20
        and (individual_count < 4 or individual_avg >= 3.8)
        and score >= 0.56
    ):
        return "BUY"

    # BUY requires strong combined confidence and low negative evidence.
    if (
        score >= BUY_THRESHOLD
        and model_signal >= 0.51
        and negative_ratio < 0.50
        and hard_negative_ratio < 0.26
        and (individual_count < 4 or individual_avg >= 3.2)
    ):
        return "BUY"
    if score >= WAIT_THRESHOLD:
        return "WAIT"
    return "DO NOT BUY"


st.markdown("<div class='card'>", unsafe_allow_html=True)
url = st.text_input("Amazon Product Link")
predict = st.button("Analyze Product")
st.markdown("</div>", unsafe_allow_html=True)


if predict:
    with st.spinner("Analyzing Reviews..."):
        text, reviews_seen, product_image_url, _overall_rating, individual_ratings, extraction_note = get_product_content(url)
        if extraction_note:
            st.warning(extraction_note)
        if not text:
            st.stop()

        viability_score = float(viability_model.predict(np.array([text], dtype=object))[0][0])
        if regret_model is not None:
            regret_score = float(regret_model.predict(np.array([text], dtype=object))[0][0])
            regret_source = "model"
        else:
            regret_score = 1.0 - viability_score
            regret_source = "derived"

        final_score, model_signal, diagnostics = compute_final_score(
            viability_score, regret_score, reviews_seen, individual_ratings
        )
        decision = decide_label(final_score, model_signal, diagnostics)

    st.markdown("<div class='card'>", unsafe_allow_html=True)
    st.text_area(
        "Reviews Found",
        value=reviews_seen if reviews_seen else "No review text found on fetched review pages.",
        height=180,
        disabled=True,
    )
    st.subheader("Result")

    st.write("Viability Score:", round(viability_score, 3))
    st.write("Regret Score:", round(regret_score, 3))
    st.write("Model Signal:", round(model_signal, 3))
    if diagnostics["individual_rating_count"] > 0:
        st.write(
            "Individual Rating Avg (from reviews):",
            f"{diagnostics['individual_rating_avg']:.2f}/5 ({diagnostics['individual_rating_count']} reviews)",
        )
        st.write(
            "Individual Rating Signal:",
            round(diagnostics["individual_rating_signal"], 3),
        )
    st.write("Review Sentiment Signal:", round(diagnostics["review_signal"], 3))
    st.write("Negative Review Ratio:", round(diagnostics["negative_ratio"], 3))
    st.write("Hard Negative Ratio:", round(diagnostics["hard_negative_ratio"], 3))
    st.write(
        "Review Keyword Hits:",
        f"+{diagnostics['positive_hits']} / -{diagnostics['negative_hits']}",
    )

    st.write("Final Score:", round(final_score, 3))
    st.write("Recommendation:", decision)

    if regret_source == "derived":
        st.caption("No separate regret model file found. Regret is computed as 1 - viability.")
    else:
        st.caption("Final score blends model signal with Amazon rating.")

    st.caption(f"Decision thresholds: BUY >= {BUY_THRESHOLD:.2f}, WAIT >= {WAIT_THRESHOLD:.2f}.")

    if product_image_url:
        st.image(product_image_url, caption="Product Image", width=220)

    chart_viability = final_score
    chart_regret = 1.0 - final_score

    fig, ax = plt.subplots(figsize=(4.5, 2.8))
    ax.bar(["Viability", "Regret"], [chart_viability, chart_regret], color=["#2cb67d", "#ef4565"])
    ax.set_ylim(0, 1)
    ax.set_ylabel("Score")
    st.pyplot(fig)

    st.markdown("</div>", unsafe_allow_html=True)
