import asyncio
import json
import os
import re
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import tensorflow as tf
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── App ──
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Models (loaded once at startup) ──
MODEL_DIR = Path(os.environ.get("MODEL_DIR", str(Path(__file__).parent)))
print(f"Loading models from {MODEL_DIR} ...", flush=True)
viability_model = tf.keras.models.load_model(str(MODEL_DIR / "viability_model.keras"))
regret_model    = tf.keras.models.load_model(str(MODEL_DIR / "regret_model.keras"))
print("Models loaded.", flush=True)

# ── Pydantic ──
class PredictRequest(BaseModel):
    text: str

class AnalyzeRequest(BaseModel):
    url: str

# ── Constants ──
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SUPPORTED_DOMAINS = [
    "amazon.com","amazon.in","amazon.co.uk","amazon.ca","amazon.de",
    "amazon.fr","amazon.it","amazon.es","amazon.ae","amazon.com.au","amazon.co.jp",
]

POSITIVE_TERMS = [
    "good","great","excellent","amazing","awesome","best","worth",
    "satisfied","love","fast","perfect","recommended","reliable","premium",
    "value for money","works well","impressed","superb","works great",
    "works perfectly","happy","solid","sturdy","durable","genuine",
    "compatible","charges well","charges fast","quick charge",
]

NEGATIVE_TERMS = [
    "bad","poor","worst","terrible","horrible","awful","pathetic","useless",
    "garbage","trash","junk","cheap","flimsy","fragile","substandard","inferior",
    "low quality","poor quality","cheap quality","cheap feel","feels cheap",
    "broken","defective","defect","damaged","faulty","malfunction","malfunctioning",
    "not working","doesn't work","does not work","stopped working","quit working",
    "broke down","fell apart","came apart","broke apart","dead on arrival",
    "failed","failure","not functional","not durable","wore out","gave up",
    "jammed","stuck","won't move","cannot adjust","can't adjust",
    "falling down","not holding","gas spring failure","gas spring flaw",
    "rattling","rattles","makes noise","weird noise","strange noise","creaking",
    "overheat","overheated","overheating","heating issue","heating problem",
    "burning smell","burning","caught fire","fire hazard","electric shock",
    "short circuit","dangerous","safety hazard",
    "lag","lagging","slow","very slow","slow charging","charges slowly",
    "slow charger","not fast","drains","draining fast",
    "disappointed","disappointing","disappointment","regret","regretted",
    "not satisfied","not impressed","underwhelmed","below expectations",
    "not as described","not as advertised","misleading","false advertising",
    "not as expected","waste","waste of money","wasted money","money wasted",
    "not worth","not worth the money","not worth the price","overpriced",
    "never again","totally disappointed","very bad","so bad",
    "not recommended","don't recommend","would not recommend","cannot recommend",
    "avoid","do not buy","don't buy","1 star","one star","zero stars","0 stars",
    "fake","not genuine","duplicate","counterfeit","knockoff","scam","fraud",
    "not compatible","doesn't fit","wrong item","wrong product","missing parts",
    "return","refund","returned it","sent it back","asked for refund",
]

HARD_NEGATIVE_TERMS = [
    "dead on arrival","stopped working","defective","broken","not working",
    "doesn't work","does not work","malfunction","not functional","fell apart",
    "caught fire","fire hazard","electric shock","short circuit","dangerous",
    "burning","overheat","overheated","overheating","heating issue",
    "gas spring failure","gas spring flaw","jammed","cannot adjust",
    "not holding","falling down",
    "fake","counterfeit","scam","fraud","not genuine",
    "waste of money","do not buy","don't buy","totally disappointed",
    "would not recommend","never again","worst product",
    "refund","return",
]

# ─────────────────────────────────────────
# Scoring (mirrors scorer.ts exactly)
# ─────────────────────────────────────────
def count_matches(text: str, terms: list) -> int:
    total = 0
    for term in terms:
        total += len(re.findall(rf'\b{re.escape(term)}\b', text, re.IGNORECASE))
    return total

def analyze_sentiment(reviews_text: str) -> dict:
    text = (reviews_text or "").lower()
    if not text:
        return {"review_signal":0.5,"negative_ratio":0,"hard_negative_ratio":0,
                "positive_hits":0,"negative_hits":0,"total_hits":0}
    pos      = count_matches(text, POSITIVE_TERMS)
    neg      = count_matches(text, NEGATIVE_TERMS)
    hard_neg = count_matches(text, HARD_NEGATIVE_TERMS)
    total    = pos + neg
    if total == 0:
        return {"review_signal":0.5,"negative_ratio":0,"hard_negative_ratio":0,
                "positive_hits":pos,"negative_hits":neg,"total_hits":0}
    return {
        "review_signal":     max(0, min(1, 0.5 + (pos - neg) / (2 * total))),
        "negative_ratio":    neg / total,
        "hard_negative_ratio": hard_neg / total,
        "positive_hits":     pos,
        "negative_hits":     neg,
        "total_hits":        total,
    }

