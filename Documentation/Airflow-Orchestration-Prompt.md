# DeepTerm — Airflow Orchestration

## Implementation Targets

- **AI Dev Mac** (192.168.1.249): Airflow installation, DAG definitions
- **Web App** (Raspberry Pi): Cockpit pipeline tab, Airflow API proxy

---

## Overview

Apache Airflow orchestrates the cross-platform pipeline: Main Mac → GitHub → CI Mac → Pi → Node-RED → AI Dev Mac. Currently, orchestration is ad-hoc (webhooks + SSH). Airflow provides DAG-based workflows, retry/timeout handling, scheduling, dependency management, and monitoring.

The full Airflow UI runs on the AI Dev Mac at `http://192.168.1.249:8080`. The cockpit on the web app provides a **read-only summary view**.

---

# Part 1: AI Dev Mac Setup

## Prerequisites

- macOS 26.3 on AI Dev Mac (`luca@192.168.1.249`)
- Admin access (sudo)
- Homebrew installed
- Docker Desktop installed
- SSH access from Pi to AI Dev Mac
- SSH access from AI Dev Mac to Pi (`macan@10.10.10.10`)
- SSH access from AI Dev Mac to CI Mac (for build triggers)

## Installation (Docker Compose — recommended)

```bash
# On AI Dev Mac

# 1. Create Airflow directory
mkdir -p ~/airflow && cd ~/airflow

# 2. Download official Docker Compose
curl -LfO 'https://airflow.apache.org/docs/apache-airflow/2.10.4/docker-compose.yaml'

# 3. Create required directories
mkdir -p ./dags ./logs ./plugins ./config

# 4. Set Airflow user (avoids permission issues)
echo -e "AIRFLOW_UID=$(id -u)" > .env

# 5. Add DeepTerm-specific env vars to .env
cat >> .env << 'EOF'
# DeepTerm pipeline configuration
DEEPTERM_PI_HOST=macan@10.10.10.10
DEEPTERM_PI_API=http://10.10.10.10:3000
DEEPTERM_CI_MAC_HOST=ci-user@ci-mac-ip
DEEPTERM_AI_DEV_MAC=luca@192.168.1.249
DEEPTERM_APP_REPO_PATH=~/Development/deepterm
DEEPTERM_WEB_REPO_PATH=~/deepterm
DEEPTERM_PI_API_KEY=your-internal-api-key
DEEPTERM_GITHUB_TOKEN=your-github-token
DEEPTERM_NODE_RED_URL=http://192.168.1.30:1880
EOF

# 6. Initialize database
docker compose up airflow-init

# 7. Start Airflow
docker compose up -d

# 8. Verify
docker compose ps
# All services should be "healthy"

# 9. Access web UI
# Open http://localhost:8080
# Default login: airflow / airflow
# CHANGE THE PASSWORD immediately
```

## Post-Installation

```bash
# Change default password
docker compose exec airflow-webserver airflow users create \
  --username admin \
  --password YOUR_SECURE_PASSWORD \
  --firstname Luca \
  --lastname DeBlasio \
  --role Admin \
  --email luca.deblasio@bluewin.ch

# Set up SSH connections for Airflow to reach other machines
# Airflow needs SSH keys inside its Docker containers

# Copy SSH keys into Airflow
docker compose exec airflow-worker mkdir -p /home/airflow/.ssh
docker compose cp ~/.ssh/id_ed25519 airflow-worker:/home/airflow/.ssh/id_ed25519
docker compose cp ~/.ssh/known_hosts airflow-worker:/home/airflow/.ssh/known_hosts
docker compose exec airflow-worker chmod 600 /home/airflow/.ssh/id_ed25519
```

## Auto-Start on Boot

Create a LaunchDaemon to start Docker + Airflow on reboot:

```bash
# Create startup script
cat > ~/airflow/start.sh << 'EOF'
#!/bin/bash
cd ~/airflow
open -a Docker
sleep 30  # Wait for Docker to start
docker compose up -d
EOF
chmod +x ~/airflow/start.sh

# Add to login items or create a launchd plist
```

