import * as cheerio from "cheerio";

const SUPPORTED_DOMAINS = [
  "amazon.com","amazon.in","amazon.co.uk","amazon.ca","amazon.de",
  "amazon.fr","amazon.it","amazon.es","amazon.ae","amazon.com.au","amazon.co.jp",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Connection: "keep-alive",
};

function clean(s: string) { return s.replace(/\s+/g, " ").trim(); }

function isBotPage($: cheerio.CheerioAPI, rawHtml: string) {
  const t = $.text().toLowerCase();
  const h = rawHtml.toLowerCase();
  return (
    t.includes("sorry, we just need to make sure you're not a robot") ||
    t.includes("enter the characters you see below") ||
    t.includes("robot check") ||
    t.includes("automated access") ||
    t.includes("api-services-support@amazon") ||
    t.includes("service unavailable") ||
    t.includes("request was throttled") ||
    t.includes("to discuss automated access") ||
    // Page has almost no content — Amazon returned a near-blank block page
    (rawHtml.length < 5000 && !h.includes("productTitle") && !h.includes("product-reviews")) ||
    // Signin wall
    (t.includes("sign in") && t.includes("password") && !h.includes("data-hook=\"review\""))
  );
}

function extractFromJsonLd($: cheerio.CheerioAPI): { text: string; star: number | null } {
  let text = "";
  let star: number | null = null;
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const raw = $(el).html() || "";
      const payload = JSON.parse(raw);
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        if (typeof item !== "object") continue;
        if (item.name) text += " " + clean(item.name);
        if (item.description) text += " " + clean(item.description);
        if (item.aggregateRating?.ratingValue) {
          const v = parseFloat(item.aggregateRating.ratingValue);
          if (!isNaN(v)) star = Math.max(0, Math.min(5, v));
        }
      }
    } catch {}
  });
  return { text: text.trim(), star };
}

function extractProductText($: cheerio.CheerioAPI): string {
  const parts: string[] = [];
  const titleSelectors = ["#productTitle", "#title span", "meta[property='og:title']", "meta[name='title']"];
  for (const sel of titleSelectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    const t = clean(el.attr("content") || el.text());
    if (t) { parts.push(t); break; }
  }
  const bodySelectors = [
    "#feature-bullets li span.a-list-item",
    "#detailBullets_feature_div li span",
    "#productDescription p",
    "#productDescription",
    "#bookDescription_feature_div",
    "div[data-hook='review-collapsed'] span",
    "span[data-hook='review-body']",
  ];
  for (const sel of bodySelectors) {
    $(sel).each((_, el) => { const t = clean($(el).text()); if (t) parts.push(t); });
  }
  const { text: ldText } = extractFromJsonLd($);
  if (ldText) parts.push(ldText);
  const seen = new Set<string>();
  return parts.filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(" ").trim();
}