def analyze_ratings(ratings: list) -> dict:
    if not ratings:
        return {"signal":0.5,"count":0,"avg":None,"low_share":0}
    avg       = sum(ratings) / len(ratings)
    low_share = len([r for r in ratings if r <= 2]) / len(ratings)
    high_share= len([r for r in ratings if r >= 4]) / len(ratings)
    signal    = max(0, min(1, avg/5 - 0.2*low_share + 0.08*high_share))
    return {"signal":signal,"count":len(ratings),"avg":avg,"low_share":low_share}

def dampen(s: float) -> float:
    return 0.5 + (s - 0.5) * 0.65

def compute_final_score(viability: float, regret: float, reviews: str, ratings: list):
    raw_signal    = (viability + (1 - regret)) / 2
    dampened      = dampen(raw_signal)
    sentiment     = analyze_sentiment(reviews)
    rating_result = analyze_ratings(ratings)

    if rating_result["count"] >= 3:
        base = (0.35 * dampened +
                0.35 * sentiment["review_signal"] +
                0.30 * rating_result["signal"])
    else:
        base = 0.50 * dampened + 0.50 * sentiment["review_signal"]

    penalty = (0.12 * sentiment["negative_ratio"] +
               0.22 * sentiment["hard_negative_ratio"] +
               0.10 * rating_result["low_share"])

    final = max(0.0, min(1.0, base - penalty))

    diagnostics = {
        "review_signal":           sentiment["review_signal"],
        "negative_ratio":          sentiment["negative_ratio"],
        "hard_negative_ratio":     sentiment["hard_negative_ratio"],
        "positive_hits":           sentiment["positive_hits"],
        "negative_hits":           sentiment["negative_hits"],
        "total_hits":              sentiment["total_hits"],
        "individual_rating_signal":rating_result["signal"],
        "individual_rating_count": rating_result["count"],
        "individual_rating_avg":   rating_result["avg"],
    }
    return final, raw_signal, diagnostics

def decide_label(score: float, model_signal: float, d: dict) -> str:
    avg               = d.get("individual_rating_avg")
    has_ratings       = d["individual_rating_count"] >= 4
    has_keywords      = d["total_hits"] >= 8

    if has_ratings and avg is not None and avg <= 2.5:            return "DO NOT BUY"
    if has_keywords and d["negative_ratio"] >= 0.65:              return "DO NOT BUY"
    if has_keywords and d["hard_negative_ratio"] >= 0.40:         return "DO NOT BUY"
    if score < 0.44:                                              return "DO NOT BUY"

    pos_dominant = (d["negative_ratio"] < 0.30 and d["hard_negative_ratio"] < 0.12) \
                   if has_keywords else d["review_signal"] >= 0.65
    ratings_ok   = not has_ratings or (avg is not None and avg >= 3.6)

    if score >= 0.60 and pos_dominant and ratings_ok:             return "BUY"
    if score >= 0.50:                                             return "WAIT"
    return "DO NOT BUY"

# ─────────────────────────────────────────
# ML inference
# ─────────────────────────────────────────
def run_inference(text: str):
    arr = np.array([text], dtype=object)
    v = float(viability_model.predict(arr, verbose=0)[0][0])
    r = float(regret_model.predict(arr, verbose=0)[0][0])
    return v, r

# ─────────────────────────────────────────
# Scraper helpers
# ─────────────────────────────────────────
def clean(s: str) -> str:
    return re.sub(r'\s+', ' ', s or "").strip()

def is_bot_page(soup: BeautifulSoup, raw_html: str) -> bool:
    text = soup.get_text().lower()
    h    = raw_html.lower()
    return (
        "sorry, we just need to make sure you're not a robot" in text or
        "enter the characters you see below" in text or
        "robot check" in text or
        "automated access" in text or
        "api-services-support@amazon" in text or
        "service unavailable" in text or
        "request was throttled" in text or
        (len(raw_html) < 5000 and "producttitle" not in h and "product-reviews" not in h) or
        ("sign in" in text and "password" in text and 'data-hook="review"' not in h)
    )

