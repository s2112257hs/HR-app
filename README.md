# HR Roster Application

This workspace contains two independent application folders:

- `frontend`: React + TypeScript + Vite roster UI
- `backend`: NestJS + Prisma + PostgreSQL REST API

The implementation follows the supplied HR Roster technical framework. The frontend talks to the backend through versioned `/api/v1` REST endpoints, and the backend owns the API contract and database model.

## Local Setup

Install and run each project independently:

```bash
cd backend
npm install
npm run prisma:generate
npm run build
```

```bash
cd frontend
npm install
npm run build
```

Copy each `.env.example` to `.env` and set local values before running development servers.

