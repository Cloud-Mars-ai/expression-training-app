# 持久化模型冻结

Agent 2 根据此模型编写迁移，不自行改动字段语义。

## 表

### attempts

- `id`、`owner_id`
- `exercise_id`、`exercise_version_id`、`framework_id`
- `status`、`status_version`
- `retry_of_attempt_id`、`focus_issue_id`
- `progress_disposition`
- `failure_code`、`failure_stage`、`failure_message`、`failure_retryable`
- `created_at`、`updated_at`、`ready_at`、`deleted_at`

### audio_assets

- `id`、`attempt_id`
- `storage_key`
- `mime_type`、`byte_size`、`duration_ms`、`sha256`
- `created_at`、`deleted_at`

### transcripts

- `id`、`attempt_id`
- `status`、`revision`、`language`、`confidence`
- `provider_id`、`provider_model`、`provider_request_id`
- `full_text`
- `created_at`、`updated_at`、`reviewed_at`

### transcript_segments

- `id`、`transcript_id`、`revision`、`ordinal`
- `start_ms`、`end_ms`、`text`、`confidence`

每次用户校对产生新 revision，不能覆盖旧 revision；Evidence 必须能重放到评分时使用的 revision。

### evaluations

- `id`、`attempt_id`、`transcript_id`、`transcript_revision`
- `status`、`rubric_version`、`confidence`
- `overall_score` 可空；unscorable 时必须为空
- `payload_json`
- `created_at`

### idempotency_keys

- `owner_id`、`method`、`route`、`key`
- `request_fingerprint`
- `response_status`、`response_body`
- `created_at`、`expires_at`

## 删除与所有权

- 所有查询必须带 owner 条件。
- DELETE 先写 tombstone，再删除音频文件；任何一步失败都不能把 Attempt 标记为 ready 或 counted。
- 删除完成后不得继续返回 Transcript、Evaluation 或音频路径。
- 本地文件存储必须通过 adapter，数据库只保存 storage key，不保存绝对路径。

