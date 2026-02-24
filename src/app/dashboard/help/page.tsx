import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const setting = await prisma.systemSettings.findUnique({ where: { key: 'helpPageContent' } });
  const content = (setting?.value || '').trim();
  const html = content
    ? sanitizeHtml(marked.parse(content) as string, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
        allowedAttributes: {
          a: ['href', 'name', 'target', 'rel'],
          img: ['src', 'alt', 'title'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
          a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
        },
      })
    : '';

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Help</h1>
        <p className="text-text-secondary">Information maintained by your admin</p>
      </div>

      <Card>
        {content ? (
          <div
            className="text-text-primary leading-relaxed space-y-3"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-text-secondary">No help content has been configured yet.</p>
        )}
      </Card>
    </div>
  );
}
