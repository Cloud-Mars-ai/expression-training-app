# 契约冻结说明

冻结版本：`@expression-training/contracts@0.1.0`

以下文件是第一轮并行开发的唯一共享事实来源：

- `contracts/src/domain/attempt.ts`
- `contracts/src/domain/transcript.ts`
- `contracts/src/domain/evaluation.ts`
- `contracts/src/api/common.ts`
- `contracts/src/api/attempts.ts`
- `contracts/src/state/attempt-machine.ts`

## 关键决策

1. Attempt 使用 `schemaVersion: 2`，新旧演示 Attempt 不直接混写。
2. Attempt 的 `status` 使用统一状态机；录音暂停只是浏览器录音器内部状态，不增加 Attempt 状态。
3. 技术失败只记录在 Attempt 的 `failure` 和 `technical-failure` 状态中，不生成 Evaluation。
4. Evaluation 只允许 `scorable` 或 `unscorable`。
5. 只有 `ready` Attempt 可以把 `progressDisposition` 设为 `counted`。
6. 针对性重练创建新的 Attempt，通过 `retryOfAttemptId` 和 `focusIssueId` 关联旧记录。
7. 转写校对只允许修改 segment 文本，不允许客户端修改时间戳、置信度或 segment ID。
8. 所有评分证据必须引用转写 ID、revision、segment ID、时间戳和原文 quote。

## 旧前端适配边界

现有 `frontend/src/domain/models.ts` 仍服务于演示流程，第一轮子 agent 不修改它。主 agent 在集成阶段增加适配层，把旧的：

- `preparing / paused / processing / result / technical-error`

迁移为新的：

- `permission-check / recording / transcribing 或 evaluating / ready / technical-failure`

迁移完成前，新旧存储键必须隔离，不能覆盖 `expression-training:demo-data-v1`。

