# Purchase Decision Engine (PDE)
**An AI-Powered Amazon Product Recommendation System**

🚀 **Live Demo:** [[https://ml-project-wine.vercel.app](https://ml-project-wine.vercel.app)]

---

## 1. Project Title
**Purchase Decision Engine (PDE)** — An AI-Powered Amazon Product Recommendation System

---

## 2. Objective / Problem Statement
Online shoppers face information overload — thousands of reviews, fake ratings, and manipulated feedback make confident buying decisions difficult. This project automates that decision: given any Amazon product URL, it tells you whether to **Buy**, **Wait**, or **Do Not Buy** using real review data and AI models.

---

## 3. Proposed Solution / Approach
The system scrapes real customer reviews from Amazon using HTTP requests and a Playwright-controlled browser as fallback. Reviews are passed through two fine-tuned neural network classifiers (Viability and Regret models). Their outputs are combined with keyword-based sentiment analysis and individual star rating signals to compute a final recommendation score.

**Technologies:** Python, TensorFlow/Keras, FastAPI, Next.js 14, React, TypeScript, Tailwind CSS, Framer Motion, Playwright, Cheerio, Node.js

---

## 4. System Architecture / Design

**Components:**
- **Frontend** — Next.js React app with real-time SSE streaming UI
- **Scraper** — Cheerio (static HTML) + Playwright (JS-rendered fallback)
- **Inference Server** — FastAPI Python server hosting both Keras models
- **Scorer** — Hybrid scoring engine combining ML + keyword + ratings signals
- **Decision Engine** — Threshold-based label assignment (BUY / WAIT / DO NOT BUY)

**Flow:**

```
User inputs Amazon URL
        ↓
Scraper fetches product page + reviews
        ↓
Review text → FastAPI Inference Server
        ↓
Viability Score + Regret Score (Neural Networks)
        ↓
Scorer blends: ML (35%) + Sentiment (35%) + Star Ratings (30%)
        ↓
Final Score → Decision Label
        ↓
Result displayed on Dashboard
```

---

## 5. Tools and Technologies Used

| Category | Technology |
|---|---|
| ML Framework | TensorFlow / Keras |
| Backend API | FastAPI (Python) |
| Frontend | Next.js 14, React, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Web Scraping | Playwright (Chromium), Cheerio |
| Streaming | Server-Sent Events (SSE) |
| Training Data | Amazon Review Polarity Dataset (3.6M reviews) |
| Runtime | Node.js, Python 3.10+ |

---

## 6. Key Features / Functionalities

- Paste any Amazon.in product URL and get an instant AI recommendation
- Real-time pipeline visualization with animated flowchart showing each processing step
- Dual neural network models: Viability classifier + Regret classifier (both trained at ~89% accuracy)
- Hybrid scoring: ML output dampened against keyword sentiment analysis and star rating signals
- Playwright-powered browser fallback that navigates Amazon like a real user to bypass bot detection
- Cinematic animated UI with particle field, floating orbs, score rings, and live progress bar
- Displays product image, captured reviews, keyword hit breakdown, and full score diagnostics

---

## 7. UI Design Sketch

**Intro Screen:** Animated title with staggered word entrance → URL input box → Analyze button

**Loading Screen:** 4-step flowchart (Fetch Product → Extract Reviews → AI Models → Score & Decide) with animated connectors, sub-process labels, and a live progress bar

**Results Dashboard:**

```
┌─────────────────────────────┐
│     AI RECOMMENDATION       │
│          BUY ✓              │
├──────────┬──────────────────┤
│ Viability│ Anti-Regret      │
│  Ring    │  Ring            │
├──────────┴──────────────────┤
│        Score Chart          │
├─────────────────────────────┤
│  Score Breakdown Cards      │
├──────────┬──────────────────┤
│ Product  │ Reviews Captured │
│  Image   │                  │
└──────────┴──────────────────┘
```

---

## 8. Challenges Faced

**1. Amazon Bot Detection**
Amazon actively blocks automated scrapers. Solved by using Playwright to open a real Chromium browser, load the product page first to obtain session cookies, then navigate to the review pages within the same session — mimicking genuine human browsing behaviour.

**2. ML Model Overconfidence**
Both neural network models were outputting near-perfect scores (99%+) for almost every product, rendering them useless as standalone signals. Solved by applying a dampening function that compresses extreme scores toward the centre, and reducing the ML weight from 58% to 35% while increasing keyword and star rating weights.

---

## 9. Learning Outcomes

- Training and deploying binary text classification models with TensorFlow/Keras on large datasets (3.6M reviews)
- Building real-time streaming APIs using Server-Sent Events (SSE) in Next.js
- Web scraping with both static HTML parsing (Cheerio) and browser automation (Playwright)
- Designing hybrid AI decision systems that combine neural network output with rule-based signals
- Handling production issues like bot detection, model calibration, and score accuracy
- Building animated, responsive dashboards with Framer Motion and Tailwind CSS

---

## 10. Conclusion

The Purchase Decision Engine successfully demonstrates how machine learning and web scraping can be combined to assist consumers in making smarter buying decisions. The system goes beyond simple star ratings by analysing the actual language of reviews through trained neural networks and keyword sentiment analysis. Future improvements could include multi-product comparison, price history tracking, fake review detection using anomaly models, and support for other e-commerce platforms like Flipkart.
