## XXE

### RULES
- Verify, analyze, and fix with RIGOR:
    - every point where the app processes XML, directly or indirectly, and XXE may occur:
    - endpoints and APIs that accept XML (SOAP, REST with Content-Type application/xml or text/xml, RSS/Atom, SAML)
    - file uploads that are internally XML or ZIP containing XML (SVG, DOCX, XLSX, PPTX, ODT, GPX, KML)
    - XML/XSLT libraries, parsers, and processors, including third-party dependencies and default configurations
    - any endpoint that accepts JSON or other formats and could be switched to XML by modifying the Content-Type
- Disable DTDs and external entities in all parsers (DOCTYPE, general and parameter entities, XInclude, and XSLT with external functions); if the business requires DTDs, restrict resolution to local, explicitly authorized resources (allowlist).
- Configure each parser with the secure options of its language (e.g. `disallow-doctype-decl` and `FEATURE_SECURE_PROCESSING` in Java, `resolve_entities=False` and `defusedxml` in Python, `libxml_disable_entity_loader` in PHP) and keep the libraries up to date.
- Prevent the full impact of XXE: local file read, SSRF to internal services or cloud metadata, denial of service (Billion Laughs) and, when the environment allows it, remote code execution; additionally, restrict the server's outbound network access and apply least privilege.
- Prefer simpler data formats (JSON) when XML is not needed.
- If a vulnerability is detected: fix it, test with payloads (classic external entity, out-of-band/blind, and XInclude) to confirm it has been mitigated, and report to me the finding, its location, the cause, and the fix applied.