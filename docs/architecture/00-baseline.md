# 基线记录

日期：2026-08-02

## 检查结果

- 检查目录：`D:\轨迹\大学\表达能力训练APP\试用版1`。
- Git：当前不是 Git 仓库，没有可用的 commit 或工作区差异基线。
- 原前端目录：`source/`，已在同一目标目录内原样移动为 `frontend/`。
- 现有成品：`app/`，本地启动器不依赖开发目录。
- 现有测试脚本：无单元测试、API 测试或 E2E 测试脚本。
- 现有质量脚本：`build`、`lint`。

## 冻结前基线

- `npm run build`：通过。
- `npm run lint`：通过。
- Vite 生产构建：1823 个模块完成转换。
- 已知依赖公告：React Router 7.18.2 的 RSC Mode CSRF 公告；当前前端是纯客户端 SPA，不使用 RSC、SSR、Actions 或服务端路由。

## 后续要求

第一轮并行开发前必须补齐 Vitest 单元测试和 Fastify API 集成测试入口；完整集成后再加入 Playwright E2E 与四档视觉检查。

## 冻结后自检

- contracts 严格 TypeScript 检查：通过。
- frontend TypeScript + Vite 生产构建：通过。
- frontend ESLint：通过。
- contracts、server 和 frontend 目录之间没有循环依赖。
- server 目录只有边界与依赖清单，没有业务实现。