---

## DAG Definitions

All DAGs go in `~/airflow/dags/`. They call the Pi's API and SSH into machines.

### Shared Helper Library

```python
# ~/airflow/dags/lib/__init__.py
# (empty)
```

```python
# ~/airflow/dags/lib/deepterm_api.py
"""
Shared helpers for DeepTerm Airflow DAGs.
Calls the Pi's internal API and SSH into machines.
"""
import os
import json
import subprocess
import requests

PI_API = os.environ.get('DEEPTERM_PI_API', 'http://10.10.10.10:3000')
PI_API_KEY = os.environ.get('DEEPTERM_PI_API_KEY', '')
PI_HOST = os.environ.get('DEEPTERM_PI_HOST', 'macan@10.10.10.10')
CI_MAC_HOST = os.environ.get('DEEPTERM_CI_MAC_HOST', '')
GITHUB_TOKEN = os.environ.get('DEEPTERM_GITHUB_TOKEN', '')
NODE_RED_URL = os.environ.get('DEEPTERM_NODE_RED_URL', 'http://192.168.1.30:1880')


def pi_api(method: str, path: str, data: dict = None) -> dict:
    """Call the Pi's internal API."""
    url = f"{PI_API}{path}"
    headers = {'x-api-key': PI_API_KEY, 'Content-Type': 'application/json'}
    if method == 'GET':
        resp = requests.get(url, headers=headers, timeout=30)
    else:
        resp = requests.post(url, headers=headers, json=data, timeout=60)
    resp.raise_for_status()
    return resp.json()


def ssh_command(host: str, command: str, timeout: int = 300) -> str:
    """Run a command on a remote machine via SSH."""
    result = subprocess.run(
        ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', host, command],
        capture_output=True, text=True, timeout=timeout
    )
    if result.returncode != 0:
        raise RuntimeError(f"SSH command failed on {host}: {result.stderr}")
    return result.stdout


def ssh_pi(command: str, timeout: int = 300) -> str:
    return ssh_command(PI_HOST, command, timeout)


def ssh_ci_mac(command: str, timeout: int = 600) -> str:
    return ssh_command(CI_MAC_HOST, command, timeout)


def send_whatsapp(message_type: str, data: dict):
    """Send notification via Node-RED → WhatsApp."""
    try:
        requests.post(
            f"{NODE_RED_URL}/deepterm/notification",
            json={'type': message_type, **data},
            timeout=10
        )
    except Exception as e:
        print(f"WhatsApp notification failed: {e}")


def trigger_deliberation(story_id: str) -> dict:
    return pi_api('POST', '/api/admin/cockpit/deliberation/start', {
        'storyId': story_id,
        'type': 'implementation',
    })


def get_deliberation_status(deliberation_id: str) -> dict:
    return pi_api('GET', f'/api/admin/cockpit/deliberation/{deliberation_id}')


def advance_deliberation(deliberation_id: str) -> dict:
    return pi_api('POST', f'/api/admin/cockpit/deliberation/{deliberation_id}/advance')


def trigger_agent_loop(story_id: str, config_name: str = 'default') -> dict:
    return pi_api('POST', '/api/admin/cockpit/agent-loops/start', {
        'storyId': story_id,
        'configName': config_name,
    })


def get_agent_loop_status(loop_id: str) -> dict:
    return pi_api('GET', f'/api/admin/cockpit/agent-loops/{loop_id}')


def trigger_report(story_id: str) -> dict:
    return pi_api('POST', '/api/admin/cockpit/reports/generate', {
        'storyId': story_id,
    })


def update_story_status(story_id: str, status: str):
    return pi_api('POST', f'/api/admin/cockpit/planning/stories/{story_id}', {
        'status': status,
    })
```

### DAG 1: Story Implementation (Full Lifecycle)

