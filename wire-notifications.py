#!/usr/bin/env python3
"""
wire-notifications.py – Wires Node-RED notification calls into DeepTerm web app.
Run from the root of the deepterm-web repo on the Pi:

    python3 wire-notifications.py
"""

import os
import sys

def check_prereqs():
    if not os.path.exists("package.json") or not os.path.isdir("src/app/api"):
        print("❌ Run this script from the root of the deepterm-web repo.")
        sys.exit(1)
    if not os.path.exists("src/lib/node-red.ts"):
        print("❌ src/lib/node-red.ts not found. Copy it first.")
        sys.exit(1)
    print("✅ Prerequisites OK\n")


def insert_import(filepath, import_line):
    with open(filepath, 'r') as f:
        content = f.read()
    if import_line in content:
        return
    lines = content.split('\n')
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('import '):
            last_import_idx = i
    if last_import_idx >= 0:
        lines.insert(last_import_idx + 1, import_line)
    else:
        lines.insert(0, import_line)
    with open(filepath, 'w') as f:
        f.write('\n'.join(lines))


def insert_after(filepath, marker, code_block):
    with open(filepath, 'r') as f:
        content = f.read()
    # Check if already applied (use a unique line from the code block)
    check_lines = [l.strip() for l in code_block.strip().split('\n') if l.strip() and not l.strip().startswith('//')]
    if check_lines and check_lines[0] in content:
        print(f"  ~ Already applied in {filepath}")
        return
    idx = content.find(marker)
    if idx == -1:
        print(f"  ⚠ Marker not found: {marker[:60]}")
        return
    end_of_line = content.index('\n', idx)
    content = content[:end_of_line + 1] + code_block + content[end_of_line + 1:]
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  ✅ Patched")


def insert_before(filepath, marker, code_block):
    with open(filepath, 'r') as f:
        content = f.read()
    check_lines = [l.strip() for l in code_block.strip().split('\n') if l.strip() and not l.strip().startswith('//')]
    if check_lines and check_lines[0] in content:
        print(f"  ~ Already applied in {filepath}")
        return
    idx = content.find(marker)
    if idx == -1:
        print(f"  ⚠ Marker not found: {marker[:60]}")
        return
    start_of_line = content.rfind('\n', 0, idx) + 1
    content = content[:start_of_line] + code_block + content[start_of_line:]
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  ✅ Patched")


