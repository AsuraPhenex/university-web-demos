# Cinema system — assignment traceability

Based on the submitted **Бие даалтын ажил 2 — Шаардлагын инженерчлэл** and
**Бие даалтын ажил 3 — Системийн шинжилгээ** for
**Кино театрын тасалбар захиалгын систем**.

The live site is a university demonstration, **not a real payment service**.

| Requirement | Implementation | Status |
| --- | --- | --- |
| FR-01 View movie name, type, duration, description | Customer catalog, search and filter; `GET /api/movies` | Implemented |
| FR-02 View showing day/time/hall | Date-grouped showtimes; `GET /api/screenings` | Implemented |
| FR-03 Distinguish free and reserved seats | Seat map and `GET /api/screenings/:id/seats` | Implemented |
| FR-04 Select one/multiple free seats | 1–6 seats; atomic server hold `POST /api/holds` | Implemented |
| FR-05 Calculate ticket total | UI subtotal and authoritative server total (price × seats) | Implemented |
| FR-06 Pay via payment system and verify result | `POST /api/payments/simulate` with approved/declined/pending branches | **Simulation only** |
| FR-07 Generate QR ticket only after successful payment | `POST /api/bookings/confirm` requires approved simulated payment and live hold; QR ticket view | Implemented for simulation |
| FR-08 Look up booking by code | `GET /api/bookings/:code`, customer ticket lookup | Implemented |
| FR-09 Admin manage movies/showtimes/prices | Admin token, create/edit/delete UI and API, bookings/holds guard for schedule changes | Implemented for demo |
| FR-10 Admin booking reports | `GET /api/admin/report` and `/api/admin/bookings` | Implemented |

**Non-functional requirement notes:** NFR-01: administrative endpoints require a
secret stored in Render; no card numbers are collected. Real production security,
roles, and payment-provider validation are **not implemented**.
NFR-02: MongoDB atomic seat updates prevent double booking in the normal flow,
with a transactional seat-confirmation and booking-write step.
NFR-03: the 3-second schedule-loading goal is **not measured** and Render free-tier
cold starts may exceed it.
NFR-04: CSS responsive breakpoints support desktop and mobile layouts.

## Assignment 3: TO-BE and alternative paths

1. Customer chooses movie and screening.
2. API checks seat state and atomically holds selected seats temporarily.
3. API returns authoritative total in MNT.
4. User selects a **demonstration** payment outcome:
   - **Approved**: exact held seats are marked paid; only then can
     the server confirm booking and create a QR e-ticket.
   - **Declined**: seats are released; no ticket is created.
   - **Pending**: seats stay temporarily held; no ticket is created.
   - **Hold expired or competing reservation**: server returns conflict,
     UI asks customer to select again.
5. Booking confirmation is stored in MongoDB and can be looked up by its code.
6. Admin manages movies, schedule, ticket price, and booking statistics.
   Existing bookings prevent unsafe schedule changes/deletions.

## Boundary and limitations

The AS-IS counter-based theater was an **academic assumption** in Assignment 3,
not a measured deployment. No physical cinema, ticket scanner, payment gateway,
email/SMS provider, or bank transaction is connected. The booking UI must continue
displaying that payment and tickets are simulated. No real card data is collected.

## Smoke tests

- Visit `https://university-cinema-api.onrender.com/health`: expect `status: ok`
  (replace with the actual Render URL if different).
- Open customer site; if movie loading fails, use the gear icon to set the
  real Render API URL; verify `FRONTEND_ORIGIN` or the API CORS whitelist.
- Select a movie, showtime, two seats; confirm approved demo payment; note the
  booking code and look it up.
- In another browser tab select the same seats; the API must reject them.
- Try declined and pending outcomes; neither must produce a ticket.
- In admin mode, test creating/editing/removing an unbooked movie/show;
  editing/deleting a booked show must be rejected.

Security: Keep `MONGODB_URI` and `ADMIN_TOKEN` only in Render environment
variables; never commit them to the repository. Rotate any credentials that were
shared outside the private service settings.
