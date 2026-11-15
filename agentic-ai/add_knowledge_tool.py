"""Post-process flows: add a `knowledge_rag` HTTP-Request tool to every coach agent.

Why: psy knowledge must come from Knowledge_RAG (bound to AstraDB 'coach' collection) via HTTP —
NOT from the LLM's parameters, NOT from coach-mcp search_books.

Effect on each flow:
- new APIRequest node, `SW` = http://localhost:7860/api/v1/run/knowledge_rag (POST /run/knowledge_rag)
- new edge `component_as_tool -> agent.tools` (added to existing tools list)
- system prompt extended with the grounding instruction
"""
import json
import sys
import uuid
from pathlib import Path

sys.path = ['.'] + sys.path
from generate_flows import APIREQUEST, clone, set_value, connect_tool_to_agent, OUT

flows_map = {
    'self_discovery':      OUT / 'Self_Discovery.json',
    'skills_assessment':   OUT / 'Skills_Assessment.json',
    'development_planner': OUT / 'Development_Planner.json',
    'progress_reflection': OUT / 'Progress_Reflection.json',
    'cv_gap_analysis':     OUT / 'CV_Gap_Analysis.json',
    'quality_gate':        OUT / 'Quality_Gate.json',
    'supervisor':          OUT / 'Supervisor.json',
}

OMEGA = 'https://ac0fdcb8-213f-4772-82d7-95d56639f0ad-us-east-2.apps.astra.datastax.com'
KNOWLEDGE_URL = 'http://localhost:7860/api/v1/run/knowledge_rag'

KNOWLEDGE_PROMPT = """MANDATORY USE — knowledge_rag (HTTP, psy library via Knowledge_RAG flow):
For ANY scientific claim, psychology grounding, evidence about skills/goals/plans, OR an evidence-check request, you MUST call the `knowledge_rag` tool first (via HTTP → /run/knowledge_rag). It posts to the psy reference library (AstraDB collection `coach`, ~16 700 chunks from 5 reference books). Use it 1-3 times per turn when relevant; do not invent, repeat, or answer from memory alone.
- Input shape: input_value = "TASK: <specific psy question> 
REFERENCE: REQ-<id> 
CONTEXT: <relevant context>"
- Do not fall back to generic LLM knowledge when this tool can answer.
"""

for name, path in flows_map.items():
    if not path.exists():
        print('missing', path.name); continue
    j = json.loads(path.read_text(encoding='utf-8'))
    d = j['data']
    fid = name.split('_')[0][:4]
    if any(n['id'].startswith(f'KnowledgeTool-') for n in d['nodes']):
        print('already patched', path.name); continue

    # 1) clone APIRequest donor
    donor = APIREQUEST
    node = clone(donor, f'KnowledgeTool-{fid}-retriever', (-2000, 300 if name != 'supervisor' else 150))
    tpl = node['data']['node']['template']
    node['data']['node']['display_name'] = 'Knowledge Retriever HTTP'
    node['data']['node']['description'] = 'HTTP POST to /run/knowledge_rag (AstraDB psy library).'
    set_value(node, 'url_input', KNOWLEDGE_URL)
    set_value(node, 'method', 'POST')
    set_value(node, 'curl_input', '')
    set_value(node, 'headers', [{'key':'Content-Type','value':'application/json'},{'key':'Accept','value':'application/json'}])
    set_value(node, 'body', [])  # model fills via args
    set_value(node, 'mode', 'URL')
    set_value(node, 'tools_metadata', [{
        '_uniqueId': f'knowledge_rag_{fid}',
        'args': {
            'body': {'default': [], 'description': 'Rows: input_value (TASK/REFERENCE/CONTEXT text), input_type=any, output_type=any.', 'title': 'Body', 'type': 'array'},
        },
        'description': 'Psy/Coaching reference from the Astra psy library via Knowledge_RAG flow. Call before making claims about psychology.',
        'display_description': 'Psy/Coaching reference from the Astra psy library via Knowledge_RAG flow.',
        'display_name': 'knowledge_rag',
        'name': 'knowledge_rag',
        'readonly': False,
        'status': False,
        'tags': ['knowledge_rag'],
    }])
    d['nodes'].append(node)

    # 2) connect node as tool to agent.tools
    agent = next(n for n in d['nodes'] if n['data']['type'] == 'Agent')
    d['edges'].append(connect_tool_to_agent(node, agent, 'APIRequest'))

    # 3) extend system prompt
    agent['data']['node']['template']['system_prompt']['value'] += KNOWLEDGE_PROMPT

    path.write_text(json.dumps(j, ensure_ascii=False, indent=2), encoding='utf-8')
    print('patched', path.name)
