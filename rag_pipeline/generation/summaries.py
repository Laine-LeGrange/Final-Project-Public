
# This implementation uses LangGraph to create a map-reduce style summary generation pipeline.
# It is based off of the tutorial implementation in LangChain.
# LangChain Documentation: https://python.langchain.com/docs/tutorials/summarization/

# Import standard libraries
from __future__ import annotations
import asyncio
import operator
import json
from collections import defaultdict
from typing import Annotated, Callable, Dict, List, Literal, Optional, TypedDict

# Import langchain and langgraph libraries
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from langchain.chains.combine_documents.reduce import (
    acollapse_docs,
    split_list_of_docs,
)

from langgraph.constants import Send
from langgraph.graph import END, START, StateGraph

# Import local modules
from rag_pipeline.settings import load_config
from rag_pipeline.providers.llms import get_llm

# Import logging and setup
from langgraph.checkpoint.memory import InMemorySaver
import logging, os

log = logging.getLogger("rag.summaries")


# ------------------------ PROMPTS ----------------------- #
# Prompts for different summary modes
PROMPTS = {
    "short": {
        "map": ChatPromptTemplate.from_messages([
            ("human",
             "You are a precise summarizer.\n"
             "Write a concise, factual **Markdown** paragraph summarizing the following content for a busy student.\n"
             "Avoid fluff, no headings.\n\n{context}")
        ]),
        "reduce": ChatPromptTemplate.from_messages([
            ("human",
             "You will consolidate multiple short summaries into **ONE** crisp **Markdown** paragraph (5–7 sentences max).\n"
             "Keep it factual and non-repetitive. No bullet points, no headings. Make 3 important key terms formatted bold\n\n{docs}\n\nFinal short summary:")
        ]),
        "token_max": 3200,
    },
    "long": {
        "map": ChatPromptTemplate.from_messages([
            ("human",
             "You are a thorough summarizer.\n"
             "Summarize the following content as clear **Markdown** paragraphs with good coverage.\n"
             "Prefer clarity over brevity. Make use of headings and breaks after sections when necessary.\n\n{context}")
        ]),
        "reduce": ChatPromptTemplate.from_messages([
            ("human",
             "Synthesize the multiple detailed summaries into one comprehensive **Markdown** summary of **~250–400 words** (≈2–5 paragraphs).\n"
             "Be cohesive, remove repetition, and avoid tables unless necessary.\n\n{docs}\n\nFinal long summary (250–400 words):")
        ]),
        "token_max": 6000,
    },
    "key_concepts": {
        "map": ChatPromptTemplate.from_messages([
            ("human",
             "Extract key concepts/terms from the content **with a one-sentence definition each**.\n"
             "Return **Markdown bullet list** only, one item per line in the format:\n"
             "- **Term**: short definition\n"
             "Aim for **8–15** items. No headings, no extra text.\n\n{context}")
        ]),
        "reduce": ChatPromptTemplate.from_messages([
            ("human",
             "You are merging multiple concept lists. **Deduplicate** near-duplicates (normalize casing & singular/plural),\n"
             "pick the clearest name, and keep **one sentence** per definition.\n"
             "Return **only** a compact **Markdown** bullet list (limit to **6–10** items) in the format:\n"
             "- **Term**: short definition\n\n{docs}\n\nFinal merged list (6–10 items):")
        ]),
        "token_max": 3200,
    },
}

