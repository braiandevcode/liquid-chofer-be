## XSS

### RULES 
- Verify, analyze, and fix with RIGOR:
    - all data entry and output points of the app where XSS may originate (reflected, stored, and DOM-based):
    - text (forms, URL parameters, headers, cookies, localStorage, and API data)
    - file uploads (content, file name, metadata, and active formats such as SVG or HTML)
    - prompts and responses from third-party AI systems (always treat them as untrusted input before rendering them)
    - downloads (Content-Type, Content-Disposition, and X-Content-Type-Options: nosniff)
- Apply context-aware output encoding (HTML, attribute, JavaScript, URL, CSS) and sanitize with a proven library (e.g. DOMPurify) when HTML is allowed; avoid dangerous sinks (innerHTML, dangerouslySetInnerHTML, eval, document.write).
- Reinforce with defense in depth: strict CSP and session cookies with HttpOnly, Secure, and SameSite.
- If a vulnerability is detected: fix it, test with payloads to confirm it has been mitigated, and report to me the finding, its location, the cause, and the fix applied.