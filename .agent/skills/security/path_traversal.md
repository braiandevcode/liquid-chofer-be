## PATH_TRAVERSAL

### RULES
- Verify, analyze, and fix with RIGOR:
    - every point where the app uses user-controllable data to build file or directory paths and path traversal (directory traversal, LFI/RFI) may occur:
    - URL parameters, forms, headers, cookies, and JSON fields that reference files (e.g. `?file=`, `?path=`, `?template=`, `?lang=`)
    - file uploads (file name, internal ZIP/TAR paths with Zip Slip, symbolic links) and file downloads or previews
    - read, write, include/require, template, log, export, and image functions that receive dynamic paths
    - evasion techniques (`../`, `..\`, single and double URL encoding, Unicode, null byte, absolute paths, mixed separators, and bypasses of filters that strip `../` only once)
- Prevent user input from becoming part of the path: use indirect identifiers (e.g. an ID mapped to a file on the server) or an allowlist of permitted file names.
- If using the input in the path is unavoidable: normalize it and resolve the canonical path (e.g. `realpath`, `Path.normalize()`, `path.resolve`), validate that it stays within the authorized base directory, and reject the request if it escapes; do not rely on denylists or on replacing `../`.
- Reinforce with defense in depth: least privilege for the process user, file directories outside the webroot, no execute permissions on upload folders, isolation (chroot, container), and no exposure of internal paths in error messages.
- If a vulnerability is detected: fix it, test with payloads (`../../etc/passwd`, `..\..\windows\win.ini`, encoded variants, absolute paths, and Zip Slip) to confirm it has been mitigated, and report to me the finding, its location, the cause, and the fix applied.