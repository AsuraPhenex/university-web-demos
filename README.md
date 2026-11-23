# University Web Demos — Library + Cinema

Two separate, Mongolian-language systems for **Системийн шинжилгээ ба зохиомж**.

- `library/` — small library management demo. **Static site only**, no server/database. Stores book, reader, loan, and reservation arrays in the browser's **localStorage**. This means its data is *per browser*, not shared among different visitors.
- `cinema/client/` — responsive cinema customer/admin frontend. **Static site** on Render.
- `cinema/api/` — **Node.js + Express backend**. A **Render Web Service** connected to **MongoDB Atlas**. The frontend never knows the database credentials.
- `render.yaml` — optional Render Blueprint defining 3 services.

## GitHub monorepo + automatic Render deployment

This archive is **one repository**, not three. It follows the same general GitHub-to-Render pattern as the Eco Pure Delivery deployment (frontend + API), but it is **separate** from the live business code.

Suggested repo: `AsuraPhenex/university-web-demos`

Once the empty GitHub repository has been created and this archive extracted into its root:

```bash
git init
git branch -M main
git add .
git commit -m "Initial library and cinema demos"
git remote add origin https://github.com/AsuraPhenex/university-web-demos.git
git push -u origin main
```

Then open Render Dashboard -> **New -> Blueprint**, select the new repo, review the three services defined in `render.yaml`, and configure the private MongoDB URI for the cinema API.

- **First deployment**: Render creates the library static site, cinema static site, and cinema Node.js API as separate services.
- **Future pushes**: Render watches GitHub. Library-only changes rebuild only the library service, cinema-client changes rebuild only that static site, and cinema-api changes rebuild only the API service.
- **One-time configuration**: Once Render assigns URLs, set the API's `FRONTEND_ORIGIN` and edit `cinema/client/config.js` to use the real cinema API URL. Keep all MongoDB credentials in Render API environment variables, not GitHub.
- **IMPORTANT**: Do **not** add these student projects to the production Eco Pure repository or connect them to its `eco_water` database.

This repository is maintained on GitHub. After each push, connected Render services can redeploy their related project folders.

## Functions

### Library (assignment demonstration)

- Add a reader, phone and reader-code validation.
- Add a book and copy count; reject duplicate book codes.
- Issue a book only if a copy is available; prevent the same reader borrowing the same title twice before returning.
- Record the return date and process returns; the copy becomes available again.
- Reserve or cancel a book reservation; searchable books, overview statistics, sample data, reset button.

### Cinema (working MVP)

- Seeded fictional movies and scheduled screening times for the upcoming days (Mongolian local time).
- Browse movies, select screening, view seat map, select up to six seats.
- Server-side **atomic multi-seat hold** for 5 minutes; multiple customers cannot successfully hold the same seat.
- Simulated payment (NO actual charge), transaction-safe confirmation in MongoDB, confirmation code and an optional QR image for the code.
- Look up a booking by its 16-character booking code.
- Token-protected demonstration admin area: reports, add movies, add screening schedules.

**Not production-ready**: no actual payment integration, identity provider, fraud controls, email delivery, customer accounts, refund/cancellation workflow, ticket scanner, or load-tested production monitoring. The generated QR represents a *demo booking code* only. Admin uses a shared token, not personal user authentication. See also security notes below.

## Render deployment — recommended steps

### 1. Create a GitHub repository

1. Extract this ZIP.
2. Create a new repository, e.g. `university-web-demos` (private is fine if your Render Git integration has access).
3. Upload all project folders and `render.yaml` (do **not** include `.env`).

### 2. MongoDB Atlas

1. Use the **same existing Atlas cluster if you wish**, but a **different database name** (`cinema_demo`) and ideally a restricted database user.
2. In Atlas Database Access, create a new database user with `readWrite` on `cinema_demo` only. Do not reuse a privileged account if possible.
3. In Atlas Network Access, permit Render's outbound network path. If you temporarily allow broad IP ranges for testing, understand the security tradeoff and restrict access as practical.
4. Obtain the connection string **privately**. **Never put it in `config.js`, JavaScript frontend, Git, or this chat**. Set it in the Render API's environment as `MONGODB_URI`.

### 3. Create Render services

**Option A — Blueprint**: Render Dashboard → **New → Blueprint**, select the GitHub repository, review the three services in `render.yaml`, provide secret variables when prompted.

**Option B — Create three services manually** (safer if you prefer your existing Render setup):

| Render service | Type | Root directory | Build command | Publish / Start |
|---|---|---|---|---|
| university-library-demo | Static Site | repo root | `echo ready` | Publish Directory `library` |
| university-cinema-site | Static Site | repo root | `echo ready` | Publish Directory `cinema/client` |
| university-cinema-api | Web Service (Node.js) | `cinema/api` | `npm install` | Start `npm start` |

