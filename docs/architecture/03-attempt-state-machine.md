# Attempt 状态机

主路径：

```text
created
→ permission-check
→ recording
→ uploading
→ transcribing
→ transcript-review
→ evaluating
→ ready
```

异常或终止状态：

```text
cancelled
technical-failure
unscorable
deleted
```

规范转换以 `contracts/src/state/attempt-machine.ts` 为准。

## 所有权

- 前端可请求：`permission-check`、`recording`、`cancelled`。
- Attempt/upload 服务可写：`uploading`、`transcribing`、上传阶段的 `technical-failure`。
- Transcription 模块可写：`transcript-review`、`unscorable`、转写阶段的 `technical-failure`。
- Evaluation 模块可写：`evaluating`、`ready`、`unscorable`、评分阶段的 `technical-failure`。
- 删除流程可把任何非 deleted 状态写为 `deleted`。

## 评分与进度约束

- `ready`：存在 `scorable` Evaluation，可以计入进度。
- `unscorable`：可以存在 `unscorable` Evaluation，但没有总分，不计入进度。
- `technical-failure`：不得存在新 Evaluation，不显示低分，不计入进度。
- `cancelled`：不计入进度。
- `deleted`：所有关联数据不可再读取，GET 返回 410 或 404，具体策略由 API 实现统一确定。

暂停、继续、静音提示、权限被撤销等属于浏览器录音器状态；它们不会绕过服务端 Attempt 转换校验。

