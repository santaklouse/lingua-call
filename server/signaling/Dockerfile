FROM oven/bun:1.4
WORKDIR /app
COPY server/signaling/signaling.ts server/signaling/index.ts ./
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=3s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "run", "index.ts"]