function extractReviews($: cheerio.CheerioAPI, rawHtml: string, limit = 100): { text: string; ratings: number[] } {
  const texts: string[] = [];
  const ratings: number[] = [];

  $("div[data-hook='review']").each((_, block) => {
    const body = $(block).find(
      "div[data-hook='reviewRichContentContainer'], span[data-hook='review-body'] span, span[data-hook='review-body'], div[data-hook='review-collapsed'] span"
    ).first();
    const title = $(block).find("h5[data-hook='reviewTitle'], span[data-hook='review-title'] span").first();
    const titleText = title.length ? clean(title.text()) : "";
    if (body.length) { const t = clean(body.text()); if (t) texts.push(titleText ? `${titleText}: ${t}` : t); }
    const star = $(block).find("i[data-hook='review-star-rating'] span.a-icon-alt, span.a-icon-alt").first();
    if (star.length) {
      const m = clean(star.text()).match(/(\d+(?:\.\d+)?)\s*(?:out of\s*5|\/\s*5)/i);
      if (m) { const v = parseFloat(m[1]); if (!isNaN(v)) ratings.push(Math.max(1, Math.min(5, v))); }
    }
    if (texts.length >= limit) return false;
  });

  if (!texts.length) {
    const fallbackSels = [
      "div[data-hook='reviewRichContentContainer']",
      "span[data-hook='review-body'] span","span[data-hook='review-body']",
      "div[data-hook='review-collapsed'] span",
    ];
    for (const sel of fallbackSels) {
      $(sel).each((_, el) => { const t = clean($(el).text()); if (t) texts.push(t); if (texts.length >= limit) return false; });
      if (texts.length >= limit) break;
    }
  }

  if (!texts.length && rawHtml) {
    const patterns = [/"reviewBody"\s*:\s*"([^"]+)"/, /"reviewText"\s*:\s*"([^"]+)"/];
    for (const p of patterns) {
      for (const m of rawHtml.matchAll(new RegExp(p.source, "g"))) {
        const t = clean(m[1]).replace(/\\n/g, " ").replace(/\\"/g, '"');
        if (t) texts.push(t);
        if (texts.length >= limit) break;
      }
      if (texts.length >= limit) break;
    }
  }

  return { text: texts.slice(0, limit).join(" "), ratings: ratings.slice(0, limit) };
}

function extractImage($: cheerio.CheerioAPI): string | null {
  const img = $("#landingImage, #imgTagWrapperId img").first();
  if (img.length) {
    for (const attr of ["data-old-hires", "src", "data-a-dynamic-image"]) {
      const v = img.attr(attr);
      if (v) return v.trim();
    }
  }
  for (const sel of ["meta[property='og:image']", "meta[name='twitter:image']"]) {
    const v = $(sel).attr("content");
    if (v) return v.trim();
  }
  return null;
}

function extractStarRating($: cheerio.CheerioAPI): number | null {
  const nodes = [
    $("span[data-hook='rating-out-of-text']").first(),
    $("#acrPopover").first(),
    $("i.a-icon-star span.a-icon-alt").first(),
  ];
  for (const node of nodes) {
    if (!node.length) continue;
    const m = clean(node.text()).match(/(\d+(?:\.\d+)?)\s*(?:out of\s*5|\/\s*5)/i);
    if (m) return Math.max(0, Math.min(5, parseFloat(m[1])));
  }
  return extractFromJsonLd($).star;
}

async function fetchReviewsWithPlaywright(
  productUrl: string,
  limit = 120
): Promise<{ text: string; ratings: number[]; imageUrl: string | null; starRating: number | null; error: string }> {
  let browser;
  try {
    console.log("[Playwright] Launching browser for reviews...");
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,900",
      ],
    });

    const context = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    const allTexts: string[] = [];
    const allRatings: number[] = [];
    let pwImageUrl: string | null = null;
    let pwStarRating: number | null = null;

    function extractFromPage(lim: number): { texts: string[]; ratings: number[] } {
      const blocks = Array.from(document.querySelectorAll("div[data-hook='review']"));
      const texts: string[] = [];
      const ratings: number[] = [];
      for (const block of blocks) {
        const bodyEl =
          (block.querySelector("div[data-hook='reviewRichContentContainer']") as HTMLElement) ||
          (block.querySelector("span[data-hook='review-body']") as HTMLElement) ||
          (block.querySelector(".review-text-content") as HTMLElement);
        if (bodyEl) {
          const t = (bodyEl.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length > 8) texts.push(t);
        }
        const starEl =
          block.querySelector("i[data-hook='review-star-rating'] span.a-icon-alt") ||
          block.querySelector("span.a-icon-alt");
        if (starEl) {
          const m = (starEl.textContent || "").match(/(\d+(?:\.\d+)?)\s*out of/i);
          if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 5) ratings.push(v); }
        }
        if (texts.length >= lim) break;
      }
      return { texts, ratings };
    }

    // ── Step 1: Land on the product page ──
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 50000 });
    await page.waitForTimeout(2500);

    const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 600).toLowerCase());
    if (bodySnippet.includes("sign in") && bodySnippet.includes("mobile number")) {
      await browser.close();
      return { text: "", ratings: [], imageUrl: null, starRating: null, error: "Amazon requires login." };
    }

    // Grab image and star rating from the product page while we're here
    pwImageUrl = await page.evaluate(() => {
      const img = document.querySelector("#landingImage, #imgTagWrapperId img") as HTMLImageElement | null;
      if (img) return img.getAttribute("data-old-hires") || img.src || null;
      const og = document.querySelector("meta[property='og:image']") as HTMLMetaElement | null;
      return og ? og.content : null;
    });
    pwStarRating = await page.evaluate(() => {
      const el = document.querySelector("span[data-hook='rating-out-of-text'], #acrPopover") as HTMLElement | null;
      if (!el) return null;
      const m = (el.innerText || "").match(/(\d+(?:\.\d+)?)\s*out of/i);
      return m ? parseFloat(m[1]) : null;
    });
    console.log(`[Playwright] Product page loaded — image: ${!!pwImageUrl}, star: ${pwStarRating}`);

    // ── Step 2: Scroll down on the product page to load the reviews section ──
    // Amazon renders top reviews directly on the product page — scrape them first
    // without navigating away (navigating to /product-reviews/ triggers bot detection)
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
      const found = await page.locator("div[data-hook='review']").count();
      if (found > 0) break;
    }
    await page.waitForTimeout(1000);

    const onPageResult = await page.evaluate(extractFromPage, limit);
    console.log(`[Playwright] On product page: found ${onPageResult.texts.length} reviews.`);
    allTexts.push(...onPageResult.texts);
    allRatings.push(...onPageResult.ratings);

    // ── Step 3: Navigate to /product-reviews/ in the same browser session ──
    // We already have Amazon session cookies from loading the product page,
    // so this navigation is far less likely to trigger bot detection.
    if (allTexts.length < limit) {
      const asinInUrl = page.url().match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinInUrl) {
        const origin = new URL(page.url()).origin;
        const asin = asinInUrl[1].toUpperCase();

        const reviewsUrls = [
          `${origin}/product-reviews/${asin}/?pageNumber=1`,
          `${origin}/product-reviews/${asin}/?pageNumber=2`,
          `${origin}/product-reviews/${asin}/?pageNumber=3`,
          `${origin}/product-reviews/${asin}/?filterByStar=critical&pageNumber=1`,
        ];

        for (const rUrl of reviewsUrls) {
          if (allTexts.length >= limit) break;
          try {
            console.log(`[Playwright] Navigating to: ${rUrl}`);
            await page.goto(rUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
            await page.waitForTimeout(1800);

            const snippet = await page.evaluate(() => document.body.innerText.slice(0, 300).toLowerCase());
            if (snippet.includes("robot") || snippet.includes("captcha") || snippet.includes("sign in")) {
              console.log(`[Playwright] Blocked on ${rUrl} — stopping pagination.`);
              break;
            }

            try { await page.waitForSelector("div[data-hook='review']", { timeout: 6000 }); } catch {}

            const { texts, ratings } = await page.evaluate(extractFromPage, limit - allTexts.length);
            console.log(`[Playwright] ${rUrl} → found ${texts.length} reviews`);
            allTexts.push(...texts);
            allRatings.push(...ratings);

            await page.waitForTimeout(1000 + Math.random() * 500);
          } catch (e) {
            console.log(`[Playwright] Error on ${rUrl}:`, String(e));
          }
        }
      }
    }

    await browser.close();
    return { text: allTexts.join(" "), ratings: allRatings, imageUrl: pwImageUrl, starRating: pwStarRating, error: "" };
  } catch (e: unknown) {
    console.error("[Playwright] Error:", String(e));
    try { await browser?.close(); } catch {}
    return { text: "", ratings: [], imageUrl: null, starRating: null, error: String(e) };
  }
}

