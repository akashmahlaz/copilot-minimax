#!/usr/bin/env python3
"""Compatibility wrapper for legacy script usage.

The implementation now lives in the modular package `copilot_minimax_core`.
"""

from copilot_minimax_core.cli import main


if __name__ == "__main__":
    main()