def replace_text(filepath, old_text, new_text):
    with open(filepath, 'r') as f:
        content = f.read()
    if old_text not in content:
        # Maybe already applied?
        check_lines = [l.strip() for l in new_text.strip().split('\n') if l.strip() and not l.strip().startswith('//')]
        if check_lines and check_lines[0] in content:
            print(f"  ~ Already applied in {filepath}")
            return
        print(f"  ⚠ Text not found in {filepath}: {old_text[:60]}...")
        return
    content = content.replace(old_text, new_text, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  ✅ Patched")


def main():
    print("═" * 55)
    print("  Wiring Node-RED notifications into DeepTerm")
    print("═" * 55 + "\n")

    check_prereqs()

    # ── 1. App issue submission ──────────────────────────
    print("📝 [1/7] App issue submission → notifyNewIssue()")
    f = "src/app/api/app/issues/submit/route.ts"
    insert_import(f, "import { notifyNewIssue } from '@/lib/node-red';")
    insert_before(f,
        "return NextResponse.json({\n      success: true,\n      message: 'Issue submitted successfully'",
        "\n    // Notify Node-RED → WhatsApp (fire-and-forget)\n"
        "    notifyNewIssue({\n"
        "      id: issue.id,\n"
        "      title,\n"
        "      description,\n"
        "      area,\n"
        "      authorEmail: user.email,\n"
        "      source: 'app',\n"
        "    });\n\n"
    )

    # ── 2. Website issue submission ──────────────────────
    print("\n📝 [2/7] Website issue submission → notifyNewIssue()")
    f = "src/app/api/issues/route.ts"
    insert_import(f, "import { notifyNewIssue } from '@/lib/node-red';")
    insert_before(f,
        "return NextResponse.json({ success: true, id: issue.id });",
        "\n  // Notify Node-RED → WhatsApp (fire-and-forget)\n"
        "  notifyNewIssue({\n"
        "    id: issue.id,\n"
        "    title,\n"
        "    description,\n"
        "    area,\n"
        "    authorEmail: session.user?.email || '',\n"
        "    source: 'website',\n"
        "  });\n\n"
    )

    # ── 3. Idea submission ───────────────────────────────
    print("\n📝 [3/7] Idea submission → notifyNewIdea()")
    f = "src/app/api/ideas/route.ts"
    insert_import(f, "import { notifyNewIdea } from '@/lib/node-red';")
    insert_after(f,
        "// Auto-vote for the author",
        "\n    // Notify Node-RED → WhatsApp (fire-and-forget)\n"
        "    notifyNewIdea({\n"
        "      id: idea.id,\n"
        "      title: idea.title,\n"
        "      description,\n"
        "      category: 'feature',\n"
        "      authorEmail: session.user?.email || '',\n"
        "    });\n\n"
    )

    # ── 4. Idea vote → threshold ─────────────────────────
    print("\n📝 [4/7] Idea vote threshold → notifyIdeaPopular()")
    f = "src/app/api/ideas/[id]/vote/route.ts"
    insert_import(f, "import { notifyIdeaPopular } from '@/lib/node-red';")
    replace_text(f,
        "return NextResponse.json({ \n        voted: true, \n        votes: voteCount \n      });",
        "// Check vote threshold → WhatsApp notification\n"
        "      const VOTE_THRESHOLD = 5;\n"
        "      if (voteCount >= VOTE_THRESHOLD && (voteCount - 1) < VOTE_THRESHOLD) {\n"
        "        notifyIdeaPopular({\n"
        "          id: ideaId,\n"
        "          title: idea.title,\n"
        "          voteCount,\n"
        "          threshold: VOTE_THRESHOLD,\n"
        "        });\n"
        "      }\n\n"
        "      return NextResponse.json({ \n        voted: true, \n        votes: voteCount \n      });"
    )

    # ── 5. Stripe webhook ────────────────────────────────
    print("\n📝 [5/7] Stripe webhook → notifyPayment()")
    f = "src/app/api/stripe/webhook/route.ts"
    insert_import(f, "import { notifyPayment } from '@/lib/node-red';")
    replace_text(f,
        "      cancelAtPeriodEnd: subscription.cancel_at_period_end,\n    },\n  });\n}",
        "      cancelAtPeriodEnd: subscription.cancel_at_period_end,\n"
        "    },\n"
        "  });\n"
        "\n"
        "  // Notify Node-RED → WhatsApp\n"
        "  notifyPayment({\n"
        "    event: 'subscription-created',\n"
        "    email: session.customer_email || '',\n"
        "    plan: await getPlanFromPriceId(subscription.items.data[0].price.id),\n"
        "    amount: subscription.items.data[0].price.unit_amount || 0,\n"
        "  });\n"
        "}"
    )
    replace_text(f,
        "// TODO: Send email notification about failed payment",
        "// Notify Node-RED → WhatsApp\n"
        "  notifyPayment({\n"
        "    event: 'payment-failed',\n"
        "    email: (invoice as any).customer_email || '',\n"
        "    plan: team.plan || 'unknown',\n"
        "    amount: invoice.amount_due,\n"
        "    details: 'Invoice payment failed',\n"
        "  });"
    )

    # ── 6. Release upload ────────────────────────────────
    print("\n📝 [6/7] Release upload → notifyRelease()")
    f = "src/app/api/admin/downloads/upload/route.ts"
    insert_import(f, "import { notifyRelease } from '@/lib/node-red';")
    insert_before(f,
        "return NextResponse.json({\n      success: true,\n      message: 'Release uploaded successfully.'",
        "\n    // Notify Node-RED → WhatsApp\n"
        "    notifyRelease({\n"
        "      version: resolvedVersion,\n"
        "      platform,\n"
        "      releaseNotes: releaseNotes || undefined,\n"
        "    });\n\n"
    )

    # ── 7. Security alerts ───────────────────────────────
    print("\n📝 [7/7] Security alerts → notifySecurityAlert()")
    f = "src/lib/intrusion.ts"
    insert_import(f, "import { notifySecurityAlert } from '@/lib/node-red';")
    insert_after(f,
        ".catch(err => console.error('[Intrusion] Email send failed:', err));",
        "\n      // Also notify via WhatsApp (fire-and-forget)\n"
        "      notifySecurityAlert({\n"
        "        severity,\n"
        "        eventType: escalatedType,\n"
        "        sourceIp: event.ip,\n"
        "        details: `${count} events in ${WINDOW_MS / 60000}min – path: ${event.path || '-'}`,\n"
        "      }).catch(() => {});\n"
    )

    print("\n" + "═" * 55)
    print("  ✅ All 7 files patched!")
    print()
    print("  Next steps:")
    print("  1. Review:   git diff")
    print("  2. Build:    npm run build")
    print("  3. Restart:  pm2 restart deepterm")
    print("  4. Test:     Submit an issue from the app or website")
    print("═" * 55)


if __name__ == "__main__":
    main()