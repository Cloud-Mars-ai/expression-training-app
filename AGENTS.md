# Agent working agreement

## Hard scope boundary

- All work for this project must stay under `D:\轨迹\大学\表达能力训练APP\试用版1`.
- Do not delete, move, rewrite, or download files outside that directory.
- Package caches, temporary files, databases, uploads, fixtures, and generated artifacts must stay inside this directory.
- Do not remove `app/`, `启动试用版.bat`, `local-server.ps1`, `使用说明.md`, or `验收报告.md`.

## Frozen shared surface

The main agent owns these files and directories:

- `contracts/**`
- root `package.json`, `.gitignore`, and `AGENTS.md`
- `docs/architecture/**`
- shared routes, shared state, and API integration outside an assigned agent directory

After the first parallel round begins, sub-agents must not change frozen contracts. A needed change must be reported to the main agent with the exact type, endpoint, transition, and compatibility impact.

## Exclusive first-round ownership

- Recording agent: `frontend/src/features/recording/**`, `frontend/src/hooks/useRecorder*`, `frontend/src/services/audio*`.
- Attempt/upload agent: `server/src/modules/attempts/**`, `server/src/modules/uploads/**`, `server/src/db/**`.
- Transcription/evaluation agent: `server/src/modules/transcription/**`, `server/src/modules/evaluation/**`, `server/src/providers/**`, `server/test/fixtures/**`.
- Main agent: contracts, root configuration, integration, frontend pages/routes outside the recording boundary, and final verification.

Agents must not edit another agent's owned files.

## Safety and quality rules

- Technical failure must never create a low score or consume a valid practice count.
- Only an Attempt in `ready` may count toward progress.
- `unscorable`, `technical-failure`, `cancelled`, and `deleted` never count toward progress.
- Evaluation evidence must reference transcript segment IDs and timestamps.
- Do not infer personality, anxiety, intelligence, mental state, or employability from voice.
- Do not add or upgrade dependencies without the main agent updating the dependency freeze.
- Run the relevant typecheck, lint, and tests after each stage.

