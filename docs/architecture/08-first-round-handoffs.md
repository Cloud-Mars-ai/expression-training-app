# 第一轮并行交接清单

只有主 agent 宣布 contracts 冻结通过后，才可同时启动以下三个 agent。

## Agent 1：浏览器真实录音

排他目录：

- `frontend/src/features/recording/**`
- `frontend/src/hooks/useRecorder*`
- `frontend/src/services/audio*`

交付：

- 基于 MediaRecorder 的开始、暂停、继续、停止和重录。
- 录音前权限检查。
- 录音时长、音量级别、Blob、duration、mimeType、本地预览 URL。
- 无权限、无设备、静音、太短、设备中断和页面离开处理。
- 对状态转换、清理 MediaStream tracks、URL revoke 和错误映射的测试。

禁止：修改 App 路由、页面、contracts、server 或结果数据。

## Agent 2：Attempt、上传和数据库

排他目录：

- `server/src/modules/attempts/**`
- `server/src/modules/uploads/**`
- `server/src/db/**`

交付：

- contracts 中规定的 Attempt 创建、状态更新、上传、查询和删除端点。
- owner 校验、幂等键、状态版本冲突和状态机校验。
- MIME、大小、时长、SHA-256 校验。
- 可替换本地文件存储 adapter。
- SQLite 迁移、repository 和 Fastify inject API 测试。
- 上传成功后进入 `transcribing`；不得调用真实 ASR。

禁止：实现 transcription/evaluation provider，修改 frontend 或 contracts。

## Agent 3：转写和评分 Provider

排他目录：

- `server/src/modules/transcription/**`
- `server/src/modules/evaluation/**`
- `server/src/providers/**`
- `server/test/fixtures/**`

交付：

- `TranscriptionProvider` 接口和 MockProvider。
- `EvaluationProvider` 接口和 MockProvider。
- 带 segment ID、时间戳、置信度的中文转写 fixture。
- 六维评分、一个证据化优点、一个最高优先级问题、改进示例和重练计划。
- 低置信度返回 unscorable，不生成伪低分。
- 评分结构和禁止推断规则测试。

禁止：修改 Attempt 路由、上传、数据库公共结构、frontend 或 contracts。

## 每个 agent 完成时必须报告

1. 修改文件清单。
2. 新增或修改的状态转换。
3. 测试命令和结果。
4. 是否请求 contracts 变更。
5. 未解决问题。

任何 contracts 变更请求都先停止相关实现，由主 agent 审核后统一修改。
