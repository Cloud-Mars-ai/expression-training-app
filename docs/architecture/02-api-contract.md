# Attempt API 契约

基础路径：`/v1`

本地 MVP 使用 `x-demo-user-id` 作为临时身份头。服务端必须从请求上下文取得 owner，不能信任请求正文中的 owner ID。未来接入真实认证时替换身份适配器，不改变业务请求体。

## 统一响应

成功响应：

```ts
type ApiSuccess<T> = {
  data: T;
  meta: { requestId: string; serverTime: string };
};
```

错误响应：

```ts
type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string>;
  };
  meta: { requestId: string; serverTime: string };
};
```

## 端点

| 方法 | 路径 | 用途 | 幂等要求 | 成功状态 |
| --- | --- | --- | --- | --- |
| POST | `/v1/attempts` | 创建 Attempt | 必须提供 `Idempotency-Key` | 201 |
| PATCH | `/v1/attempts/:id/status` | 写入客户端管理的 permission-check、recording 或 cancelled | `expectedStatusVersion` | 200 |
| POST | `/v1/attempts/:id/audio` | multipart 上传真实录音 | 必须提供 `Idempotency-Key` | 202 |
| GET | `/v1/attempts/:id` | 获取 Attempt、Transcript、Evaluation 聚合 | 不需要 | 200 |
| PATCH | `/v1/attempts/:id/transcript` | 提交用户校对后的 segment 文本 | `baseRevision` | 200 |
| POST | `/v1/attempts/:id/evaluation` | 按指定 transcript revision 请求评分 | 必须提供 `Idempotency-Key` | 202 |
| DELETE | `/v1/attempts/:id` | 删除 Attempt 及关联数据 | DELETE 自身幂等 | 204 |

## 上传格式

`POST /audio` 使用 `multipart/form-data`：

- `audio`：二进制文件。
- `metadata`：序列化后的 `AudioUploadMetadata` JSON。

服务端以实际文件为准校验 MIME、字节数、时长和 SHA-256；客户端 metadata 不能作为可信依据。第一版允许的 MIME 与大小上限由 Attempt/upload agent 写入单一配置文件，不能散落在路由中。

## 幂等规则

- key 作用域：owner + HTTP method + normalized route + key。
- key 建议为 UUID，长度 8 至 128。
- 相同 key 和相同请求指纹返回原响应。
- 相同 key 但请求指纹不同返回 409 `IDEMPOTENCY_CONFLICT`。
- 本地 MVP 保留 24 小时。

## 轮询规则

前端只轮询 `GET /v1/attempts/:id`。建议 1 秒、2 秒、3 秒、5 秒退避，之后保持 5 秒；页面隐藏时暂停。轮询不会触发新转写或新评分。

