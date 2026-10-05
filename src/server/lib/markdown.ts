// Minimal hand-rolled Markdown -> HTML, enough for this project's README
// (headings, paragraphs, lists, links, images, bold/italic, code, fences).
// Not a full CommonMark renderer --- deliberately, so no new dependency is
// needed just to satisfy spec/invariants.test.ts's heading-order check
// (CLAUDE.md "Git hygiene and dependencies": a dependency needs a reason).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let inFence = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^ {0,3}```/.test(line)) {
      inFence = !inFence;
      html.push(inFence ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inFence) {
      html.push(escapeHtml(line));
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^ {0,3}[-*]\s+(.*)$/);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(listItem[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === "") {
      continue;
    }
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}