export interface ScrapeResult {
  combinedText: string;
  reviews: string;
  imageUrl: string | null;
  starRating: number | null;
  individualRatings: number[];
  note: string;
}

export async function scrapeProduct(rawUrl: string): Promise<ScrapeResult> {
  const normalized = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const parsed = new URL(normalized);
  const domain = parsed.hostname.replace("www.", "");
  if (!SUPPORTED_DOMAINS.some((d) => domain.endsWith(d))) {
    return { combinedText: "", reviews: "", imageUrl: null, starRating: null, individualRatings: [], note: `Unsupported domain: ${domain}` };
  }

  const asinMatch = normalized.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews|gp\/offer-listing)\/([A-Z0-9]{10})/i);
  const candidates = asinMatch
    ? (() => {
        const asin = asinMatch[1].toUpperCase();
        const base = `https://${parsed.hostname}/product-reviews/${asin}`;
        return [
          `https://${parsed.hostname}/dp/${asin}`,
          // Top reviews pages 1-4 (default sort = most helpful)
          `${base}/?pageNumber=1`,
          `${base}/?pageNumber=2`,
          `${base}/?pageNumber=3`,
          `${base}/?pageNumber=4`,
          // Critical / negative reviews (1-2 star filter)
          `${base}/?filterByStar=critical&pageNumber=1`,
          `${base}/?filterByStar=critical&pageNumber=2`,
          // Most recent so newly emerging issues are captured
          `${base}/?sortBy=recent&pageNumber=1`,
          normalized,
        ];
      })()
    : [normalized];

  let bestProductText = "";
  const allReviewChunks: string[] = [];
  const allRatings: number[] = [];
  let imageUrl: string | null = null;
  let starRating: number | null = null;
  let lastNote = "";

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (!res.ok) { lastNote = `HTTP ${res.status} for ${url}`; continue; }
      const rawHtml = await res.text();
      const $ = cheerio.load(rawHtml);
      if (isBotPage($, rawHtml)) {
        lastNote = `Bot page detected for ${url}`;
        console.log(`[Scraper] Bot page (${rawHtml.length} bytes): ${url}`);
        // Save first bot page for debugging
        if (!url.includes("/product-reviews/")) {
          const fs = await import("fs");
          fs.writeFileSync("C:\\ML PROJECT\\debug_bot_page.html", rawHtml);
          console.log("[Scraper] Saved bot page to debug_bot_page.html");
        }
        continue;
      }

      const isReviewPage = url.includes("/product-reviews/");
      if (isReviewPage) {
        const { text, ratings } = extractReviews($, rawHtml);
        if (text) allReviewChunks.push(text);
        allRatings.push(...ratings);
      } else {
        const pt = extractProductText($);
        if (pt.length > bestProductText.length) bestProductText = pt;
        const { text, ratings } = extractReviews($, rawHtml, 30);
        if (text) allReviewChunks.push(text);
        allRatings.push(...ratings);

        // Debug: save the first product page HTML so we can inspect review block structure
        if (!text && ratings.length > 0) {
          const fs = await import("fs");
          fs.writeFileSync("C:\\ML PROJECT\\debug_static_page.html", rawHtml);
          console.log(`[Scraper] Saved static HTML for inspection — found ${ratings.length} ratings but no text. URL: ${url}`);
        }
      }

      if (!imageUrl) imageUrl = extractImage($);
      if (!starRating) starRating = extractStarRating($);
    } catch (e: unknown) {
      lastNote = `Fetch failed: ${url}`;
    }
  }

  // Deduplicate at sentence / chunk level so the same review from multiple pages isn't double-counted
  const seenSentences = new Set<string>();
  const deduped: string[] = [];
  for (const chunk of allReviewChunks) {
    const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
    const newSentences = sentences.filter(s => { const k = s.toLowerCase().trim(); if (seenSentences.has(k)) return false; seenSentences.add(k); return true; });
    if (newSentences.length > 0) deduped.push(newSentences.join(" "));
  }
  let reviews = deduped.join(" ").trim();
  let allIndividualRatings = allRatings.filter((r) => r >= 1 && r <= 5);

  // Playwright fallback when static scraping found fewer than 8 reviews
  const staticReviewCount = allIndividualRatings.length;
  if (staticReviewCount < 8 && asinMatch) {
    console.log(`[Scraper] Only ${staticReviewCount} reviews from static — launching Playwright for more.`);
    const pw = await fetchReviewsWithPlaywright(normalized, 120);
    if (pw.text) {
      reviews = [reviews, pw.text].filter(Boolean).join(" ").trim();
      if (pw.ratings.length > allIndividualRatings.length) allIndividualRatings = [...allIndividualRatings, ...pw.ratings];
    }
    // Use Playwright-captured image/star if static scraping missed them
    if (!imageUrl && pw.imageUrl) imageUrl = pw.imageUrl;
    if (!starRating && pw.starRating) starRating = pw.starRating;
    if (pw.error) console.log(`[Playwright] Error: ${pw.error}`);
  }

  const combinedText = [bestProductText, reviews].filter(Boolean).join(" ").trim() || `Amazon product page ${normalized}`;
  const note = !reviews ? (lastNote || "Reviews not available — Amazon may have blocked the request.") : "";

  return { combinedText, reviews, imageUrl, starRating, individualRatings: allIndividualRatings, note };
}
