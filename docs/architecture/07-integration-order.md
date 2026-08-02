# 集成顺序

## 阶段 0：共同基础

1. 冻结 contracts、状态机、目录边界和依赖版本。
2. 记录当前前端 build/lint 基线。
3. 主 agent 审核任何契约变更请求。

## 第一轮并行

1. Agent 1 完成独立录音模块和状态测试。
2. Agent 2 完成 Attempt、上传、SQLite 迁移与 API 测试。
3. Agent 3 完成 Provider 接口、MockProvider、固定 fixture 与评分结构测试。

三个 agent 均完成并通过各自测试后，主 agent 才开始集成。

## 第一轮集成

1. 审核所有实现是否只依赖 contracts。
2. 组合 Fastify 服务和数据库迁移入口。
3. 将录音 Blob 接入上传服务。
4. 接入 Attempt 状态轮询。
5. 添加转写校对页面并使用 revision 冲突保护。
6. 接入真实 Evaluation 数据，替换 mock 结果读取。
7. 针对 priorityIssue 创建新的重练 Attempt。
8. 验证删除 Attempt、Transcript、Evaluation 和音频。

## 第二轮并行

第一轮集成测试通过后才能开始：

- 转写校对页面细化。
- 成长记录与复习计划。
- 20 至 30 个原创练习及 rubric。
- E2E 与移动端视觉测试。
- 隐私授权、删除和保留策略。

## AI 接入顺序

1. 先保留 MockProvider，跑通完整闭环。
2. 只选择一个 ASR Provider。
3. 闭环稳定后只选择一个 Evaluation Provider。
4. 备用 Provider 必须在同一接口后面增加，不能渗透到业务模块。