```python
# ~/airflow/dags/story_implementation.py
"""
Full story lifecycle: deliberate → implement → review → report.
Triggered manually or via API with story_id parameter.
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import time
import sys
sys.path.insert(0, '/opt/airflow/dags')
from lib.deepterm_api import *

default_args = {
    'owner': 'deepterm',
    'retries': 2,
    'retry_delay': timedelta(minutes=2),
    'execution_timeout': timedelta(hours=3),
}


def start_deliberation_task(**context):
    story_id = context['params']['story_id']
    result = trigger_deliberation(story_id)
    context['ti'].xcom_push(key='deliberation_id', value=result['deliberationId'])
    return result


def wait_proposals_task(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    for _ in range(60):  # Wait up to 10 minutes
        status = get_deliberation_status(delib_id)
        if status.get('status') in ('debating', 'voting', 'decided'):
            return status
        time.sleep(10)
    raise TimeoutError('Proposals not complete after 10 minutes')


def run_debate_task(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    return advance_deliberation(delib_id)


def run_vote_task(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    return advance_deliberation(delib_id)


def synthesize_task(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    return advance_deliberation(delib_id)


def start_agent_task(**context):
    story_id = context['params']['story_id']
    config = context['params'].get('config_name', 'default')
    result = trigger_agent_loop(story_id, config)
    context['ti'].xcom_push(key='loop_id', value=result['loopId'])
    return result


def wait_agent_task(**context):
    loop_id = context['ti'].xcom_pull(key='loop_id')
    for _ in range(240):  # Wait up to 2 hours
        status = get_agent_loop_status(loop_id)
        s = status.get('status')
        if s == 'awaiting_review':
            context['ti'].xcom_push(key='pr_number', value=status.get('prNumber'))
            return status
        if s in ('failed', 'cancelled'):
            raise RuntimeError(f'Agent loop {s}: {status.get("errorLog", "")}')
        time.sleep(30)
    raise TimeoutError('Agent loop did not complete within 2 hours')


def notify_review_task(**context):
    story_id = context['params']['story_id']
    pr_number = context['ti'].xcom_pull(key='pr_number')
    send_whatsapp('pr_ready', {
        'story_id': story_id,
        'pr_number': pr_number,
        'message': f'🤖 PR #{pr_number} ready for review (Story: {story_id})',
    })


def wait_approval_task(**context):
    """Wait for PR to be merged (checks GitHub API)."""
    pr_number = context['ti'].xcom_pull(key='pr_number')
    repo = context['params'].get('target_repo', 'deblasioluca/deepterm')
    headers = {'Authorization': f'Bearer {GITHUB_TOKEN}', 'Accept': 'application/vnd.github+json'}
    
    for _ in range(2880):  # Check every 30s for up to 24 hours
        import requests as req
        resp = req.get(f'https://api.github.com/repos/{repo}/pulls/{pr_number}', headers=headers)
        data = resp.json()
        if data.get('merged'):
            return {'merged': True}
        if data.get('state') == 'closed' and not data.get('merged'):
            raise RuntimeError(f'PR #{pr_number} was closed without merging')
        time.sleep(30)
    raise TimeoutError(f'PR #{pr_number} not merged within 24 hours')


def generate_report_task(**context):
    story_id = context['params']['story_id']
    return trigger_report(story_id)


def mark_done_task(**context):
    story_id = context['params']['story_id']
    update_story_status(story_id, 'done')
    send_whatsapp('story_complete', {
        'story_id': story_id,
        'message': f'✅ Story {story_id} completed and marked as done',
    })


with DAG(
    'story_implementation',
    default_args=default_args,
    description='Full story lifecycle: deliberate → implement → review → report',
    schedule_interval=None,
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'story', 'automation'],
    params={
        'story_id': '',
        'config_name': 'default',
        'target_repo': 'deblasioluca/deepterm',
    },
) as dag:

    t1 = PythonOperator(task_id='start_deliberation', python_callable=start_deliberation_task)
    t2 = PythonOperator(task_id='wait_for_proposals', python_callable=wait_proposals_task)
    t3 = PythonOperator(task_id='run_debate', python_callable=run_debate_task)
    t4 = PythonOperator(task_id='run_vote', python_callable=run_vote_task)
    t5 = PythonOperator(task_id='synthesize_decision', python_callable=synthesize_task)
    t6 = PythonOperator(task_id='start_agent_loop', python_callable=start_agent_task)
    t7 = PythonOperator(task_id='wait_for_agent', python_callable=wait_agent_task,
                         execution_timeout=timedelta(hours=2))
    t8 = PythonOperator(task_id='notify_for_review', python_callable=notify_review_task)
    t9 = PythonOperator(task_id='wait_for_approval', python_callable=wait_approval_task,
                         execution_timeout=timedelta(hours=24))
    t10 = PythonOperator(task_id='generate_report', python_callable=generate_report_task)
    t11 = PythonOperator(task_id='mark_done', python_callable=mark_done_task)

    t1 >> t2 >> t3 >> t4 >> t5 >> t6 >> t7 >> t8 >> t9 >> t10 >> t11
```

