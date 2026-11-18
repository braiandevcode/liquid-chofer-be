## COMMAND_INJECTION

### RULES
- Verify, analyze, and fix with RIGOR:
    - every point where the app executes operating system commands or processes user-controllable data with external tools, and command injection (OS command injection, argument injection) may occur:
    - calls to execution functions (e.g. `exec`, `system`, `popen`, `shell_exec`, `child_process.exec`, `subprocess` with `shell=True`, `Runtime.exec`, backticks) and to utilities invoked from code (ping, nslookup, git, tar, ffmpeg, ImageMagick, exiftool, wkhtmltopdf)
    - URL parameters (query string), forms, headers, cookies, JSON fields, and file names that reach a command, directly or indirectly
    - images and files, uploaded or consumed from a URL or query string (e.g. `?url=`, `?file=`, `?size=`): file name, conversion or resizing parameters, metadata, and formats processed by vulnerable libraries (e.g. ImageMagick/ImageTragick, exiftool, ghostscript)
    - injection and evasion techniques (separators and operators such as `;`, `|`, `||`, `&`, `&&`, line breaks, backticks, `$()`, redirections, argument injection with `-` or `--`, encoding, environment variables, wildcards, and variants for Windows and Linux)
    - blind injection: commands with no visible output, detectable through delays (`sleep`), outbound requests (out-of-band), or written files
    - relative or PATH-dependent paths when invoking binaries, and configuration files, templates, or scripts that the user can modify and that are later executed
- Avoid executing system commands when a native alternative exists: use language libraries or APIs instead of invoking the shell (e.g. an image library instead of `convert` via command line).
- If executing a command is unavoidable: use the API that receives arguments as a list (e.g. `subprocess.run([...], shell=False)`, `execFile`, `ProcessBuilder`) without going through the shell, invoke the binary by absolute path, validate input with a strict allowlist (format, length, allowed characters), separate options from data with `--`, and do not rely on denylists or on escaping characters by hand.
- Treat file names and file contents as untrusted input: generate random names on the server, do not use the original name in commands, and keep processing tools up to date with their security policies enabled (e.g. `policy.xml` in ImageMagick).
- Reinforce with defense in depth: run the process with least privilege, in a container or sandbox, with a read-only file system when possible, CPU, memory, and time limits, restriction of outbound network traffic, and logging of executions.
- If a vulnerability is detected: fix it, test with payloads (separators `;`, `|`, `&&`, `$()`, backticks, argument injection, blind with `sleep` and out-of-band, malicious file name, and manipulated image) to confirm it has been mitigated, and report to me the finding, its location, the cause, and the fix applied.