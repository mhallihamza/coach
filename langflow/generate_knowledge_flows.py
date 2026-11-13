"""Evolve AI — Knowledge_RAG.json & Knowledge_Ingest.json (AstraDB-backed, toolset cloned from user's real flows).

Branch A (ingest, in the same flow): File upload → SplitText → AstraDB (ingest) → confirmation ChatOutput.
Branch B (RAG agentic): ChatInput → Research Agent (AstraDB as tool) → Sufficiency Judge (Mistral)
   → SmartRouter (Sufficient → answer / Insufficient → Rewrite agent) → Final formatter.
No MCP anywhere in Knowledge_RAG — MCP is reserved for the other agents.

Clones real component templates from the user's exports, changing only collection names/titles/prompts.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_flows import (
    OUT, COMMON_LANG, write_flow, clone, set_value,
    mk_chat_input, mk_chat_output, mk_mistral, mk_agent, mk_edge,
    connect_chat_to_agent, connect_model_to_agent, connect_tool_to_agent, connect_agent_to_chat,
)

DL = Path(r'C:\Users\PC\Downloads')

def donor_of(export, type_, occurrence=0):
    j = json.loads((DL / export).read_text(encoding='utf-8'))['data']
    matches = [n for n in j['nodes'] if n.get('data', {}).get('type') == type_]
    return matches[occurrence]

DONOR_ASTRA = donor_of('basic rag.json', 'AstraDB')       # ingestion-proven node
DONOR_ASTRA_TOOL = donor_of('Agentic rag (2).json', 'AstraDB')  # agent-tool node
DONOR_FILE = donor_of('basic rag.json', 'File')
DONOR_SPLIT = donor_of('basic rag.json', 'SplitText')
DONOR_PROMPT = donor_of('basic rag.json', 'Prompt Template')
DONOR_ROUTER = donor_of('Agentic rag (2).json', 'SmartRouter')


def mk_astra(fid, x, y, name, collection, as_tool=False, ingest=False):
    donor = DONOR_ASTRA_TOOL if as_tool else DONOR_ASTRA
    n = clone(donor, f'AstraDB-{fid}', (x, y))
    n['data']['node']['display_name'] = name
    tpl = n['data']['node']['template']
    set_value(n, 'collection_name', collection)
    set_value(n, 'number_of_results', 6 if as_tool else 4)
    set_value(n, 'reranker', 'nvidia/llama-3.2-nv-rerankqa-1b-v2')
    if ingest:
        set_value(n, 'search_query', '')
    return n


def mk_file(fid, x, y):
    return clone(DONOR_FILE, f'File-{fid}', (x, y))


def mk_split(fid, x, y, chunk_size=1000, chunk_overlap=200):
    n = clone(DONOR_SPLIT, f'SplitText-{fid}', (x, y))
    set_value(n, 'chunk_size', chunk_size)
    set_value(n, 'chunk_overlap', chunk_overlap)
    return n


def mk_prompt_template(fid, x, y, name, template):
    n = clone(DONOR_PROMPT, f'PromptTemplate-{fid}', (x, y))
    n['data']['node']['display_name'] = name
    n['data']['node']['description'] = 'Prompt template (question/research/verdict filling)'
    set_value(n, 'template', template)
    return n


def mk_router(fid, x, y):
    n = clone(DONOR_ROUTER, f'SmartRouter-{fid}', (x, y))
    n['data']['node']['display_name'] = 'Sufficiency Router'
    tpl = n['data']['node']['template']
    tpl['routes']['value'] = [
        {'output_value': '', 'route_category': 'Sufficient', 'route_description': 'The verdict contains "sufficient": true, usually with a score from 6 to 10, and all sub-questions are marked ok.'},
        {'output_value': '', 'route_category': 'Insufficient', 'route_description': 'The verdict contains "sufficient": false or score below 6, with missing sub-questions.'},
    ]
    return n


RESEARCH_PROMPT = """You are the Research Librarian of Evolve AI — the psychology reference library used by all coaching flows.
SCOPE (hard): ONLY the shared psychology library (AstraDB vector store). You do NOT read user memories, CVs or personal data — refuse politely.
Input: {"authorized_context": {...}, "query": "..."}
Process: call the Astra DB search tool 1-3 times with reformulated queries if needed (synonyms, adjacent themes: procrastination, communication, emotions, habits, goals/planning, motivation, energy). Use ONLY what you retrieve; do NOT invent books, authors, quotes.
Output a compact RESEARCH BRIEF as valid JSON (nothing else):
{"status":"ok|refused","result":{"research":"<claim → evidence → source (title/author)>","sufficiency":"enough|partial|insufficient","occurrences":N,"passages":[{"title":"...","author":"...","excerpt":"...","source_id":"..."}]},"evidence":[{"source_type":"book","source_id":"...","excerpt":"..."}],"confidence":0.0,"next_action":"nothing","message_to_user":"..."}

