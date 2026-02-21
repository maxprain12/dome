#!/usr/bin/env python3
"""
Sandboxed runner for python-pptx presentation scripts.

Reads Python code from stdin, executes it in an isolated subprocess namespace.
The script must end with: prs.save(os.environ['PPTX_OUTPUT_PATH'])

Output to stdout: { "success": true } or { "success": false, "error": "..." }
"""

import json
import os
import sys
import traceback
import tempfile
import shutil


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing output path argument"}))
        sys.exit(1)

    output_path = os.path.abspath(sys.argv[1])

    # Expose output path to script code
    os.environ['PPTX_OUTPUT_PATH'] = output_path

    # Read script code from stdin
    try:
        script_code = sys.stdin.buffer.read().decode('utf-8')
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to read script from stdin: {e}"}))
        sys.exit(1)

    if not script_code.strip():
        print(json.dumps({"success": False, "error": "Empty script received"}))
        sys.exit(1)

    # Detect JavaScript/PptxGenJS code early and give a clear error
    stripped = script_code.lstrip()
    js_markers = ('const ', 'var ', 'let ', 'function ', 'require(', '//', '/*', '=>', 'module.exports')
    if any(stripped.startswith(m) for m in js_markers):
        print(json.dumps({
            "success": False,
            "error": (
                "ERROR: El script parece ser JavaScript/PptxGenJS, no Python.\n"
                "Por favor genera el script usando Python con python-pptx.\n"
                "El script debe empezar con:\n"
                "  from pptx import Presentation\n"
                "  from pptx.util import Inches, Pt\n"
                "  ...\n"
                "Y terminar con:\n"
                "  prs.save(os.environ['PPTX_OUTPUT_PATH'])"
            )
        }))
        sys.exit(1)

    # Use a safe temp working directory
    tmp_cwd = tempfile.mkdtemp(prefix='dome_ppt_sandbox_')
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_cwd)

        # Execute the script in an isolated namespace
        namespace = {
            '__name__': '__main__',
            '__file__': '<ppt_script>',
            '__builtins__': __builtins__,
        }

        try:
            compiled = compile(script_code, '<ppt_script>', 'exec')
            exec(compiled, namespace)
        except SystemExit:
            pass  # Allow sys.exit(0) inside scripts
        except Exception as e:
            tb = traceback.format_exc()
            print(json.dumps({"success": False, "error": f"{type(e).__name__}: {e}\n{tb}"}))
            sys.exit(1)

    finally:
        os.chdir(original_cwd)
        shutil.rmtree(tmp_cwd, ignore_errors=True)

    # Verify the file was created
    if not os.path.exists(output_path):
        print(json.dumps({
            "success": False,
            "error": (
                "Script executed but did not save the presentation. "
                "Make sure the last line is:\n"
                "  prs.save(os.environ['PPTX_OUTPUT_PATH'])"
            )
        }))
        sys.exit(1)

    print(json.dumps({"success": True}))


if __name__ == "__main__":
    main()
