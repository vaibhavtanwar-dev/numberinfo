# HiTek India Dataset Lookup & API Gateway

A full-stack subscriber number lookup console, REST API gateway, Parquet shard inspector, and static GitHub Pages exporter powered by the [`bashabashi420/hitek-india`](https://huggingface.co/datasets/bashabashi420/hitek-india) Hugging Face dataset (**1,782,434,387 rows · 93.1 GB**).

---

## Live API Endpoint (Direct Number Lookup)

Once deployed to Vercel (or running locally), you can query any mobile number, subscriber name, or document ID directly via `GET`:

```text
https://your-project-name.vercel.app/api/v1/lookup?number=9999999891
```

### Supported URL Formats
- `GET /api/v1/lookup?number=9999999891`
- `GET /api/v1/lookup/9999999891`
- `GET /api/lookup?number=9999999891`
- `GET /?number=9999999891` *(opens the web console and automatically searches the number)*

### Example cURL Request
```bash
curl -X GET \
  "https://your-project-name.vercel.app/api/v1/lookup?number=9999999891"
```

### Example JSON Response
```json
{
  "status": "ok",
  "dataset": "bashabashi420/hitek-india",
  "config": "default",
  "split": "train",
  "query": "9999999891",
  "normalizedNumber": "9999999891",
  "count": 1,
  "matches": [
    {
      "row_idx": 0,
      "mobile": "9999999891",
      "name": "Krishan  Bidhuri",
      "fname": "Dharamveer",
      "address": "!75!Block-52!!Aali New DelhiSouth Delhi!Delhi!110019",
      "alt": "9999599891",
      "circle": "AIRTEL DELHI",
      "id": "417479131232",
      "email": "Krishanbidhuri33@Gmail.Com",
      "parsedAddress": {
        "formatted": "75, Block-52, Aali New DelhiSouth Delhi, Delhi, 110019",
        "segments": [
          "75",
          "Block-52",
          "Aali New DelhiSouth Delhi",
          "Delhi",
          "110019"
        ],
        "pincode": "110019"
      }
    }
  ],
  "meta": {
    "latencyMs": 2,
    "source": "indexed_cache",
    "indexedRowsInMemory": 100,
    "hfIndexNotice": null
  }
}
```

---

## All API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/lookup?number=9999999891` | Look up subscriber details by mobile number, alternate number, name, ID, or address |
| `GET` | `/api/v1/rows?offset=0&length=100` | Fetch and index 100 rows from `datasets-server.huggingface.co/rows` |
| `GET` | `/api/v1/splits` | List dataset configurations and splits (`default` / `train`) |
| `GET` | `/api/v1/parquet` | List underlying Parquet shard URLs (`0.parquet`, etc.) |
| `POST` | `/api/v1/scan-range` | Batch-fetch and index multiple 100-row offsets in memory |
| `GET` | `/api/keys` | List active API keys and recent gateway request logs |
| `POST` | `/api/keys` | Generate a new `htk_live_...` API key |

---

## Hugging Face Dataset Server cURL Commands

### 1. Get Rows (`offset=0&length=100`)
```bash
curl -X GET \
     "https://datasets-server.huggingface.co/rows?dataset=bashabashi420%2Fhitek-india&config=default&split=train&offset=0&length=100"
```

### 2. List Dataset Splits
```bash
curl -X GET \
     "https://datasets-server.huggingface.co/splits?dataset=bashabashi420%2Fhitek-india"
```

### 3. List Parquet Files
```bash
curl -X GET \
     "https://huggingface.co/api/datasets/bashabashi420/hitek-india/parquet/default/train"
```

---

## Deploy to Vercel

This repository is pre-configured for **Vercel** with `/vercel.json` and `/api/index.ts`.

### Method 1: GitHub + Vercel Dashboard
1. Push this repository to **GitHub**.
2. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repository.
3. Keep the default build settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. *(Optional)* Add Environment Variables in Vercel:
   - `HF_TOKEN`: Your Hugging Face Read Token (`hf_...`) for higher rate limits on `datasets-server.huggingface.co`.
   - `REQUIRE_API_KEY`: Set to `true` only if you want to require `?api_key=...` on `/api/v1/lookup` requests (defaults to `false` so direct `?number=...` URLs work out of the box).
5. Click **Deploy**.

### Method 2: Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

---

## Host on GitHub Pages

1. Open the app and navigate to the **Vercel & GitHub** tab.
2. Click **Download index.html** to get a standalone, zero-dependency single-file HTML portal pre-configured with your dataset and active API keys, or use the included GitHub Actions workflow (`.github/workflows/deploy.yml`).

---

## Local Development

```bash
# Install dependencies
npm install

# Start full-stack Express + Vite development server on http://localhost:3000
npm run dev

# Build production bundle
npm run build
```
