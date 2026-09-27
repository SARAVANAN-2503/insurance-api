# Insurance API

Built for the Node.js technical assessment. The API imports insurance data into MongoDB, searches and groups policies by user, and schedules messages for later insertion. It also monitors process CPU usage and supports restarts through PM2.

## Features

- CSV/XLSX insurance data import
- Worker Thread processing
- Separate MongoDB collections and policy references
- Policy search by user name
- Policy aggregation by user
- Scheduled message insertion
- CPU monitoring with PM2 restart
- Optional HTML/CSS/JavaScript demo UI

## Tech Stack

Node.js 22+, JavaScript (CommonJS), Express, MongoDB/Mongoose, Multer, ExcelJS, csv-parse, and Luxon. Tests use Jest and Supertest. PM2 is installed separately.

## Getting Started

```sh
npm install
cp .env.example .env
```

Set `MONGODB_URI` in `.env` to a reachable MongoDB server. A local standalone instance is sufficient. Keep `.env` out of version control.

```sh
npm run dev
```

Open http://localhost:3000 to use the optional demo UI. The server connects to MongoDB before accepting requests.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Process health: `{ "status": "ok" }` |
| POST | `/api/imports` | Upload a CSV/XLSX file in multipart field `file` |
| GET | `/api/imports/:id` | Import status and row counts |
| GET | `/api/imports/:id/report` | Download the Excel issue report |
| GET | `/api/policies/search?name=Aarav&page=1&limit=20` | Search policies by the complete user name |
| GET | `/api/policies/aggregate` | Return policies grouped by user |
| POST | `/api/messages/schedule` | Schedule a message using `message`, `day`, and `time` |
| GET | `/api/messages` | Return the latest 100 delivered messages |

Upload a file:

```sh
curl -F 'file=@samples/insurance-demo.xlsx' http://localhost:3000/api/imports
```

Schedule a message using a future day and time:

```sh
curl -X POST http://localhost:3000/api/messages/schedule \
  -H 'Content-Type: application/json' \
  -d '{"message":"Follow up with customer","day":"2030-09-28","time":"10:30"}'
```

## Import File Format

CSV files must be UTF-8 and comma-delimited. XLSX imports use the first worksheet. The first nonempty row contains the headers; matching ignores case, spaces, underscores, and hyphens.

| Canonical field | Additional aliases |
|---|---|
| `agentName` | `agent` |
| `firstName` | — |
| `dob` | `date of birth`, `birth date` |
| `address` | — |
| `phoneNumber` | `phone` |
| `state` | — |
| `zipCode` | `zip` |
| `email` | `email address` |
| `gender` | — |
| `userType` | — |
| `accountName` | `account` |
| `categoryName` | `category`, `lob` |
| `companyName` | `company`, `carrier` |
| `policyNumber` | — |
| `policyStartDate` | `start date` |
| `policyEndDate` | `end date` |

Required fields: `firstName`, `categoryName`, `companyName`, and `policyNumber`.

Invalid rows are skipped; missing required headers reject the file. Repeated imports reuse existing records where possible, without overwriting conflicting details. Users are matched by email; without email, matching uses the name and supplied personal details, with DOB, address, or phone required.

Use Excel date cells, `YYYY-MM-DD`, or ISO UTC timestamps for dates. Keep phone numbers, ZIP codes, and policy numbers as text to preserve leading zeros. Display names keep their casing; normalized names are used for matching.

## Data Model

```text
Policy
  -> User
  -> LOB
  -> Carrier
  -> Account (optional)
  -> Agent (optional)
```

Each entity has its own collection: `agents`, `users`, `accounts`, `lobs`, `carriers`, and `policies`. Relationships use MongoDB ObjectIds, and each Account belongs to a User.

Policy search matches the complete normalized user name, ignoring case and extra spaces. It supports pagination with a maximum limit of 100. The aggregation endpoint groups policies by user ObjectId using MongoDB aggregation and returns all groups without pagination.

## Background Processing

### Import Worker