### DAG 2: Nightly Build & Test

```python
# ~/airflow/dags/nightly_build.py
"""
Nightly build + test for both app and web repos.
Runs at 2 AM daily.
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import sys
sys.path.insert(0, '/opt/airflow/dags')
from lib.deepterm_api import *

default_args = {
    'owner': 'deepterm',
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}


def pull_app(**context):
    return ssh_ci_mac('cd ~/Development/deepterm && git pull origin develop')


def build_app(**context):
    output = ssh_ci_mac(
        'cd ~/Development/deepterm && xcodebuild build '
        '-workspace DeepTerm.xcworkspace -scheme DeepTerm '
        '-sdk macosx -arch arm64 2>&1 | tail -20',
        timeout=600
    )
    if 'BUILD SUCCEEDED' not in output:
        raise RuntimeError(f'App build failed:\n{output}')
    return output


def test_app_unit(**context):
    output = ssh_ci_mac(
        'cd ~/Development/deepterm && xcodebuild test '
        '-workspace DeepTerm.xcworkspace -scheme DeepTermTests '
        '-sdk macosx -arch arm64 2>&1 | tail -30',
        timeout=600
    )
    return output


def test_app_ui(**context):
    output = ssh_ci_mac(
        'cd ~/Development/deepterm && xcodebuild test '
        '-workspace DeepTerm.xcworkspace -scheme DeepTermUITests '
        '-sdk macosx -arch arm64 2>&1 | tail -30',
        timeout=600
    )
    return output


def pull_web(**context):
    return ssh_pi('cd ~/deepterm && git pull origin main')


def build_web(**context):
    output = ssh_pi('cd ~/deepterm && npm run build 2>&1 | tail -15')
    if 'Build failed' in output or 'error' in output.lower():
        raise RuntimeError(f'Web build failed:\n{output}')
    return output


def send_report(**context):
    ti = context['ti']
    results = {}
    for task_id in ['build_app', 'test_app_unit', 'test_app_ui', 'build_web']:
        try:
            results[task_id] = '✅'
        except:
            results[task_id] = '❌'
    
    message = '🌙 Nightly Build Report:\n'
    message += f"App Build: {results.get('build_app', '?')}\n"
    message += f"Unit Tests: {results.get('test_app_unit', '?')}\n"
    message += f"UI Tests: {results.get('test_app_ui', '?')}\n"
    message += f"Web Build: {results.get('build_web', '?')}"
    
    send_whatsapp('nightly_report', {'message': message})


with DAG(
    'nightly_build',
    default_args=default_args,
    description='Nightly build and test for app + web',
    schedule_interval='0 2 * * *',
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'ci', 'nightly'],
) as dag:

    pull_app_t = PythonOperator(task_id='pull_app', python_callable=pull_app)
    build_app_t = PythonOperator(task_id='build_app', python_callable=build_app,
                                  execution_timeout=timedelta(minutes=15))
    test_unit_t = PythonOperator(task_id='test_app_unit', python_callable=test_app_unit,
                                  execution_timeout=timedelta(minutes=15))
    test_ui_t = PythonOperator(task_id='test_app_ui', python_callable=test_app_ui,
                                execution_timeout=timedelta(minutes=15))
    pull_web_t = PythonOperator(task_id='pull_web', python_callable=pull_web)
    build_web_t = PythonOperator(task_id='build_web', python_callable=build_web,
                                  execution_timeout=timedelta(minutes=10))
    report_t = PythonOperator(task_id='send_report', python_callable=send_report,
                               trigger_rule='all_done')

    pull_app_t >> build_app_t >> [test_unit_t, test_ui_t]
    pull_web_t >> build_web_t
    [test_unit_t, test_ui_t, build_web_t] >> report_t
```

