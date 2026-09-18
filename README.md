# Pharmacognosy

생약을 분류하고, 계층형 학습 노트를 편집하며, 컬렉션과 Word Card로 공부하는 웹 애플리케이션입니다.

## 시작하기

1. `.env.local`에 Neon PostgreSQL `DATABASE_URL`을 설정합니다.
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