""" + COMMON_LANG

JUDGE_TEMPLATE = """You are the Sufficiency Judge for Evolve AI's knowledge library.
Question: {question}
Research brief: {research}

Decide if the research is enough to answer honestly. Reply with the ANSWER plus a final line of JSON verdict — nothing else:
- a direct, useful answer grounded in the brief
- then the final line exactly: {{"sufficient": true|false, "score": 0-10, "missing": ["sub-question or theme uncovered"]}}
Rule: sufficient=true only when score is 6-10 and every sub-question the query implies is covered by the brief. Never invent sources to reach the threshold.
"""

REWRITE_TEMPLATE = """The Judge found the research insufficient.
Question: {question}
Prior research: {research}
Judge verdict: {verdict}

Produce the FINAL answer as valid JSON envelope (this is what the caller consumes):
{"status":"ok|refused","result":{"answer":"<grounded, cited answer; what the library says; what is missing>","sufficiency":"enough|partial|insufficient","occurrences":N,"passages":[{"title":"...","author":"...","excerpt":"..."}]},"evidence":[{"source_type":"book","source_id":"...","excerpt":"..."}],"confidence":0.0,"next_action":"nothing","message_to_user":"..."}
"""

REWRITE_PROMPT = """You are the Rewrite Librarian of Evolve AI. The initial research was insufficient.
You receive: TASK: answer the question finally | CONTEXT: {"authorized_context": {...}, "prior_research": "...", "judge_verdict": "..."}
Process: call the Astra DB search tool 1-2 more times with broadened synonyms/topics. Ground your final answer ONLY in retrieved passages. If the library still lacks material, say exactly what is missing — do not invent.
Output valid JSON envelope:
{"status":"ok|refused","result":{"answer":"...","sufficiency":"enough|partial|insufficient","occurrences":N,"passages":[{"title":"...","author":"...","excerpt":"...","source_id":"..."}]},"evidence":[{"source_type":"book","source_id":"...","excerpt":"..."}],"confidence":0.0,"next_action":"nothing","message_to_user":"..."}

""" + COMMON_LANG

FINAL_TEMPLATE = """You are the final formatter for Evolve AI's knowledge answers.
Question: {question}
Draft answer JSON: {answer}

