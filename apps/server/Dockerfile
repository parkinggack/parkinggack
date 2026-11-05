# 주차각 API 서버 이미지 (Node 서버 + 로컬 SQLite 파일, 또는 DATABASE_URL 로 Turso). 빌드 컨텍스트는 저장소 루트 (계약 타입 packages/api-types · 시연 생성기 packages/insights-demo):
#   docker build -f apps/server/Dockerfile -t parkinggack-server .
#   docker run -p 8787:8787 -v parkinggack-data:/data -e ADMIN_TOKEN=$(openssl rand -hex 24) parkinggack-server
# SQLite 는 /data/parkinggack.db — 꼭 영구 볼륨을 붙일 것 (없으면 재배포 때마다 시연 데이터로 다시 시작)
# 무료 서버리스 배포(Netlify 또는 Vercel + Turso)는 이 이미지가 아니라 docs/deploy.md

# ---- 빌드: 의존성 + tsc (libsql 은 glibc 용 미리 빌드된 바이너리를 npm 으로 받는다) ----
FROM node:22-slim AS build
WORKDIR /repo
COPY packages/api-types ./packages/api-types
# 대시보드 시연 생성기 — 시드가 판교 9곳 수치·도면·동선을 여기서 가져온다 (빌드 결과 dist/packages/insights-demo)
COPY packages/insights-demo ./packages/insights-demo
COPY apps/server/package.json apps/server/package-lock.json ./apps/server/
WORKDIR /repo/apps/server
RUN npm ci
COPY apps/server/tsconfig.json apps/server/tsconfig.build.json ./
COPY apps/server/src ./src
RUN npm run build && npm prune --omit=dev

# ---- 실행 ----
FROM node:22-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/parkinggack.db
WORKDIR /app
COPY --from=build /repo/apps/server/package.json ./package.json
COPY --from=build /repo/apps/server/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# NODE_ENV=production 이라 ADMIN_TOKEN(16자 이상)이 없으면 시작하지 않는다
# 시연 데이터 다시 만들기: docker exec <컨테이너> node dist/apps/server/src/cli/seed.js --reset
CMD ["node", "dist/apps/server/src/index.js"]
