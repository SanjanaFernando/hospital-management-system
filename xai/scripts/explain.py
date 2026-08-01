# -*- coding: utf-8 -*-
"""
xai/scripts/explain.py
========================
CLI entry point the Next.js API route spawns as a subprocess.

Usage (matches the "python subprocess per request" architecture):

    python mlops/scripts/explain.py \
        --checkpoint mlops/models/best_mappo_hospital.pth \
        --ward-json '{"totalBeds":37,"occupiedBeds":30,"queue":[...]}' \
        [--with-shap] [--shap-samples 60]

Reads the ward snapshot either from --ward-json (inline string) or from
stdin (recommended for real deployments, since Node's spawn() can pipe
large JSON payloads to stdin far more reliably than a CLI argument, which
has OS-level length limits).

Always prints exactly one JSON object to stdout, on success OR failure, so
the Node side can always `JSON.parse(stdout)` without special-casing.
Diagnostic/debug text goes to stderr only.
"""

import argparse
import json
import sys
import os

# Make sure `xai/explain_engine.py` is importable regardless of the cwd
# the subprocess is spawned from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from explain_engine import explain_decision  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser(description="Explain a MAPPO queue-prioritization decision.")
    parser.add_argument("--checkpoint", required=True, help="Path to MAPPO checkpoint (.pth)")
    parser.add_argument("--ward-json", default=None, help="Inline JSON ward snapshot (optional)")
    parser.add_argument(
        "--forecaster-profile",
        default=None,
        help="Path to xai/config/forecaster_profile.json (optional)",
    )
    parser.add_argument("--with-shap", action="store_true", help="Also compute SHAP attributions (slow)")
    parser.add_argument("--shap-samples", type=int, default=60, help="SHAP KernelExplainer nsamples")
    parser.add_argument("--device", default="cpu")
    return parser.parse_args()


def main():
    args = parse_args()

    try:
        if args.ward_json:
            raw = args.ward_json
        else:
            raw = sys.stdin.read()
        ward_snapshot = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"Failed to parse ward snapshot JSON: {e}"}))
        sys.exit(1)

    try:
        result = explain_decision(
            ward_snapshot,
            checkpoint_path=args.checkpoint,
            device=args.device,
            with_shap=args.with_shap,
            shap_samples=args.shap_samples,
            forecaster_profile_path=args.forecaster_profile,
        )
        print(json.dumps(result))
        sys.exit(0)
    except FileNotFoundError:
        print(json.dumps({"error": f"Checkpoint not found at {args.checkpoint}"}))
        sys.exit(1)
    except Exception as e:  # noqa: BLE001
        # Log the full traceback to stderr for debugging, but keep stdout
        # a single clean JSON object.
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()