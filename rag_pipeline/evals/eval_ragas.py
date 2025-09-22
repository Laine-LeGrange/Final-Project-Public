# This code is adapted from RAGAs to work with this rag_pipeline setup.

# It does not currently produce results, and requires further work

# Import standard libraries
from __future__ import annotations
import os, json, argparse, pathlib

# Import third-party libraries from ragas
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, context_precision, context_recall, answer_relevancy

# project imports
from rag_pipeline.settings import load_config, Settings
from rag_pipeline.generation.chat import answer_question
from rag_pipeline.providers.llms import build_llm
from rag_pipeline.providers.embeddings import build_embeddings
from rag_pipeline.vector_store.supabase_vs import build_supabase_vectorstore
from rag_pipeline.retrieval.retrievers import retrieve_with_expansion


# Helpers
def load_jsonl(path: str) -> list[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


# Parse RAGAS results
def parse_metrics(res) -> dict[str, float]:
    """Handle RAGAS return object simply."""

    # Different versions of ragas return different structures
    if isinstance(res, dict) and "results" in res:
        return {m["name"]: float(m["score"]) for m in res["results"]}
    scores = getattr(res, "scores", None)
    if isinstance(scores, dict):
        return {str(k): float(getattr(v, "score", v)) for k, v in scores.items()}
    return {}

# Main function
def main():
    ap = argparse.ArgumentParser("Run RAGAS with your rag_pipeline using a JSONL dataset.")
    ap.add_argument("--config", required=True, help="rag_pipeline YAML (e.g., rag_pipeline/config.yaml)")
    ap.add_argument("--dataset", required=True, help="JSONL with fields: question, ground_truth, topic_id, user_id")
    ap.add_argument("--out", default="rag_pipeline/evals/results.json", help="Where to write macro scores")
    ap.add_argument("--limit", type=int, default=None, help="Optional cap on rows")
    ap.add_argument("--topic-id", default=None, help="Override topic_id for all rows")
    args = ap.parse_args()

    # Get API key from settings if not set in env
    s = Settings()
    if s.OPENAI_API_KEY and not os.getenv("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = s.OPENAI_API_KEY

    # Load config + components
    cfg = load_config(args.config) or {}
    search_cfg = (cfg.get("vector_store", {}).get("search", {}) or {})
    max_contexts = int((cfg.get("evaluation", {}) or {}).get("max_contexts", 6))

    # Build components for RAG
    llm = build_llm(**(cfg.get("llm") or {}))
    emb = build_embeddings(**(cfg.get("embeddings") or {}))
    vs = build_supabase_vectorstore(emb)


    # Parse search config
    # Get retriever mode, fetch_k, top_k
    retriever_mode = (search_cfg.get("retriever") or "multiquery").lower()
    fetch_k = int(search_cfg.get("fetch_k", 120))
    top_k = int(search_cfg.get("top_k", 30))
    use_multi = (retriever_mode == "multiquery")

    # Load dataset
    rows = load_jsonl(args.dataset)
    if args.limit:
        rows = rows[: args.limit]
    if args.topic_id:
        for r in rows:
            r["topic_id"] = args.topic_id

    # Print summary info
    print(f"Loaded {len(rows)} rows from {args.dataset}")
    print(f"Retrieval: mode={retriever_mode} fetch_k={fetch_k} top_k={top_k} max_contexts={max_contexts}")

    # Build inputs for RAGAS
    questions, truths, answers, contexts = [], [], [], []

    # Process each row
    for i, r in enumerate(rows):
        q = r["question"]
        gt = r["ground_truth"]
        topic_id = r["topic_id"]

        # Use chat pipeline to answer
        res = answer_question(session_id="eval", topic_id=topic_id, query=q, prefs={})
        ans = res.get("answer") if isinstance(res, dict) else str(res or "")

        # Retrieve contexts
        docs = retrieve_with_expansion(
            vs=vs,
            llm=llm,
            query=q,
            topic_id=topic_id,
            fetch_k=fetch_k,
            filters={"topic_id": topic_id, "is_active": True},
            mode=retriever_mode,
            expansions=3,
            use_multiquery=use_multi, #
            use_hyde=False,
            hyde_n=1,
        )
        ctx = []
        for d in docs[:max_contexts]:
            t = (d.get("content") or "").strip()
            if t:
                ctx.append(t)

        questions.append(q)
        truths.append(gt)
        answers.append(ans)
        contexts.append(ctx)

        # Log progress of processed rows
        if (i + 1) % 10 == 0 or (i + 1) == len(rows):
            print(f"Processed {i+1}/{len(rows)}")

    # filtering: keep rows with some context and ground truth
    keep = [(q, a, c, gt) for q, a, c, gt in zip(questions, answers, contexts, truths) if gt and c]

    question, ans, contexts, gts = zip(*keep)
    ds = Dataset.from_dict({"question": list(question), "answerwer": list(ans), "contexts": list(contexts), "ground_truth": list(gts)})

    # Run RAGAS with core metrics
    ragas_resutls = evaluate(ds, metrics=[faithfulness, context_recall, context_precision, answer_relevancy])
    macro = parse_metrics(ragas_resutls)

    # Save + print
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"metrics": macro, "num_samples": len(ds)}, f, ensure_ascii=False, indent=2)

    # Print results
    print("\nRAGAS (macro) scores")
    for k, v in macro.items():
        print(f"- {k}: {v:.4f}")
    print(f"\nSaved results to: {args.out}")

# Run main
if __name__ == "__main__":
    main()
