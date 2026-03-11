"""Pre-download ML models with progress indicators.

Run during `docker build` so the image ships with models baked in
and container startup is near-instant.

Usage:
    python -m app.download_models          # standard
    python -m app.download_models --quiet  # suppress progress bars
"""

import sys
import os
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Models to download ──────────────────────────────────────────────
# "required" means the build fails if it can't download.
# "optional" means the build continues (it has working fallbacks).
MODELS = [
    {
        "name": "SPECTER2-base Embeddings",
        "id": "allenai/specter2_base",
        "loader": "AutoModel",
        "required": True,
    },
    {
        "name": "all-MiniLM-L6-v2 (lightweight fallback)",
        "id": "sentence-transformers/all-MiniLM-L6-v2",
        "loader": "SentenceTransformer",
        "required": True,
    },
    {
        "name": "Cross-Encoder Reranker",
        "id": "cross-encoder/ms-marco-MiniLM-L-6-v2",
        "loader": "CrossEncoder",
        "required": True,
    },
]

# ── Helpers ─────────────────────────────────────────────────────────

def _download_auto_model(model_id: str) -> None:
    """Download model + tokenizer weights using AutoModel (no ST config needed)."""
    from transformers import AutoModel, AutoTokenizer
    AutoTokenizer.from_pretrained(model_id)
    AutoModel.from_pretrained(model_id)


def _download_sentence_transformer(model_id: str) -> None:
    from sentence_transformers import SentenceTransformer
    SentenceTransformer(model_id)


def _download_cross_encoder(model_id: str) -> None:
    from sentence_transformers import CrossEncoder
    CrossEncoder(model_id, max_length=512)


LOADERS = {
    "AutoModel": _download_auto_model,
    "SentenceTransformer": _download_sentence_transformer,
    "CrossEncoder": _download_cross_encoder,
}


def download_all(quiet: bool = False) -> None:
    """Download every model in MODELS with a live progress banner."""
    total = len(MODELS)
    succeeded = []
    warned = []
    critical_failures = []

    print()
    print("=" * 60)
    print("  📦  OpenResearch — Downloading ML Models")
    print("=" * 60)
    print()

    for idx, model in enumerate(MODELS, 1):
        name = model["name"]
        model_id = model["id"]
        loader_name = model["loader"]
        required = model["required"]

        header = f"[{idx}/{total}]  {name}  ({model_id})"
        tag = "" if required else "  [optional]"
        print(f"⏳  {header}{tag}")
        print(f"    → Downloading and caching weights …")
        sys.stdout.flush()

        start = time.time()
        try:
            loader_fn = LOADERS[loader_name]
            loader_fn(model_id)
            elapsed = time.time() - start

            # Try to report cached size
            try:
                from huggingface_hub import scan_cache_dir
                cache_info = scan_cache_dir()
                size_str = "unknown size"
                for repo in cache_info.repos:
                    if model_id.replace("/", "--") in str(repo.repo_path):
                        size_str = f"{repo.size_on_disk / 1_000_000:.1f} MB"
                        break
            except Exception:
                size_str = "unknown size"

            print(f"    ✅  Done in {elapsed:.1f}s  ({size_str})")
            succeeded.append(name)
        except Exception as exc:
            elapsed = time.time() - start
            if required:
                print(f"    ❌  FAILED after {elapsed:.1f}s — {exc}")
                critical_failures.append(name)
            else:
                print(f"    ⚠️   Skipped after {elapsed:.1f}s (optional) — {exc}")
                warned.append(name)
        print()
        sys.stdout.flush()

    # Summary
    print("=" * 60)
    if critical_failures:
        print(f"  ❌  {len(critical_failures)} required model(s) failed!")
        for name in critical_failures:
            print(f"      ❌  {name}")
    elif warned:
        print(f"  ✅  {len(succeeded)}/{total} models downloaded ({len(warned)} optional skipped)")
        for name in warned:
            print(f"      ⚠️   {name} (optional, has fallback)")
    else:
        print(f"  ✅  All {total} models downloaded successfully!")
    print("=" * 60)
    print()
    sys.stdout.flush()

    # Only fail the build if a REQUIRED model failed
    if critical_failures:
        sys.exit(1)


if __name__ == "__main__":
    quiet = "--quiet" in sys.argv
    download_all(quiet=quiet)
