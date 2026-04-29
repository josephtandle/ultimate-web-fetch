#!/usr/bin/env python3.11
"""
browser-use runner for WebFetch agent.
Accepts --url and --goal, runs browser-use with Claude Haiku, outputs JSON to stdout.
"""

import sys
import json
import argparse
import os
import asyncio

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--goal', required=True)
    parser.add_argument('--timeout', type=int, default=120)
    parser.add_argument('--browser', default='headless', choices=['agent', 'headless'])
    args = parser.parse_args()

    # Load local .env for API keys
    env_path = os.path.join(os.getcwd(), '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip().strip('"\'')
                if k and k not in os.environ:
                    os.environ[k] = v

    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print(json.dumps({'success': False, 'error': 'browser-use requires OPENAI_API_KEY', 'tool': 'browser-use'}))
        sys.exit(1)

    try:
        from browser_use import Agent
        from langchain_openai import ChatOpenAI
    except ImportError as e:
        print(json.dumps({'success': False, 'error': f'Import error: {e}. Run: pip install browser-use langchain-openai', 'tool': 'browser-use'}))
        sys.exit(1)

    async def run():
        llm = ChatOpenAI(
            model='gpt-4.1-mini',
            api_key=api_key,
            timeout=args.timeout,
        )

        task = f"Navigate to {args.url} and then: {args.goal}"
        agent = Agent(task=task, llm=llm)

        try:
            result = await asyncio.wait_for(agent.run(), timeout=args.timeout)
            final = result.final_result() if hasattr(result, 'final_result') else str(result)
            print(json.dumps({
                'success': True,
                'data': final,
                'tool': 'browser-use',
                'url': args.url,
            }))
        except asyncio.TimeoutError:
            print(json.dumps({'success': False, 'error': f'Timeout after {args.timeout}s', 'tool': 'browser-use'}))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e), 'tool': 'browser-use'}))

    asyncio.run(run())

if __name__ == '__main__':
    main()