**API environment settings** (Render dashboard → cinema API → Environment):

| Key | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string (secret) |
| `MONGODB_DB` | `cinema_demo` |
| `FRONTEND_ORIGIN` | Exact cinema static-site origin, e.g. `https://university-cinema-site.onrender.com` (no trailing slash) |
| `ADMIN_TOKEN` | A long unpredictable secret (the Blueprint can generate one automatically) |
| `NODE_ENV` | `production` |

Render uses the `PORT` env variable automatically; our API listens on `0.0.0.0` as recommended.

### 4. Connect the cinema frontend to your API

Edit `cinema/client/config.js`:

```js
window.CINEMA_API_URL = 'https://YOUR-REAL-API-SERVICE.onrender.com';
```

Commit the change. Render will redeploy the static frontend. This URL is public, so it is safe in frontend code. It must be the API address **without** a trailing slash. Also set `FRONTEND_ORIGIN` to the static site address in the API service and redeploy the API.

### 5. Verify

- Library URL: add a book, register a reader, issue/return a loan, refresh the page to see browser-persisted data.
- Cinema API: open `https://YOUR-API.onrender.com/health` and confirm `{"status":"ok", ...}`.
- Cinema static URL: select a movie → showtime → available seats → **simulated** payment → booking code → look up booking. Try two browsers booking one seat simultaneously; only one seat hold should succeed.
- Cinema Admin: set your `ADMIN_TOKEN` in the admin login input. Add movies and showtimes. The token is stored only in the browser's `sessionStorage` for that tab.

**Free Render web services** can sleep when idle, so the first cinema request after inactivity may be slow. Static pages load independently; the API must wake up to serve booking data.

## Local development

### Library

For basic testing, open `library/index.html` in a browser. Alternatively:

```bash
cd library
python -m http.server 8080
```

Visit `http://localhost:8080/`.

### Cinema API

Requires a reachable **MongoDB Atlas replica set** (transactions are used to keep seat confirmation and booking insert consistent).

```bash
cd cinema/api
cp .env.example .env
# Fill MONGODB_URI, FRONTEND_ORIGIN, ADMIN_TOKEN in your local .env
npm install
npm test
npm start
```

The API runs at `http://localhost:10000` by default. Test `http://localhost:10000/health`.

### Cinema frontend

```bash
cd cinema/client
# For local testing only: edit config.js to use http://localhost:10000
python -m http.server 8081
```

Visit `http://localhost:8081`, and set `FRONTEND_ORIGIN=http://localhost:8081` for the local API.

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/movies` | Movie list |
| GET | `/api/screenings?movieId=...` | Upcoming screenings |
| GET | `/api/screenings/:id/seats` | Seat availability |
| POST | `/api/holds` | Atomically hold 1–6 seats for 5 min |
| POST | `/api/bookings/confirm` | Confirm a held booking (payment simulation) |
| GET | `/api/bookings/:code` | Public ticket lookup using unguessable code |
| GET | `/api/admin/report` | Admin statistics (Bearer token) |
| POST | `/api/admin/movies` | Add movie (Bearer token) |
| POST | `/api/admin/screenings` | Add screening (Bearer token) |

### Safety, limitations, and implementation notes

- The API uses **MongoDB single-document atomic updates** to acquire all requested seat holds simultaneously (never a client-only availability check). It uses **MongoDB transactions** on confirmation so a confirmed seat and a booking record are committed together. Works with Atlas replica set deployments.
- Holds expire *logically* after five minutes. No cleanup task is required for reuse: any expired hold can be overwritten by a new valid hold. On confirmed purchase, those seats become permanently booked for that screening.
- Rate-limited public endpoints and exact-origin CORS provide basic safeguards, but this is an **educational MVP**, not an audited production booking platform. Add authentic customer accounts, admin RBAC, CSRF protections where relevant, webhooks for real payment confirmation, email/QR validation, monitoring and logging before handling real money or customer records.
- Never expose MongoDB credentials or `ADMIN_TOKEN` in publicly committed files, screenshots, or frontend JavaScript. Do not paste secrets into ChatGPT.
- The library data is specific to each browser; to share library records across devices, move it later to a backend with a database.
- To prevent old holds from creating significant document growth in a long-running screening, add a cleanup task or a separate TTL-indexed reservation collection in a larger production architecture.

## Suggested demo script for university presentation

**Library:** register a reader → register a book → issue book → see available copies decrease → return book → copies increase → create reservation.

**Cinema:** choose a movie → showtime → seat → confirm simulated payment → show electronic ticket / booking code → verify the same seat is no longer available → demonstrate admin statistics.
