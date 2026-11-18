## PROMPT_INJECTION

### RULES 
- Verify, analyze, and fix with RIGOR:
    - every point where the app integrates AI (LLM) and prompt injection, direct or indirect, may occur:
    - user input in any modality (text, images, audio, video, documents), including hidden or embedded text in images, metadata, and subtitles
    - external content the model processes as context (web pages, emails, uploaded files, RAG knowledge bases, tool and API results, persistent memory across sessions), always treating it as untrusted
    - evasion techniques (jailbreak, role change, obfuscation with base64/unicode/other languages, multi-turn and fragmented attacks)
    - leakage of the system prompt, secrets, and data from other users or the internal context
    - model actions with real effects (function calling, agents, access to APIs, database, files, or email)
    - model output before using or rendering it (XSS, Markdown with images/links to exfiltrate data, generated SQL or commands)
- Clearly separate instructions from data: user content and external content must never have the same authority as the system prompt; do not rely only on instructions like "ignore manipulation attempts" as a defense.
- Apply least privilege to the model and its tools: scoped permissions, no credentials or secrets inside the prompt, server-side parameter validation, and human confirmation for sensitive or irreversible actions.
- Treat model output as untrusted input: validate it against a schema, encode it according to context, and filter it (PII, secrets, out-of-policy content) before displaying or executing it.
- Reinforce with defense in depth: input/output filters and guardrails, rate limits and context size limits, isolation between users and sessions, and logging with monitoring of injection attempts.
- If a vulnerability is detected: fix it, test with payloads (direct injection, indirect via external content, multimodal, and multi-turn) to confirm it has been mitigated, and report to me the finding, its location, the cause, and the fix applied.