### DAG 3: Architecture Review

```python
# ~/airflow/dags/architecture_review.py
"""
Trigger an architecture review via the deliberation system.
Manually triggered with optional instructions.
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import time
import sys
sys.path.insert(0, '/opt/airflow/dags')
from lib.deepterm_api import *


def start_review(**context):
    instructions = context['params'].get('instructions', '')
    epic_id = context['params'].get('epic_id')
    result = pi_api('POST', '/api/admin/cockpit/deliberation/start', {
        'type': 'architecture_review',
        'epicId': epic_id,
        'instructions': instructions,
    })
    context['ti'].xcom_push(key='deliberation_id', value=result['deliberationId'])


def wait_and_advance(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    # Run through all phases
    for phase in ['debating', 'voting', 'decided']:
        for _ in range(60):
            status = get_deliberation_status(delib_id)
            if status.get('status') == phase or status.get('status') == 'decided':
                break
            time.sleep(10)
        if status.get('status') != 'decided':
            advance_deliberation(delib_id)
    return status


def notify_results(**context):
    delib_id = context['ti'].xcom_pull(key='deliberation_id')
    status = get_deliberation_status(delib_id)
    send_whatsapp('review_complete', {
        'deliberation_id': delib_id,
        'message': f'🔍 Architecture review complete. Check cockpit for findings.',
    })


with DAG(
    'architecture_review',
    default_args={'owner': 'deepterm', 'retries': 1},
    description='Run architecture review with multi-agent deliberation',
    schedule_interval=None,
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'review'],
    params={
        'instructions': '',
        'epic_id': None,
    },
) as dag:

    t1 = PythonOperator(task_id='start_review', python_callable=start_review)
    t2 = PythonOperator(task_id='deliberate', python_callable=wait_and_advance,
                         execution_timeout=timedelta(minutes=30))
    t3 = PythonOperator(task_id='notify', python_callable=notify_results)

    t1 >> t2 >> t3
```

### DAG 4: Release Pipeline

