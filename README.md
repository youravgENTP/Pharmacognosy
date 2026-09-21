# Herb Overflow

생약을 분류하고, 계층형 학습 노트를 편집하며, 컬렉션과 Word Card로 공부하는 웹 애플리케이션입니다.

## 시작하기

1. `.env.example`을 참고해 `.env.local`을 설정합니다.
2. `npm install`
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm run dev`

## 주요 명령

- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript 검사
- `npm run build` — 프로덕션 빌드
- `npm run db:generate` — Drizzle 마이그레이션 생성
- `npm run db:migrate` — 현재 데이터베이스에 마이그레이션 적용
- `npm run db:seed` — 재실행 가능한 예시 데이터 시드

JSON Import 형식은 앱의 Import 페이지에 v1 예제가 포함되어 있습니다. 가져오기는 서버 검증 및 미리보기 이후에만 명시적 확인을 통해 트랜잭션으로 처리됩니다.

## Authentication

Herb Overflow uses Better Auth with PostgreSQL/Drizzle and is invite-only. Set `DATABASE_URL`, a high-entropy `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `INITIAL_ADMIN_EMAIL` in `.env.local`. Apply the auth migration with `npm run db:migrate`.

In Resend, verify the domain used by `AUTH_EMAIL_FROM`, create an API key with send access, and use the verified sender address. Verification links expire after 24 hours; password-reset links expire after 1 hour. Password resets revoke all existing sessions.

To establish the owner account:

1. Run `npm run auth:bootstrap-admin`. If the account does not exist, this creates a one-use, 7-day bootstrap invitation only for `INITIAL_ADMIN_EMAIL`.
2. Sign up with exactly that email and verify it.
3. Run `npm run auth:bootstrap-admin` again to assign `admin` idempotently, then remove `INITIAL_ADMIN_EMAIL` from the deployed environment.

Admins create later invitations in **Settings → Users**. Each invitation is normalized to lowercase, expires after 7 days, is consumed at signup, and creates an `editor` profile. For local development, run `npm install`, `npm run db:migrate`, perform the admin bootstrap above, then `npm run dev`.

For local development without Resend, `AUTH_DEV_BYPASS_EMAIL=true` disables verification email only while `NODE_ENV` is not `production`. This flag is ignored for production security and must never be enabled in a deployed environment.
