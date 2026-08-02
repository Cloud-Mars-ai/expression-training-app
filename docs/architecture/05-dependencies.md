# 依赖冻结

第一轮不得自行更换框架、升级公共依赖或同时接入多个真实 AI 服务。

## 前端

- React：19.2.8
- React Router DOM：7.18.2
- Vite：8.2.0
- TypeScript：6.0.3
- 浏览器录音：原生 `MediaRecorder`、`MediaStream`、Web Audio API
- 网络：原生 `fetch`

录音模块不增加第三方录音库。

## 服务端

- Node.js：20 以上
- Fastify：5.11.0
- `@fastify/cors`：11.3.0
- `@fastify/multipart`：10.1.0
- Zod：4.4.3
- Drizzle ORM：0.45.2
- better-sqlite3：13.0.2
- tsx：4.23.1
- TypeScript：6.0.3
- `@types/node`：20.19.43，与最低 Node.js 20 运行基线一致

## 测试

- Vitest：4.1.10
- Testing Library React：16.3.2
- happy-dom：20.11.1
- Playwright Core：1.62.1

## 依赖方向

```text
frontend ───────→ contracts
server ─────────→ contracts
attempts ───────→ db + uploads
transcription ──→ TranscriptionProvider
evaluation ─────→ EvaluationProvider
providers ──────→ contracts
contracts ──────→ 无业务运行时依赖
```

禁止 `contracts` 依赖 frontend、server、数据库或具体 Provider。

所有 npm cache、临时目录和安装内容必须位于 `D:\轨迹\大学\表达能力训练APP\试用版1` 内。