def extract_reviews_from_soup(soup: BeautifulSoup, limit: int = 100):
    texts, ratings = [], []
    for block in soup.find_all("div", {"data-hook": "review"}):
        body = (block.find("div", {"data-hook": "reviewRichContentContainer"}) or
                block.find("span", {"data-hook": "review-body"}))
        if body:
            t = clean(body.get_text())
            if t:
                title_el = block.find(["h5","span"], {"data-hook": re.compile("review-title|reviewTitle")})
                title    = clean(title_el.get_text()) if title_el else ""
                texts.append(f"{title}: {t}" if title else t)

        star_el = block.find("i", {"data-hook": "review-star-rating"})
        if star_el:
            alt = star_el.find("span", class_="a-icon-alt")
            if alt:
                m = re.search(r'(\d+(?:\.\d+)?)\s*out of', alt.get_text(), re.IGNORECASE)
                if m:
                    v = float(m.group(1))
                    if 1 <= v <= 5:
                        ratings.append(v)
        if len(texts) >= limit:
            break

    # fallback: bare reviewRichContentContainer divs
    if not texts:
        for el in soup.find_all("div", {"data-hook": "reviewRichContentContainer"}):
            t = clean(el.get_text())
            if t:
                texts.append(t)
            if len(texts) >= limit:
                break

    # JSON embedded fallback
    if not texts:
        raw = str(soup)
        for pattern in [r'"reviewBody"\s*:\s*"([^"]+)"', r'"reviewText"\s*:\s*"([^"]+)"']:
            for m in re.finditer(pattern, raw):
                t = clean(m.group(1)).replace("\\n"," ").replace('\\"','"')
                if t:
                    texts.append(t)
                if len(texts) >= limit:
                    break

    return texts[:limit], ratings[:limit]

def extract_image(soup: BeautifulSoup) -> Optional[str]:
    img = soup.find("img", id="landingImage") or soup.select_one("#imgTagWrapperId img")
    if img:
        for attr in ["data-old-hires","src"]:
            v = img.get(attr,"").strip()
            if v:
                return v
    og = soup.find("meta", property="og:image")
    return (og.get("content","").strip() or None) if og else None

def extract_star(soup: BeautifulSoup) -> Optional[float]:
    for el in [
        soup.find("span", {"data-hook":"rating-out-of-text"}),
        soup.find(id="acrPopover"),
        soup.find("i", class_="a-icon-star"),
    ]:
        if el:
            m = re.search(r'(\d+(?:\.\d+)?)\s*out of', el.get_text(), re.IGNORECASE)
            if m:
                return max(0.0, min(5.0, float(m.group(1))))
    return None

# ─────────────────────────────────────────
# Playwright scraper
# ─────────────────────────────────────────
EXTRACT_JS = """(limit) => {
    const texts = [], ratings = [];
    for (const block of document.querySelectorAll("div[data-hook='review']")) {
        const body = block.querySelector("div[data-hook='reviewRichContentContainer']") ||
                     block.querySelector("span[data-hook='review-body']");
        if (body) {
            const t = (body.innerText||'').replace(/\\s+/g,' ').trim();
            if (t.length > 8) texts.push(t);
        }
        const star = block.querySelector("i[data-hook='review-star-rating'] span.a-icon-alt") ||
                     block.querySelector("span.a-icon-alt");
        if (star) {
            const m = (star.textContent||'').match(/(\\d+(?:\\.\\d+)?)\\s*out of/i);
            if (m) { const v=parseFloat(m[1]); if(v>=1&&v<=5) ratings.push(v); }
        }
        if (texts.length >= limit) break;
    }
    return { texts, ratings };
}"""

