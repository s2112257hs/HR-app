# Free Deployment Guide

This app has three deployable pieces:

- `backend`: NestJS API
- `frontend`: Vite static site
- PostgreSQL database

For a backend that should not sleep, use Option A. Free PaaS services such as Koyeb are only preview/testing options because their free backend instances can scale down when idle.

## Recommended Options

### Option A: Oracle Cloud Always Free VM

Use this when you want the most reliable free no-sleep backend.

- Backend and frontend: one Oracle Always Free VM
- Database: PostgreSQL on the VM, or Neon PostgreSQL if you accept a small database wake-up

This is more work because you manage the Linux VM, firewall, Node process manager, and TLS/proxy setup yourself. It is the best free option if the backend must stay warm.

### Option B: Koyeb Backend + Vercel Frontend + Neon Database

Use this when you want an easier free preview setup than managing a VM.

- Backend: Koyeb free web service
- Frontend: Vercel Hobby static deployment
- Database: Neon PostgreSQL

Koyeb's free web service is limited and can scale down after inactivity. Do not use Koyeb's free PostgreSQL for this app because it is limited to a small amount of active time.

## 1. Push This Repo To GitHub

Push the whole `HR-app` folder, including `frontend` and `backend`.

## 2. Create A Free Neon Database

1. Go to `https://neon.com`.
2. Create a free project.
3. Open the project dashboard and copy the PostgreSQL connection string.
4. Use the direct connection string for Prisma. It should look like:

```text
postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

Keep this as `DATABASE_URL`.

## 3A. Deploy On Oracle Cloud Always Free

1. Create an Oracle Cloud Free Tier account.
2. Create an Always Free Ubuntu VM.
3. Open inbound firewall ports:
   - `22` for SSH
   - `80` for HTTP
   - `443` for HTTPS
4. SSH into the VM.
5. Install Node.js 22, Git, PostgreSQL, and Caddy or Nginx.
6. Clone the repo.
7. Build the backend:

```bash
cd backend
npm ci --include=dev
npx prisma generate
npm run build
```

8. Create `backend/.env`:

```text
DATABASE_URL=<your Postgres connection string>
FRONTEND_ORIGIN=https://<your-domain-or-vm-hostname>
JWT_ACCESS_SECRET=<generate a long random string>
JWT_REFRESH_SECRET=<generate another long random string>
SEED_ADMIN_EMAIL=<your admin email>
SEED_ADMIN_PASSWORD=<a strong password>
SEED_ORGANISATION_NAME=<your organisation name>
SEED_TIMEZONE=<IANA timezone, for example Asia/Tashkent>
PORT=3000
NODE_ENV=production
```

9. Run database setup once:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

10. Run the backend with a process manager such as PM2:

```bash
npm install -g pm2
pm2 start dist/main.js --name hr-roster-backend
pm2 save
pm2 startup
```

11. Build the frontend:

```bash
cd ../frontend
npm ci
VITE_API_BASE_URL=https://<your-domain-or-vm-hostname>/api/v1 npm run build
```

12. Serve `frontend/dist` with Caddy or Nginx, and reverse-proxy `/api/*` to `http://localhost:3000`.

## 3B. Deploy Backend On Koyeb

1. Go to `https://koyeb.com`.
2. Create a new Web Service from the GitHub repository.
3. Set the root directory to:

```text
backend
```

4. Set the build command:

```text
npm ci --include=dev && npx prisma generate && npm run build
```

5. Set the run command:

```text
npm run start
```

6. Add backend environment variables:

```text
DATABASE_URL=<your Neon connection string>
FRONTEND_ORIGIN=<your Vercel frontend URL>
JWT_ACCESS_SECRET=<generate a long random string>
JWT_REFRESH_SECRET=<generate another long random string>
SEED_ADMIN_EMAIL=<your admin email>
SEED_ADMIN_PASSWORD=<a strong password>
SEED_ORGANISATION_NAME=<your organisation name>
SEED_TIMEZONE=<IANA timezone, for example Asia/Tashkent>
```

7. After the first successful deploy, run these once from a Koyeb console or temporary one-off command:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

If Koyeb does not provide an easy one-off command in your account, run those commands locally against the Neon `DATABASE_URL`.

## 3C. Deploy Frontend On Vercel

1. Go to `https://vercel.com`.
2. Import the GitHub repository.
3. Set the root directory to:

```text
frontend
```

4. Set the build command:

```text
npm run build
```

5. Set the output directory:

```text
dist
```

6. Add the frontend environment variable:

```text
VITE_API_BASE_URL=https://<your-koyeb-backend-domain>/api/v1
```

7. Redeploy the frontend after setting the variable.

## 4. First Login

After both services deploy:

1. Open the frontend URL.
2. Log in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
3. Create real users from the Users page.

## 5. If The Frontend Cannot Log In

Check these values first:

- Backend `FRONTEND_ORIGIN` must exactly match the frontend URL, without a trailing slash.
- Frontend `VITE_API_BASE_URL` must be the backend URL plus `/api/v1`, without a trailing slash.

## Free Tier Notes

Free web services can spin down when idle, so use Oracle Cloud Always Free if the backend must stay warm. Neon free databases can also have free-plan limits. This is fine for testing and light usage, but use paid services before relying on it for a business-critical roster.