Express accepts the upload and starts a Worker Thread so parsing and import work do not block the main server thread. The worker uses its own MongoDB connection, and temporary upload files are removed after it exits. A 202 response includes an import ID and status URL. The demo UI waits for completion and offers an Excel issue report.

One import runs at a time per process. Status shows newly imported policies, matching duplicates, and skipped rows separately. The report lists each affected source row, its original values, severity, and reason: duplicates are warnings; validation failures and identity/policy conflicts are errors. CSV row numbers count records, including blank records, rather than physical lines inside quoted values.

Reports and status files are stored under `work/import-reports` and survive restarts. They contain uploaded data; keep the demo local and delete report directories when no longer needed. There is no automatic expiry. Interrupted imports do not resume automatically and may have no usable report. A malformed file or row-limit failure stops processing and is reported as a file-level error; unparsed rows cannot be listed individually.

### Message Scheduler

Scheduling saves a pending ScheduledMessage, including the message text and due time. A MongoDB-backed polling job uses an atomic claim to process due schedules and create the final Message, with a unique schedule reference preventing duplicate delivery. Persisted pending work and stale claims can be recovered after an application restart.

`APP_TIMEZONE` defaults to `Asia/Kolkata`; responses contain UTC timestamps. Repeated scheduling requests create separate schedules.

### CPU Monitoring

The application samples Node process CPU usage, not total machine CPU. At the default 70% threshold it performs graceful shutdown, stopping background work and closing connections. PM2 starts the process again; running Node directly does not restart it.

## PM2

```sh
npm install -g pm2
pm2 start ecosystem.config.js
pm2 status
pm2 logs
```

PM2 manages automatic restarts with a five-second delay and a 20-second shutdown allowance. Sustained overload can still cause repeated restarts; use `pm2 stop insurance-api` while investigating.

## Sample Data

`samples/insurance-demo.xlsx` contains 10 synthetic policies for five users: Aarav, Meera, Daniel, Priya, and Alex. Each has two policies. Upload it through the demo UI or the import endpoint, then search using one of those names.

This is demo data, not the official assessment spreadsheet.

## Testing

```sh
npm test
```

Current verified result: 76 tests passing across five suites. Database tests require a reachable MongoDB server and use isolated databases that are removed afterward.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port, 1–65535 |
| `MONGODB_URI` | Required | MongoDB connection string |
| `UPLOAD_MAX_MB` | `10` | Upload limit in MiB, 1–100 |
| `IMPORT_MAX_ROWS` | `100000` | Maximum nonempty data rows per import |
| `APP_TIMEZONE` | `Asia/Kolkata` | Timezone for new message schedules |
| `MESSAGE_POLL_INTERVAL_MS` | `1000` | Scheduler polling delay, 100–60000 ms |
| `MESSAGE_STALE_TIMEOUT_MS` | `60000` | Stale claim timeout, 1000–3600000 ms |
| `CPU_MONITOR_ENABLED` | `true` | Enable or disable CPU monitoring |
| `CPU_THRESHOLD_PERCENT` | `70` | Shutdown threshold, greater than 0 and up to 100 |
| `CPU_SAMPLE_INTERVAL_MS` | `5000` | CPU sampling interval, 100–60000 ms |
| `CPU_STARTUP_GRACE_MS` | `10000` | Startup grace period, 0–3600000 ms |

Tests optionally accept `TEST_MONGODB_URI`; otherwise they use `MONGODB_URI` or local MongoDB. PM2 sets `NODE_ENV=production`.

## Notes

- The supplied assessment CSV has been tested: 1,149 policies import and 49 rows have conflicting user details for reused email addresses. These conflicts appear in the issue report; the included demo spreadsheet remains synthetic.
- CSV is streamed; XLSX is parsed in the Worker Thread using ExcelJS and held in worker memory.
- Imports are not wrapped in one large transaction, so a failed import can leave already processed rows.
- Scheduled messages are inserted at or after the requested time and can be delayed by application downtime.
- Worker Thread CPU usage contributes to process CPU monitoring.