async def scrape_with_playwright(product_url: str, asin: str, origin: str, limit: int = 120):
    try:
        from playwright.async_api import async_playwright
        print("[Playwright] Launching...", flush=True)
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox","--disable-dev-shm-usage",
                      "--disable-blink-features=AutomationControlled"]
            )
            ctx = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                locale="en-US",
                viewport={"width":1280,"height":900},
                extra_http_headers={"Accept-Language":"en-US,en;q=0.9"}
            )
            await ctx.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
                "window.chrome={runtime:{}};"
            )
            page = await ctx.new_page()
            all_texts, all_ratings = [], []
            image_url, star_rating = None, None

            # 1. Load product page
            await page.goto(product_url, wait_until="domcontentloaded", timeout=50000)
            await page.wait_for_timeout(2500)

            snippet = await page.evaluate("()=>document.body.innerText.slice(0,600).toLowerCase()")
            if "sign in" in snippet and "mobile number" in snippet:
                print("[Playwright] Login wall — aborting", flush=True)
                await browser.close()
                return [], [], None, None

            # Grab image + star from product page
            image_url = await page.evaluate("""()=>{
                const img=document.querySelector('#landingImage,#imgTagWrapperId img');
                if(img) return img.getAttribute('data-old-hires')||img.src||null;
                const og=document.querySelector("meta[property='og:image']");
                return og?og.content:null;
            }""")
            star_rating = await page.evaluate("""()=>{
                const el=document.querySelector("span[data-hook='rating-out-of-text'],#acrPopover");
                if(!el) return null;
                const m=el.innerText.match(/(\\d+(?:\\.\\d+)?)\\s*out of/i);
                return m?parseFloat(m[1]):null;
            }""")

            # 2. Scroll to load product-page reviews
            for _ in range(18):
                await page.mouse.wheel(0, 600)
                await page.wait_for_timeout(200)
                if await page.locator("div[data-hook='review']").count() > 0:
                    break
            await page.wait_for_timeout(1000)

            result = await page.evaluate(EXTRACT_JS, limit)
            all_texts.extend(result["texts"])
            all_ratings.extend(result["ratings"])
            print(f"[Playwright] Product page: {len(all_texts)} reviews", flush=True)

            # 3. Navigate to review pages in the same session (has cookies)
            review_urls = [
                f"{origin}/product-reviews/{asin}/?pageNumber=1",
                f"{origin}/product-reviews/{asin}/?pageNumber=2",
                f"{origin}/product-reviews/{asin}/?pageNumber=3",
                f"{origin}/product-reviews/{asin}/?filterByStar=critical&pageNumber=1",
            ]
            for r_url in review_urls:
                if len(all_texts) >= limit:
                    break
                try:
                    await page.goto(r_url, wait_until="domcontentloaded", timeout=20000)
                    await page.wait_for_timeout(1800)
                    s = await page.evaluate("()=>document.body.innerText.slice(0,300).toLowerCase()")
                    if any(w in s for w in ["robot","captcha","sign in"]):
                        print(f"[Playwright] Blocked on {r_url}", flush=True)
                        break
                    try:
                        await page.wait_for_selector("div[data-hook='review']", timeout=6000)
                    except:
                        pass
                    r = await page.evaluate(EXTRACT_JS, limit - len(all_texts))
                    print(f"[Playwright] {r_url}: {len(r['texts'])} reviews", flush=True)
                    all_texts.extend(r["texts"])
                    all_ratings.extend(r["ratings"])
                    await page.wait_for_timeout(1000)
                except Exception as e:
                    print(f"[Playwright] Error {r_url}: {e}", flush=True)

            await browser.close()
            return all_texts, all_ratings, image_url, star_rating

    except Exception as e:
        print(f"[Playwright] Fatal: {e}", flush=True)
        return [], [], None, None