# --------------------- HELPER FUNCTIONS ----------------------- #
# Roughly calculate token count
def calc_approx_tokens(text: str) -> int:
    """Rough calculation for fallback token count (char/4)."""
    if not text:
        return 0
    return max(1, len(text) // 4)

# Count with LLM if possible
def count_tokens_llm(text: str, llm) -> int:
    """Try LLM counter, else use the approximate."""
    try:
        n = int(llm.get_num_tokens(text))
        return n if n > 0 else calc_approx_tokens(text)
    except Exception:
        return calc_approx_tokens(text)

# Group and stuff documents by metadata key
def group_and_stuff_docs(
    docs: List[Document],
    group_key: str = "document_id",
    stuff_token_limit: int = 10000,
) -> List[Document]:
    """
    Group chunks by their metadata and  stuff them into larger docs
    """

    # Return empty if no docs
    if not docs:
        return []

    # Group documents by the specified metadata key
    if group_key == "none":
        buckets: Dict[str, List[Document]] = {"__all__": docs}
    else:
        # Group by the specified key
        buckets = defaultdict(list)
        for d in docs:
            md = d.metadata or {}
            key_val = None
            if group_key == "document_id":
                key_val = (
                    md.get("document_id")
                    or md.get("doc_id")
                    or md.get("id")
                    or md.get("source_id")
                )
            # Fallbacks for file_name
            elif group_key == "file_name":
                key_val = md.get("file_name") or md.get("source") or md.get("path")
            buckets[str(key_val or "__unknown__")].append(d)

    # stuff documents in each bucket into larger documents
    stuffed: List[Document] = []
    for _k, items in buckets.items():
        buf: List[str] = []
        cur_tokens = 0
        for d in items:
            txt = d.page_content or ""

            # Calculate tokens and stuff accordingly
            t = calc_approx_tokens(txt)
            if cur_tokens + t > stuff_token_limit and buf:
                stuffed.append(Document(page_content="\n\n".join(buf)))
                buf, cur_tokens = [], 0
            buf.append(txt)
            cur_tokens += t
        if buf:
            stuffed.append(Document(page_content="\n\n".join(buf)))
    # Done stuffing documents
    return stuffed

# --------------------- Main Graph and Runners ----------------------- #
# Define the overall state structure
class OverallState(TypedDict):
    """Overall state for the summary generation process."""
    mode: Literal["short", "long", "key_concepts"]
    contents: List[str]  # already stuffed & capped
    summaries: Annotated[list[str], operator.add]
    collapsed_summaries: List[Document]
    final_summary: str
    debug: Dict[str, str]  #  for tracing summary steps

# Define the state for individual summary generation
class SummaryState(TypedDict):
    """State for individual summary generation."""
    mode: Literal["short", "long", "key_concepts"]
    content: str
    debug: Dict[str, str] 

# Fetch default LLM 
def fetch_llm_defaults():
    """Fetch default LLM settings from config."""
    cfg = load_config() or {}
    llm_cfg = (cfg.get("llm") or {}) if isinstance(cfg, dict) else {}

    # Return defaults
    return {
        "model": llm_cfg.get("model") or "gpt-4o-mini",
        "temperature": float(llm_cfg.get("temperature", 0.2)),
        "max_output_tokens": int(llm_cfg.get("max_output_tokens", 800)),
    }

# Fetch LLMs for map and reduce
def fetch_llms(prefs: Optional[dict]):
    """ Fetch LLMs for map and reduce based on preferences or defaults. """
    cfg = load_config() or {}
    cfg_summ = (cfg.get("summaries") or {})
    cfg_defaults = fetch_llm_defaults()

    # Prefer per-request prefs.summaries, else config.summaries
    sp = ((prefs or {}).get("summaries") or cfg_summ)

    # Can set different models for map and reduce
    map_model = sp.get("map_model", cfg_defaults["model"])
    reduce_model = sp.get("reduce_model", cfg_defaults["model"])

    # Temperature / max tokens: allow summaries-specific overrides; fall back to llm defaults
    temperature = float(
        (prefs or {}).get("temperature",
            cfg_summ.get("temperature", cfg_defaults["temperature"]))
    )
    max_out = int(
        (prefs or {}).get("max_output_tokens",
            cfg_summ.get("max_output_tokens", cfg_defaults["max_output_tokens"]))
    )

    llm_map = get_llm(model=map_model, temperature=temperature, max_output_tokens=max_out)
    llm_reduce = get_llm(model=reduce_model, temperature=temperature, max_output_tokens=max_out)
    return llm_map, llm_reduce

# Build the state graph for summary generation
def build_graph(prefs: Optional[dict] = None, debug: bool = False):
    """
    Build the LangGraph state graph for summary generation using
    Map-reduce with cheaper model for MAP and stronger for REDUCE
    (overridable via prefs.summaries.map_model / reduce_model).
    """

    # Fetch LLMs and setup parser
    llm_map, llm_reduce = fetch_llms(prefs)
    parser = StrOutputParser()

    # Define chains for map and reduce
    def map_chain_for(mode: str):
        return PROMPTS[mode]["map"] | llm_map | parser

    def reduce_chain_for(mode: str):
        return PROMPTS[mode]["reduce"] | llm_reduce | parser

    # generate summary node
    async def generate_summary(state: SummaryState):
        mode = state["mode"]
        content = state["content"]
        
        # Add debug tracing
        debug_info = state.get("debug", {})
        if debug:
            debug_info[f"map_prompt_{mode}"] = str(PROMPTS[mode]["map"].format_messages(context=content[:200] + "..."))
            debug_info[f"map_input_tokens_{mode}"] = str(count_tokens_llm(content, llm_map))
            log.info(f"[SUMMARY MAP {mode.upper()}] Input tokens: {debug_info[f'map_input_tokens_{mode}']}")
        
        resp = await map_chain_for(mode).ainvoke({"context": content})
        
        # Add response debug info
        if debug:
            debug_info[f"map_response_{mode}"] = resp[:200] + "..." if len(resp) > 200 else resp
            debug_info[f"map_output_tokens_{mode}"] = str(count_tokens_llm(resp, llm_map))
            log.info(f"[SUMMARY MAP {mode.upper()}] Output tokens: {debug_info[f'map_output_tokens_{mode}']}")
        
        return {"summaries": [resp], "debug": debug_info}

    # Map contents to generate_summary calls
    def map_summaries(state: OverallState):
        return [
            Send("generate_summary", {
                "mode": state["mode"], 
                "content": content,
                "debug": state.get("debug", {})
            })
            for content in state["contents"]
        ]

    # collect summaries node
    def collect_summaries(state: OverallState):
        docs = [Document(page_content=s) for s in state["summaries"]]
        
        # Add debug tracing
        debug_info = state.get("debug", {})
        if debug:
            debug_info["collected_summaries_count"] = str(len(docs))
            debug_info["collected_summaries_total_tokens"] = str(
                sum(count_tokens_llm(d.page_content, llm_reduce) for d in docs)
            )
            log.info(f"[SUMMARY COLLECT] Collected {len(docs)} summaries")
        
        return {"collapsed_summaries": docs, "debug": debug_info}

    # Function to measure length of documents
    def length_function(documents: List[Document]) -> int:
        text = " ".join(d.page_content for d in documents)
        return count_tokens_llm(text, llm_reduce)

    # collapse summaries node
    async def collapse_summaries(state: OverallState):
        mode = state["mode"]
        debug_info = state.get("debug", {})

        # Get token max and reduce chain
        token_max = int(PROMPTS[mode]["token_max"])
        reduce_chain = reduce_chain_for(mode)

        # summary debug tracing
        if debug:
            current_tokens = length_function(state["collapsed_summaries"])
            debug_info[f"collapse_input_tokens_{mode}"] = str(current_tokens)
            log.info(f"[SUMMARY COLLAPSE {mode.upper()}] Input tokens: {current_tokens}, limit: {token_max}")

        # Split docs and collapse in parts
        doc_lists = split_list_of_docs(state["collapsed_summaries"], length_function, token_max)
        results: List[Document] = []

        # Collapse each part
        for i, part in enumerate(doc_lists):
            if debug:
                part_tokens = length_function(part)
                debug_info[f"collapse_part_{i}_tokens"] = str(part_tokens)
                log.info(f"[SUMMARY COLLAPSE {mode.upper()}] Processing part {i+1}/{len(doc_lists)} with {part_tokens} tokens")
            
            out = await acollapse_docs(part, reduce_chain.ainvoke)
            if isinstance(out, Document):
                results.append(out)
            else:
                results.append(Document(page_content=str(out)))

        # final debug info
        if debug:
            final_tokens = length_function(results)
            debug_info[f"collapse_output_tokens_{mode}"] = str(final_tokens)
            debug_info[f"collapse_parts_processed"] = str(len(doc_lists))
            log.info(f"[SUMMARY COLLAPSE {mode.upper()}] Output tokens: {final_tokens}, parts processed: {len(doc_lists)}")

        # Return collapsed summaries
        return {"collapsed_summaries": results, "debug": debug_info}

    # Decide whether to collapse or generate final summary
    def should_collapse(state: OverallState) -> Literal["collapse_summaries", "generate_final_summary"]:
        mode = state["mode"]
        token_max = int(PROMPTS[mode]["token_max"])
        num_tokens = length_function(state["collapsed_summaries"])
        debug_info = state.get("debug", {})

        # debug tracing
        decision = "collapse_summaries" if num_tokens > token_max else "generate_final_summary"
        if debug:
            debug_info[f"should_collapse_tokens_{mode}"] = str(num_tokens)
            debug_info[f"should_collapse_limit_{mode}"] = str(token_max)
            debug_info[f"should_collapse_decision_{mode}"] = decision
            log.info(f"[SUMMARY DECISION {mode.upper()}] Tokens: {num_tokens}, limit: {token_max}, decision: {decision}")

        # Decide next step based on token count
        return decision

    # generate final summary node
    async def generate_final_summary(state: OverallState):
        mode = state["mode"]
        debug_info = state.get("debug", {})

        # Get reduce chain and prepare docs text
        reduce_chain = reduce_chain_for(mode)
        docs_text = "\n".join(d.page_content for d in state["collapsed_summaries"]) if state["collapsed_summaries"] else ""

        # debug tracing
        if debug:
            input_tokens = count_tokens_llm(docs_text, llm_reduce)
            debug_info[f"final_input_tokens_{mode}"] = str(input_tokens)
            debug_info[f"final_prompt_{mode}"] = str(PROMPTS[mode]["reduce"].format_messages(docs=docs_text[:200] + "..."))
            log.info(f"[SUMMARY FINAL {mode.upper()}] Input tokens: {input_tokens}")

        # Call reduce chain to get final summary
        resp = await reduce_chain.ainvoke({"docs": docs_text})

        # final debug info
        if debug:
            output_tokens = count_tokens_llm(resp, llm_reduce)
            debug_info[f"final_output_tokens_{mode}"] = str(output_tokens)
            debug_info[f"final_response_{mode}"] = resp[:200] + "..." if len(resp) > 200 else resp
            log.info(f"[SUMMARY FINAL {mode.upper()}] Output tokens: {output_tokens}")

        # Return the final summary
        return {"final_summary": resp, "debug": debug_info}

    # Build the state graph
    graph = StateGraph(OverallState)
    graph.add_node("generate_summary", generate_summary)
    graph.add_node("collect_summaries", collect_summaries)
    graph.add_node("collapse_summaries", collapse_summaries)
    graph.add_node("generate_final_summary", generate_final_summary)

    # Define the flow of the graph
    graph.add_conditional_edges(START, map_summaries, ["generate_summary"])
    graph.add_edge("generate_summary", "collect_summaries")
    graph.add_conditional_edges("collect_summaries", should_collapse)
    graph.add_conditional_edges("collapse_summaries", should_collapse)
    graph.add_edge("generate_final_summary", END)

    # Compile and return the graph
    return graph.compile()

# Run a single mode using the graph
async def run_single_mode(
    mode: Literal["short", "long", "key_concepts"],
    docs: List[Document],
    prefs: Optional[dict] = None,
    on_step: Optional[Callable[[dict], None]] = None,
    recursion_limit: int = 12,
    debug: bool = False,
) -> Dict[str, str]: 
    """ Run a single summary mode using the map-reduce graph. """
    app = build_graph(prefs, debug=debug)
    state_in: OverallState = {
        "mode": mode,
        "contents": [d.page_content for d in docs],
        "summaries": [],
        "collapsed_summaries": [],
        "final_summary": "",
        "debug": {},
    }

    # initial debug info
    if debug:
        total_input_tokens = sum(count_tokens_llm(content, get_llm()) for content in state_in["contents"])
        state_in["debug"][f"total_input_tokens_{mode}"] = str(total_input_tokens)
        state_in["debug"][f"total_input_docs_{mode}"] = str(len(docs))
        log.info(f"[SUMMARY START {mode.upper()}] Processing {len(docs)} docs with {total_input_tokens} tokens")

    # Step callback
    async for step in app.astream(state_in, {"recursion_limit": recursion_limit}):
        if on_step:
            on_step(step)

    # Final invoke call to get result
    result = await app.ainvoke(state_in, {"recursion_limit": recursion_limit})

    # Return the final summary and debug info
    return {
        "summary": result.get("final_summary", "").strip(),
        "debug": result.get("debug", {}) if debug else {}
    }

# Execute stuff mode for small inputs - input documents not too large for LLM
async def execute_stuff_mode(
    full_text: str,
    prefs: Optional[dict] = None,
    debug: bool = False,
) -> Dict[str, str]:
    """
    Run the 'stuff' path: one call per mode using the MAP prompt ({context}).
    This is faster for small inputs (less than 128k tokens).
    """

    # Fetch LLMs
    llm_map, llm_reduce = fetch_llms(prefs)
    parser = StrOutputParser()
    
    # debug info
    debug_info = {}
    if debug:
        input_tokens = count_tokens_llm(full_text, llm_reduce)
        debug_info["stuff_mode_input_tokens"] = str(input_tokens)
        log.info(f"[SUMMARY STUFF] Processing {input_tokens} tokens in stuff mode")

    # Function to stuff one mode
    async def stuff_one(mode: Literal["short", "long", "key_concepts"]) -> str:
        if debug:
            debug_info[f"stuff_prompt_{mode}"] = str(PROMPTS[mode]["map"].format_messages(context=full_text[:200] + "..."))
            log.info(f"[SUMMARY STUFF {mode.upper()}] Starting generation")
        
        # chain the stuff prompt
        chain = PROMPTS[mode]["map"] | llm_reduce | parser
        result = await chain.ainvoke({"context": full_text})
        
        # debug tracing
        if debug:
            output_tokens = count_tokens_llm(result, llm_reduce)
            debug_info[f"stuff_output_tokens_{mode}"] = str(output_tokens)
            debug_info[f"stuff_response_{mode}"] = result[:200] + "..." if len(result) > 200 else result
            log.info(f"[SUMMARY STUFF {mode.upper()}] Generated {output_tokens} tokens")
        
        return result

    # Run all three modes
    short = await stuff_one("short")
    long_ = await stuff_one("long")
    concepts = await stuff_one("key_concepts")

    # Return the summaries
    result = {"short": short, "long": long_, "key_concepts": concepts}
    if debug:
        result["debug"] = debug_info
    
    return result


# ---------------------- Main entrypoint ----------------------- #
# Main function to generate summaries using map-reduce or stuff mode
def generate_summaries_graph(
    topic_name: str,
    docs: List[Document],
    prefs: Optional[dict] = None,
    on_step: Optional[Callable[[dict], None]] = None,
    debug: bool = False,  # Added debug parameter
) -> Dict[str, str]:
    """
    - If total tokens < stuff_threshold_tokens (default 128k), run a single
      'stuff' prompt per mode (short/long/key_concepts) forreduced cost.
    - Else, run LangGraph map-reduce with stuffing.
    """

    # Return empty summaries if no documents
    if not docs:
        empty_result = {"short": "", "long": "", "key_concepts": ""}
        if debug:
            empty_result["debug"] = {"no_documents": "true"}
        return empty_result

    # Get preferences 
    cfg = load_config() or {}
    cfg_summ = (cfg.get("summaries") or {})
    sp = ((prefs or {}).get("summaries") or cfg_summ)

    # Optionally sample first K documents for faster testing
    sample_first_k = sp.get("sample_first_k")

    # Sample if specified
    if isinstance(sample_first_k, int) and sample_first_k > 0:
        docs = docs[:sample_first_k]
        if debug:
            log.info(f"[SUMMARY INIT] Sampled first {sample_first_k} documents")

    # Fetch LLMs
    llm_map, llm_reduce = fetch_llms(prefs)
    full_text = "\n\n".join(d.page_content for d in docs)

    # Get stuff threshold
    stuff_threshold = int(sp.get("stuff_threshold_tokens", 128_000))
    # Calculate total tokens
    total_tokens = count_tokens_llm(full_text, llm_reduce)

    # initial debug info
    if debug:
        log.info(f"[SUMMARY INIT] Topic: {topic_name}, Docs: {len(docs)}, Tokens: {total_tokens}, Threshold: {stuff_threshold}")

    # If small enough, use stuff mode
    if total_tokens <= stuff_threshold:
        if debug:
            log.info(f"[SUMMARY MODE] Using stuff mode (tokens under threshold)")

        # Run stuff mode
        async def runner_stuff():
            return await execute_stuff_mode(full_text, prefs, debug=debug)
        return asyncio.run(runner_stuff())

    # Else, use map-reduce mode with stuffing
    stuff_by = sp.get("stuff_by", "document_id")
    stuff_token_limit = int(sp.get("stuff_token_limit", 10000))
    max_map_calls = int(sp.get("max_map_calls", 24))

    if debug:
        log.info(f"[SUMMARY MODE] Using map-reduce mode, stuff_by: {stuff_by}, stuff_limit: {stuff_token_limit}, max_calls: {max_map_calls}")

    # Group and stuff documents, limit to max_map_calls
    stuffed_docs = group_and_stuff_docs(docs, group_key=stuff_by, stuff_token_limit=stuff_token_limit)
    if len(stuffed_docs) > max_map_calls:
        stuffed_docs = stuffed_docs[:max_map_calls]

    if debug:
        log.info(f"[SUMMARY stuff] stuffed into {len(stuffed_docs)} documents")

    # Run the graph
    async def runner_graph():
        # Run each mode
        short_result = await run_single_mode("short", stuffed_docs, prefs, on_step, debug=debug)
        long_result = await run_single_mode("long", stuffed_docs, prefs, on_step, debug=debug)
        concepts_result = await run_single_mode("key_concepts", stuffed_docs, prefs, on_step, debug=debug)

        # Combine results
        result = {
            "short": short_result["summary"],
            "long": long_result["summary"], 
            "key_concepts": concepts_result["summary"]
        }
        
        # Combine debug info if requested
        if debug:
            combined_debug = {}
            combined_debug.update(short_result.get("debug", {}))
            combined_debug.update(long_result.get("debug", {}))
            combined_debug.update(concepts_result.get("debug", {}))
            result["debug"] = combined_debug

        return result

    # Execute the async runner
    return asyncio.run(runner_graph())

# Alias for the main function
generate_summaries = generate_summaries_graph