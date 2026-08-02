# 目录边界与 Agent 所有权

## 顶层边界

```text
试用版1/
├─ app/                  已构建成品，第一轮不修改
├─ frontend/             React 前端
├─ server/               Fastify 服务
├─ contracts/            共享类型与 API 契约
├─ docs/architecture/    主 agent 管理的架构记录
├─ local-server.ps1      成品本地服务器
└─ 启动试用版.bat        成品启动入口
```

## 第一轮排他范围

### Agent 1：浏览器录音

只能修改：

- `frontend/src/features/recording/**`
- `frontend/src/hooks/useRecorder*`
- `frontend/src/services/audio*`

不能修改路由、结果页、后端、contracts 或共享状态。

### Agent 2：Attempt 与上传

只能修改：

- `server/src/modules/attempts/**`
- `server/src/modules/uploads/**`
- `server/src/db/**`

不能修改 transcription、evaluation、providers、frontend 或 contracts。

### Agent 3：转写与评分

只能修改：

- `server/src/modules/transcription/**`
- `server/src/modules/evaluation/**`
- `server/src/providers/**`
- `server/test/fixtures/**`

不能修改 Attempt API、上传、数据库公共结构、frontend 或 contracts。

### 主 Agent

负责：

- `contracts/**`
- 根配置和依赖版本
- 目录冲突与契约审查
- 第一轮结束后的录音上传集成
- 状态轮询、转写校对页面和真实结果接入
- 完整测试与最终验收

主 agent 在子 agent 工作期间不修改其排他目录。

