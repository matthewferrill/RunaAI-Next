import hashlib
import importlib.metadata
import json
import os
import sys
import time


def digest(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def dependency_failure(factory):
    old_offline = os.environ.get("HF_HUB_OFFLINE")
    old_transformers = os.environ.get("TRANSFORMERS_OFFLINE")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        factory()
        return {"observable": False, "wrapperOutcome": "allowed", "errorClass": None}
    except Exception as error:
        return {"observable": True, "wrapperOutcome": "denied", "errorClass": type(error).__name__, "errorDigest": digest(error)}
    finally:
        if old_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = old_offline
        if old_transformers is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = old_transformers


def run_llm_guard(cases):
    from llm_guard.input_scanners import PromptInjection
    from llm_guard.model import Model

    scanner = PromptInjection()
    records = []
    for case in cases:
        started = time.perf_counter()
        _, valid, score = scanner.scan(case["text"])
        records.append({"id": case["id"], "stratum": case["stratum"], "textSha256": case["textSha256"],
                        "detected": not valid, "score": float(score), "latencyMs": round((time.perf_counter() - started) * 1000, 2)})

    def broken():
        absent = Model(path="runalab/definitely-absent-classifier", revision="0" * 40)
        PromptInjection(model=absent)

    return {"candidate": "protectai-llm-guard", "packageVersion": importlib.metadata.version("llm-guard"),
            "model": "protectai/deberta-v3-base-prompt-injection-v2", "threshold": 0.92,
            "health": {"observable": True, "scansCompleted": len(records)}, "dependencyFailure": dependency_failure(broken), "records": records}


def run_meta(cases):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    model_id = "meta-llama/Llama-Prompt-Guard-2-86M"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForSequenceClassification.from_pretrained(model_id)
    model.eval()
    records = []
    for offset in range(0, len(cases), 8):
        batch = cases[offset:offset + 8]
        started = time.perf_counter()
        encoded = tokenizer([case["text"] for case in batch], padding=True, truncation=True, return_tensors="pt")
        with torch.no_grad():
            probabilities = torch.softmax(model(**encoded).logits, dim=-1)
        elapsed = (time.perf_counter() - started) * 1000 / len(batch)
        for case, row in zip(batch, probabilities):
            label_index = int(torch.argmax(row).item())
            label = str(model.config.id2label[label_index])
            records.append({"id": case["id"], "stratum": case["stratum"], "textSha256": case["textSha256"],
                            "detected": label.upper() not in {"BENIGN", "LABEL_0"}, "label": label,
                            "score": float(row[label_index].item()), "latencyMs": round(elapsed, 2)})

    def broken():
        AutoModelForSequenceClassification.from_pretrained("runalab/definitely-absent-classifier", revision="0" * 40)

    return {"candidate": "meta-prompt-guard-2", "packageVersion": importlib.metadata.version("transformers"),
            "model": model_id, "labelMap": {str(key): value for key, value in model.config.id2label.items()},
            "modelCommit": getattr(model.config, "_commit_hash", None),
            "health": {"observable": True, "scansCompleted": len(records)}, "dependencyFailure": dependency_failure(broken), "records": records}


def run_nemo(cases):
    from nemoguardrails.library.jailbreak_detection.model_based.checks import check_jailbreak, initialize_model

    classifier = initialize_model()
    if classifier is None:
        raise RuntimeError("NeMo classifier failed to initialize")
    records = []
    for case in cases:
        started = time.perf_counter()
        decision = check_jailbreak(case["text"], classifier=classifier)
        records.append({"id": case["id"], "stratum": case["stratum"], "textSha256": case["textSha256"],
                        "detected": bool(decision["jailbreak"]), "score": float(decision["score"]),
                        "latencyMs": round((time.perf_counter() - started) * 1000, 2)})

    def broken():
        initialize_model.cache_clear()
        old = os.environ.pop("EMBEDDING_CLASSIFIER_PATH", None)
        try:
            check_jailbreak("health check", classifier=None)
        finally:
            if old is not None:
                os.environ["EMBEDDING_CLASSIFIER_PATH"] = old

    return {"candidate": "nvidia-nemo-guardrails", "packageVersion": importlib.metadata.version("nemoguardrails"),
            "model": "nvidia/NemoGuard-JailbreakDetect with Snowflake/snowflake-arctic-embed-m-long",
            "health": {"observable": True, "scansCompleted": len(records)}, "dependencyFailure": dependency_failure(broken), "records": records}


dataset_path, candidate = sys.argv[1], sys.argv[2]
with open(dataset_path, "r", encoding="utf-8") as handle:
    cases = json.load(handle)["cases"]

try:
    if candidate == "llm-guard":
        result = run_llm_guard(cases)
    elif candidate == "meta":
        result = run_meta(cases)
    elif candidate == "nemo":
        result = run_nemo(cases)
    else:
        raise ValueError(f"unknown candidate {candidate}")
    result["status"] = "completed"
except Exception as error:
    result = {"candidate": candidate, "status": "blocked-infrastructure", "errorClass": type(error).__name__,
              "errorDigest": digest(error), "errorSummary": str(error)[:300], "records": []}

print(json.dumps(result, separators=(",", ":")))