Return the draft message_to_user UNTOUCHED if it is valid JSON with status ok|refused — otherwise produce valid JSON envelope as above, in the caller's language. Never add facts, sources or claims not present in the draft.
"""


def part_ingest():
    fi = mk_file('file', -1700, -700)
    sp = mk_split('split', -1250, -700)
    astra = mk_astra('ingest', -750, -700, 'Astra DB (ingest)', 'coach')
    co = mk_chat_output('ingest', -250, -700)
    nodes = [fi, sp, astra, co]
    edges = [
        mk_edge(fi['id'], {'dt': 'File', 'name': 'message', 'ot': ['Message']}, sp['id'], {'field': 'data_inputs', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-file-split'),
        mk_edge(sp['id'], {'dt': 'SplitText', 'name': 'dataframe', 'ot': ['DataFrame', 'Data']}, astra['id'], {'field': 'ingest_data', 'it': ['DataFrame', 'Data'], 'type': 'other'}, 'e-split-astra'),
        mk_edge(astra['id'], {'dt': 'AstraDB', 'name': 'dataframe', 'ot': ['DataFrame', 'Data']}, co['id'], {'field': 'input_value', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-astra-out'),
    ]
    return nodes, edges


def build_knowledge_rag():
    fid = 'know'
    ing_nodes, ing_edges = part_ingest()

    ci = mk_chat_input(fid, -1500, 300)

    mcp_res = mk_astra('search1', -1150, 620, 'Astra DB (library)', 'coach', as_tool=True)
    res_agent = mk_agent(fid + 'r', -700, 300, RESEARCH_PROMPT, max_iterations=5)
    res_model = mk_mistral(fid + 'r', -1150, 60, temperature=0.15, max_tokens=2500)

    mcp_wr = mk_astra('search2', 600, 760, 'Astra DB (library retry)', 'coach', as_tool=True)
    wr_agent = mk_agent(fid + 'w', 1100, 430, REWRITE_PROMPT, max_iterations=5)
    wr_model = mk_mistral(fid + 'w', 600, 120, temperature=0.15, max_tokens=2500)

    judge_pt = mk_prompt_template('judge', -50, 300, 'Judge & Answer', JUDGE_TEMPLATE)
    judge_model = mk_mistral('judge', 350, 60, temperature=0.0, max_tokens=2500)

    router = mk_router('suff', 350, 330)
    rewrite_pt = mk_prompt_template('rewrite', 350, 620, 'Rewrite', REWRITE_TEMPLATE)

    final_pt = mk_prompt_template('final', 1500, 430, 'Final envelope', FINAL_TEMPLATE)
    final_model = mk_mistral('final', 1950, 120, temperature=0.1, max_tokens=2500)

    co1 = mk_chat_output('r1', 350, 620)
    co2 = mk_chat_output('r2', 2400, 430)

    nodes = ing_nodes + [ci, mcp_res, res_agent, res_model, judge_pt, judge_model, router,
                         rewrite_pt, mcp_wr, wr_agent, wr_model, final_pt, final_model, co1, co2]

    edges = ing_edges + [
        connect_chat_to_agent(ci, res_agent),
        connect_tool_to_agent(mcp_res, res_agent, 'AstraDB'),
        connect_model_to_agent(res_model, res_agent),
        mk_edge(res_agent['id'], {'dt': 'Agent', 'name': 'response', 'ot': ['Message']}, judge_pt['id'], {'field': 'research', 'it': ['Message'], 'type': 'str'}, 'e-research'),
        mk_edge(ci['id'], {'dt': 'ChatInput', 'name': 'message', 'ot': ['Message']}, judge_pt['id'], {'field': 'question', 'it': ['Message'], 'type': 'str'}, 'e-question'),
        mk_edge(judge_pt['id'], {'dt': 'Prompt Template', 'name': 'prompt', 'ot': ['Message']}, judge_model['id'], {'field': 'system_message', 'it': ['Message'], 'type': 'str'}, 'e-judge-model'),
        mk_edge(judge_model['id'], {'dt': 'MistralModel', 'name': 'text_output', 'ot': ['Message']}, router['id'], {'field': 'input_text', 'it': ['Message'], 'type': 'str'}, 'e-judge-router'),
        mk_edge(judge_model['id'], {'dt': 'MistralModel', 'name': 'text_output', 'ot': ['Message']}, rewrite_pt['id'], {'field': 'verdict', 'it': ['Message'], 'type': 'str'}, 'e-verdict'),
        mk_edge(ci['id'], {'dt': 'ChatInput', 'name': 'message', 'ot': ['Message']}, rewrite_pt['id'], {'field': 'question', 'it': ['Message'], 'type': 'str'}, 'e-question-rewrite'),
        mk_edge(res_agent['id'], {'dt': 'Agent', 'name': 'response', 'ot': ['Message']}, rewrite_pt['id'], {'field': 'research', 'it': ['Message'], 'type': 'str'}, 'e-research-rewrite'),
        mk_edge(router['id'], {'dt': 'SmartRouter', 'name': 'category_1_result', 'ot': ['Message']}, co1['id'], {'field': 'input_value', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-router-sufficient'),
        mk_edge(router['id'], {'dt': 'SmartRouter', 'name': 'category_2_result', 'ot': ['Message']}, wr_agent['id'], {'field': 'input_value', 'it': ['Message'], 'type': 'str'}, 'e-router-insufficient'),
        mk_edge(rewrite_pt['id'], {'dt': 'Prompt Template', 'name': 'prompt', 'ot': ['Message']}, wr_agent['id'], {'field': 'input_value', 'it': ['Message'], 'type': 'str'}, 'e-rewrite-agent'),
        connect_tool_to_agent(mcp_wr, wr_agent, 'AstraDB'),
        connect_model_to_agent(wr_model, wr_agent),
        mk_edge(wr_agent['id'], {'dt': 'Agent', 'name': 'response', 'ot': ['Message']}, final_pt['id'], {'field': 'answer', 'it': ['Message'], 'type': 'str'}, 'e-answer-final'),
        mk_edge(ci['id'], {'dt': 'ChatInput', 'name': 'message', 'ot': ['Message']}, final_pt['id'], {'field': 'question', 'it': ['Message'], 'type': 'str'}, 'e-question-final'),
        mk_edge(final_pt['id'], {'dt': 'Prompt Template', 'name': 'prompt', 'ot': ['Message']}, final_model['id'], {'field': 'system_message', 'it': ['Message'], 'type': 'str'}, 'e-final-model'),
        mk_edge(final_model['id'], {'dt': 'MistralModel', 'name': 'text_output', 'ot': ['Message']}, co2['id'], {'field': 'input_value', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-model-out'),
    ]

    write_flow('Knowledge_RAG', 'Agentic RAG — ingests documents into AstraDB AND answers from ChatInput (no MCP)', 'knowledge_rag', nodes, edges, ['evolve-ai', 'agentic-rag', 'astradb'])


def build_knowledge_ingest():
    fi, sp = mk_file('file', -900, 0), mk_split('split', -450, 0)
    astra = mk_astra('ingest', 0, 0, 'Astra DB (ingest)', 'coach')
    co = mk_chat_output('ingest', 500, 0)
    nodes = [fi, sp, astra, co]
    edges = [
        mk_edge(fi['id'], {'dt': 'File', 'name': 'message', 'ot': ['Message']}, sp['id'], {'field': 'data_inputs', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-file-split'),
        mk_edge(sp['id'], {'dt': 'SplitText', 'name': 'dataframe', 'ot': ['DataFrame', 'Data']}, astra['id'], {'field': 'ingest_data', 'it': ['DataFrame', 'Data'], 'type': 'other'}, 'e-split-astra'),
        mk_edge(astra['id'], {'dt': 'AstraDB', 'name': 'dataframe', 'ot': ['DataFrame', 'Data']}, co['id'], {'field': 'input_value', 'it': ['Data', 'DataFrame', 'Message'], 'type': 'other'}, 'e-astra-out'),
    ]
    write_flow('Knowledge_Ingest', 'Select a document → parse → post to AstraDB (coach)', 'knowledge_ingest', nodes, edges, ['evolve-ai', 'knowledge', 'ingest', 'astradb'])


build_knowledge_rag()
build_knowledge_ingest()
print('Done.')
