"""CLI entrypoint for copilot-minimax."""

from __future__ import annotations

import argparse

from .commands import cmd_inspect, cmd_patch, cmd_report, cmd_restore, cmd_status, cmd_validate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="copilot-minimax",
        description="Patch VS Code Copilot Chat to use MiniMax API instead of Anthropic.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_patch = sub.add_parser("patch", help="Apply MiniMax patches to Copilot Chat")
    p_patch.add_argument(
        "--key",
        metavar="API_KEY",
        help="MiniMax API key (also configures Claude Code env vars in settings.json)",
    )
    p_patch.add_argument(
        "--patch-file",
        metavar="PATCH_FILE",
        help="Path to JSON patch file for additional extension.js replacements",
    )

    p_validate = sub.add_parser(
        "validate",
        help="Dry-run patch validation without modifying extension.js",
    )
    p_validate.add_argument(
        "--patch-file",
        metavar="PATCH_FILE",
        help="Optional JSON patch file to validate against extension.js",
    )

    p_report = sub.add_parser(
        "report",
        help="Show current patch markers and optional custom patch rule hits",
    )
    p_report.add_argument(
        "--patch-file",
        metavar="PATCH_FILE",
        help="Optional JSON patch file to report match counts",
    )

    p_inspect = sub.add_parser(
        "inspect",
        help="Inspect extension.js and print keyword-based anchor snippets",
    )
    p_inspect.add_argument(
        "--keyword",
        dest="keywords",
        action="append",
        required=True,
        help="Keyword to inspect (repeat flag for multiple keywords)",
    )
    p_inspect.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Max snippets to show per keyword (default: 5)",
    )
    p_inspect.add_argument(
        "--context",
        type=int,
        default=90,
        help="Context chars around each keyword hit (default: 90)",
    )

    sub.add_parser("restore", help="Restore original extension.js from backup")
    sub.add_parser("status", help="Show current patch status")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "patch":
        cmd_patch(api_key=args.key, patch_file_arg=args.patch_file)
    elif args.command == "validate":
        cmd_validate(patch_file_arg=args.patch_file)
    elif args.command == "report":
        cmd_report(patch_file_arg=args.patch_file)
    elif args.command == "inspect":
        cmd_inspect(
            keywords=args.keywords,
            limit=args.limit,
            context_chars=args.context,
        )
    elif args.command == "restore":
        cmd_restore()
    elif args.command == "status":
        cmd_status()


if __name__ == "__main__":
    main()
