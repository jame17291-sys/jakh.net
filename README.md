# JAKH Riddles — jakh.net

Bilingual (English + Arabic) riddle and quiz platform.

## Monorepo Structure

```
jakh.net/
├── web/          ← Static frontend (deployed to /var/www/jakh.net on EC2)
├── api/          ← TypeScript/Express backend (deployed to /var/www/jakh.net-api on EC2)
├── ios/          ← Capacitor iOS app
└── .github/
    └── workflows/
        └── deploy.yml   ← Auto-deploys on push to main
```

## Deployment

Push to `main` → GitHub Actions auto-deploys:
- Changes in `web/` → rsync to EC2 `/var/www/jakh.net/` + recompress assets
- Changes in `api/` → rsync to EC2, `npm ci`, `tsc`, `pm2 restart jakh-api`

**Server**: EC2 Ubuntu, 18.185.129.207  
**Nginx**: HTTPS via Let's Encrypt, `/api/` and `/ws/` proxied to port 3000  
**DB**: PostgreSQL via Prisma

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `EC2_SSH_KEY` | Contents of the EC2 `.pem` key file |

## Local Development

```bash
# Frontend — open web/ directly in browser (static files)

# Backend API
cd api
npm install
cp .env.example .env   # fill in DATABASE_URL etc.
npm run dev
```