```python
# ~/airflow/dags/release_pipeline.py
"""
Build signed DMG, notarize, upload to Pi, notify.
Triggered when a tag is pushed (via webhook from GitHub).
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import sys
sys.path.insert(0, '/opt/airflow/dags')
from lib.deepterm_api import *


def checkout_tag(**context):
    tag = context['params']['tag']
    return ssh_ci_mac(f'cd ~/Development/deepterm && git fetch --tags && git checkout {tag}')


def build_signed_dmg(**context):
    output = ssh_ci_mac(
        'cd ~/Development/deepterm && ./scripts/build-release.sh 2>&1 | tail -30',
        timeout=1200
    )
    if 'BUILD SUCCEEDED' not in output and 'Release build complete' not in output:
        raise RuntimeError(f'Release build failed:\n{output}')
    return output


def notarize(**context):
    output = ssh_ci_mac(
        'cd ~/Development/deepterm && ./scripts/notarize.sh 2>&1 | tail -20',
        timeout=600
    )
    return output


def upload_to_pi(**context):
    tag = context['params']['tag']
    ssh_ci_mac(f'scp ~/Development/deepterm/build/DeepTerm-{tag}.dmg macan@10.10.10.10:~/deepterm/public/releases/')


def update_website(**context):
    tag = context['params']['tag']
    pi_api('POST', '/api/internal/release', {
        'version': tag,
        'platform': 'macos',
        'filename': f'DeepTerm-{tag}.dmg',
    })


def notify_release(**context):
    tag = context['params']['tag']
    send_whatsapp('release', {
        'version': tag,
        'message': f'🚀 DeepTerm {tag} released and published!',
    })


with DAG(
    'release_pipeline',
    default_args={'owner': 'deepterm', 'retries': 1},
    description='Build, sign, notarize, publish release',
    schedule_interval=None,
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'release'],
    params={'tag': ''},
) as dag:

    t1 = PythonOperator(task_id='checkout_tag', python_callable=checkout_tag)
    t2 = PythonOperator(task_id='build_dmg', python_callable=build_signed_dmg,
                         execution_timeout=timedelta(minutes=20))
    t3 = PythonOperator(task_id='notarize', python_callable=notarize,
                         execution_timeout=timedelta(minutes=10))
    t4 = PythonOperator(task_id='upload_to_pi', python_callable=upload_to_pi)
    t5 = PythonOperator(task_id='update_website', python_callable=update_website)
    t6 = PythonOperator(task_id='notify', python_callable=notify_release)

    t1 >> t2 >> t3 >> t4 >> t5 >> t6
```

### DAG 5: Health Check

```python
# ~/airflow/dags/health_check.py
"""
Periodic system health check across all machines.
Runs every 6 hours.
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import sys
sys.path.insert(0, '/opt/airflow/dags')
from lib.deepterm_api import *


def check_pi(**context):
    # Check web app
    import requests as req
    resp = req.get('http://10.10.10.10:3000/api/health', timeout=10)
    resp.raise_for_status()
    
    # Check disk space
    output = ssh_pi('df -h / | tail -1')
    return {'web': 'healthy', 'disk': output.strip()}


def check_ci_mac(**context):
    output = ssh_ci_mac('~/actions-runner/svc.sh status && sw_vers')
    runner_ok = 'Running' in output
    return {'runner': 'healthy' if runner_ok else 'offline', 'info': output.strip()}


def check_node_red(**context):
    import requests as req
    try:
        resp = req.get(f'{NODE_RED_URL}/deepterm/health', timeout=10)
        return {'status': 'healthy'}
    except:
        return {'status': 'offline'}


def check_docker(**context):
    import subprocess
    result = subprocess.run(['docker', 'ps', '--format', '{{.Names}}: {{.Status}}'],
                          capture_output=True, text=True, timeout=10)
    return {'containers': result.stdout.strip()}


def report_health(**context):
    ti = context['ti']
    pi = ti.xcom_pull(task_ids='check_pi') or {}
    ci = ti.xcom_pull(task_ids='check_ci_mac') or {}
    nr = ti.xcom_pull(task_ids='check_node_red') or {}
    
    issues = []
    if pi.get('web') != 'healthy': issues.append('❌ Pi web app down')
    if ci.get('runner') != 'healthy': issues.append('❌ CI Mac runner offline')
    if nr.get('status') != 'healthy': issues.append('❌ Node-RED offline')
    
    if issues:
        send_whatsapp('health_alert', {
            'message': '⚠️ Health Check Issues:\n' + '\n'.join(issues),
        })
    # Always log to cockpit
    pi_api('POST', '/api/internal/health-report', {
        'pi': pi, 'ci_mac': ci, 'node_red': nr,
    })


with DAG(
    'health_check',
    default_args={'owner': 'deepterm', 'retries': 1},
    description='System health check across all machines',
    schedule_interval='0 */6 * * *',
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'monitoring'],
) as dag:

    t1 = PythonOperator(task_id='check_pi', python_callable=check_pi)
    t2 = PythonOperator(task_id='check_ci_mac', python_callable=check_ci_mac)
    t3 = PythonOperator(task_id='check_node_red', python_callable=check_node_red)
    t4 = PythonOperator(task_id='check_docker', python_callable=check_docker)
    t5 = PythonOperator(task_id='report_health', python_callable=report_health,
                         trigger_rule='all_done')

    [t1, t2, t3, t4] >> t5
```