# ─────────────────────────────────────────
# Main scrape orchestrator
# ─────────────────────────────────────────
async def scrape_product(raw_url: str) -> dict:
    normalized  = raw_url if raw_url.startswith("http") else f"https://{raw_url}"
    parsed      = httpx.URL(normalized)
    domain      = parsed.host.replace("www.", "")

    if not any(domain.endswith(d) for d in SUPPORTED_DOMAINS):
        return {"error": f"Unsupported domain: {domain}"}

    asin_match = re.search(
        r'/(?:dp|gp/product|gp/aw/d|product-reviews|gp/offer-listing)/([A-Z0-9]{10})',
        normalized, re.IGNORECASE
    )

    all_review_chunks: list[str] = []
    all_ratings:       list[float] = []
    best_product_text  = ""
    image_url          = None
    star_rating        = None

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        if asin_match:
            asin   = asin_match.group(1).upper()
            origin = f"https://{parsed.host}"
            candidates = [
                f"{origin}/dp/{asin}",
                f"{origin}/product-reviews/{asin}/?pageNumber=1",
                f"{origin}/product-reviews/{asin}/?pageNumber=2",
                f"{origin}/product-reviews/{asin}/?pageNumber=3",
                f"{origin}/product-reviews/{asin}/?filterByStar=critical&pageNumber=1",
                normalized,
            ]
        else:
            asin, origin = None, None
            candidates = [normalized]

        for url in candidates:
            try:
                res = await client.get(url, headers=HEADERS)
                if not res.is_success:
                    continue
                raw_html = res.text
                soup     = BeautifulSoup(raw_html, "html.parser")
                if is_bot_page(soup, raw_html):
                    print(f"[Scraper] Bot page: {url}", flush=True)
                    continue

                is_review_page = "/product-reviews/" in url
                if is_review_page:
                    texts, ratings = extract_reviews_from_soup(soup)
                    all_review_chunks.extend(texts)
                    all_ratings.extend(ratings)
                else:
                    # Product page — grab description
                    parts = []
                    title_el = soup.find(id="productTitle")
                    if title_el:
                        parts.append(clean(title_el.get_text()))
                    for sel in ["#feature-bullets li span.a-list-item","#productDescription p"]:
                        for el in soup.select(sel):
                            t = clean(el.get_text())
                            if t:
                                parts.append(t)
                    pt = " ".join(parts)
                    if len(pt) > len(best_product_text):
                        best_product_text = pt
                    texts, ratings = extract_reviews_from_soup(soup, limit=30)
                    all_review_chunks.extend(texts)
                    all_ratings.extend(ratings)

                if not image_url:  image_url  = extract_image(soup)
                if not star_rating: star_rating = extract_star(soup)

            except Exception as e:
                print(f"[Scraper] Error {url}: {e}", flush=True)

    # Deduplicate
    seen, deduped = set(), []
    for chunk in all_review_chunks:
        k = chunk.lower().strip()
        if k not in seen:
            seen.add(k)
            deduped.append(chunk)

    reviews            = " ".join(deduped).strip()
    individual_ratings = [r for r in all_ratings if 1 <= r <= 5]

    # Playwright fallback when static got < 8 reviews
    if len(individual_ratings) < 8 and asin:
        print(f"[Scraper] Only {len(individual_ratings)} static reviews — launching Playwright", flush=True)
        pw_texts, pw_ratings, pw_img, pw_star = await scrape_with_playwright(
            normalized, asin, origin, limit=120
        )
        if pw_texts:
            for t in pw_texts:
                if t.lower() not in seen:
                    seen.add(t.lower())
                    deduped.append(t)
            reviews = " ".join(deduped).strip()
            individual_ratings = individual_ratings + pw_ratings
        if not image_url  and pw_img:  image_url  = pw_img
        if not star_rating and pw_star: star_rating = pw_star

    combined = " ".join(filter(None, [best_product_text, reviews])).strip() \
               or f"Amazon product page {normalized}"

    return {
        "combined_text":      combined,
        "reviews":            reviews,
        "image_url":          image_url,
        "star_rating":        star_rating,
        "individual_ratings": individual_ratings,
    }

# ─────────────────────────────────────────
# SSE streaming endpoint
# ─────────────────────────────────────────
def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"

async def analysis_generator(url: str):
    try:
        # Step 1 — fetch
        yield sse({"step":"fetching","status":"running"})
        scraped = await scrape_product(url)
        if "error" in scraped:
            yield sse({"step":"fetching","status":"error","error":scraped["error"]})
            return
        yield sse({"step":"fetching","status":"done"})

        # Step 2 — scraping done
        yield sse({"step":"scraping","status":"running"})
        await asyncio.sleep(0.15)
        yield sse({
            "step":"scraping","status":"done",
            "reviews":     scraped["reviews"],
            "reviewCount": len(scraped["individual_ratings"]),
            "starRating":  scraped["star_rating"],
            "imageUrl":    scraped["image_url"],
        })

        # Step 3 — inference
        yield sse({"step":"inference","status":"running"})
        text_for_model = scraped["reviews"] or scraped["combined_text"]
        viability, regret = run_inference(text_for_model)
        yield sse({"step":"inference","status":"done",
                   "viability_score":viability,"regret_score":regret})

        # Step 4 — scoring
        yield sse({"step":"scoring","status":"running"})
        final_score, model_signal, diagnostics = compute_final_score(
            viability, regret, scraped["reviews"], scraped["individual_ratings"]
        )
        decision = decide_label(final_score, model_signal, diagnostics)
        yield sse({
            "step":"scoring","status":"done",
            "result": {
                "viability_score": viability,
                "regret_score":    regret,
                "model_signal":    model_signal,
                "final_score":     final_score,
                "decision":        decision,
                "reviews":         scraped["reviews"],
                "product_image":   scraped["image_url"],
                "star_rating":     scraped["star_rating"],
                "diagnostics":     diagnostics,
                "regret_derived":  False,
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        yield sse({"step":"fetching","status":"error","error":str(e)})

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    print(f"[API] Analyzing: {req.url}", flush=True)
    return StreamingResponse(
        analysis_generator(req.url),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "X-Accel-Buffering":"no",
        },
    )

# ── Legacy /predict kept for compatibility ──
@app.post("/predict")
def predict_endpoint(req: PredictRequest):
    v, r = run_inference(req.text)
    return {"viability_score": v, "regret_score": r}

@app.get("/health")
def health():
    return {"status": "ok"}