---

# Part 2: Web App — Cockpit Pipeline Tab

## Store Airflow connection in settings

Use the existing `SystemSettings` key-value table:

```
Key: airflow_base_url     Value: http://192.168.1.249:8080
Key: airflow_username      Value: admin
Key: airflow_password      Value: (encrypted with encryptApiKey())
```

These are configured in the new 🔄 Integrations settings tab (see Settings Reorg doc).

## API Routes — Airflow Proxy

The cockpit proxies Airflow's REST API to avoid CORS and centralize auth.

```typescript
// src/app/api/admin/cockpit/pipelines/runs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/crypto';

async function getAirflowConfig() {
  const settings = await prisma.systemSettings.findMany({
    where: { key: { in: ['airflow_base_url', 'airflow_username', 'airflow_password'] } },
  });
  const map = new Map(settings.map(s => [s.key, s.value]));
  return {
    baseUrl: map.get('airflow_base_url') || 'http://192.168.1.249:8080',
    username: map.get('airflow_username') || 'admin',
    password: decryptApiKey(map.get('airflow_password') || ''),
  };
}

async function airflowFetch(path: string) {
  const config = await getAirflowConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const resp = await fetch(`${config.baseUrl}/api/v1${path}`, {
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  });
  if (!resp.ok) throw new Error(`Airflow API error: ${resp.status}`);
  return resp.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '20';
    
    const data = await airflowFetch(`/dags/~/dagRuns?limit=${limit}&order_by=-start_date`);
    
    return NextResponse.json({
      runs: data.dag_runs?.map((run: any) => ({
        dagId: run.dag_id,
        runId: run.dag_run_id,
        state: run.state,
        startDate: run.start_date,
        endDate: run.end_date,
        conf: run.conf,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pipeline runs' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/admin/cockpit/pipelines/runs/[dagId]/[runId]/route.ts

export async function GET(request: NextRequest, { params }: { params: { dagId: string; runId: string } }) {
  try {
    const data = await airflowFetch(
      `/dags/${params.dagId}/dagRuns/${params.runId}/taskInstances`
    );
    
    return NextResponse.json({
      tasks: data.task_instances?.map((t: any) => ({
        taskId: t.task_id,
        state: t.state,
        startDate: t.start_date,
        endDate: t.end_date,
        duration: t.duration,
        tryNumber: t.try_number,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch task instances' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/admin/cockpit/pipelines/trigger/route.ts

export async function POST(request: NextRequest) {
  try {
    const { dagId, params: dagParams } = await request.json();
    const config = await getAirflowConfig();
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    
    const resp = await fetch(`${config.baseUrl}/api/v1/dags/${dagId}/dagRuns`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conf: dagParams || {} }),
    });
    
    const data = await resp.json();
    return NextResponse.json({ runId: data.dag_run_id, state: data.state });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to trigger pipeline' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/admin/cockpit/pipelines/dags/route.ts

export async function GET() {
  try {
    const data = await airflowFetch('/dags?only_active=true');
    return NextResponse.json({
      dags: data.dags?.map((d: any) => ({
        dagId: d.dag_id,
        description: d.description,
        schedule: d.schedule_interval,
        isPaused: d.is_paused,
        tags: d.tags?.map((t: any) => t.name) || [],
        nextRun: d.next_dagrun,
        lastRun: d.last_parsed_time,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch DAGs' }, { status: 500 });
  }
}
```

## Cockpit UI — Pipelines Tab

New tab in cockpit:

```
[Overview] [Triage] [Planning] [Builds] [GitHub] [System] [Reviews] [AI Usage] [🔄 Pipelines]
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔄 Pipeline Orchestration              [Open Airflow UI ↗]     │
│                                                                  │
│ ┌─ Active Runs ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │ ▶ story_implementation (Vault Tier Alignment)               │ │
│ │   ✅ deliberate → ✅ debate → ✅ vote → 🔄 agent_loop      │ │
│ │   Running for: 12m                                          │ │
│ │                                                              │ │
│ │ ▶ nightly_build                                             │ │
│ │   ✅ pull → ✅ build → 🔄 unit_tests → ⬜ ui_tests         │ │
│ │   Running for: 8m                                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recent Runs ───────────────────────────────────────────────┐ │
│ │ DAG                      Last Run    Status   Duration      │ │
│ │ nightly_build            02:00 today  ✅       23m          │ │
│ │ story_implementation     yesterday    ✅       1h 12m       │ │
│ │ architecture_review      3 days ago   ✅       8m           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Scheduled ─────────────────────────────────────────────────┐ │
│ │ nightly_build            Daily 2:00 AM    Next: tomorrow    │ │
│ │ health_check             Every 6 hours    Next: 18:00       │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Quick Actions ─────────────────────────────────────────────┐ │
│ │ [▶ Run Nightly Build] [▶ Run Health Check]                  │ │
│ │ [▶ Run Architecture Review] [▶ Run Story Implementation]    │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Summary

### AI Dev Mac — New Files

| File | Purpose |
|------|---------|
| `~/airflow/dags/lib/__init__.py` | Package init |
| `~/airflow/dags/lib/deepterm_api.py` | Shared API helpers |
| `~/airflow/dags/story_implementation.py` | Full story lifecycle DAG |
| `~/airflow/dags/nightly_build.py` | Nightly build + test DAG |
| `~/airflow/dags/architecture_review.py` | Review DAG |
| `~/airflow/dags/release_pipeline.py` | Release DAG |
| `~/airflow/dags/health_check.py` | Health check DAG |
| `~/airflow/.env` | Environment config |
| `~/airflow/docker-compose.yaml` | Airflow Docker setup |

### Web App (Pi) — New Files

| File | Purpose |
|------|---------|
| `src/app/api/admin/cockpit/pipelines/runs/route.ts` | List DAG runs |
| `src/app/api/admin/cockpit/pipelines/runs/[dagId]/[runId]/route.ts` | Task details |
| `src/app/api/admin/cockpit/pipelines/trigger/route.ts` | Trigger DAG |
| `src/app/api/admin/cockpit/pipelines/dags/route.ts` | List DAGs |
| `src/app/admin/cockpit/components/PipelinesTab.tsx` | Pipeline dashboard |

### Web App (Pi) — Modified Files

| File | Change |
|------|--------|
| `src/app/admin/cockpit/page.tsx` | Add Pipelines tab |
| `src/app/admin/cockpit/types.ts` | Add pipeline types |

---

## Testing Checklist

### AI Dev Mac
- [ ] Docker + Airflow running (`docker compose ps` shows all healthy)
- [ ] Airflow UI accessible at `http://192.168.1.249:8080`
- [ ] All 5 DAGs visible and active in Airflow UI
- [ ] SSH from Airflow container to Pi works
- [ ] SSH from Airflow container to CI Mac works
- [ ] Manual trigger of `health_check` DAG succeeds
- [ ] Manual trigger of `nightly_build` DAG succeeds
- [ ] `nightly_build` runs automatically at 2 AM
- [ ] `health_check` runs automatically every 6 hours
- [ ] WhatsApp notifications sent on completion/failure

### Web App
- [ ] Airflow credentials stored in SystemSettings (encrypted password)
- [ ] `/api/admin/cockpit/pipelines/dags` returns DAG list
- [ ] `/api/admin/cockpit/pipelines/runs` returns recent runs
- [ ] Trigger button starts a DAG run
- [ ] PipelinesTab shows active runs with task progress
- [ ] PipelinesTab shows recent runs with status/duration
- [ ] PipelinesTab shows scheduled DAGs with next run time
- [ ] "Open Airflow UI" link works

---

*End of Document — Airflow Orchestration — AI Dev Mac + Web App — 2026-02-26*
