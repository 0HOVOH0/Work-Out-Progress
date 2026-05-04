const NOTION_VERSION = "2022-06-28";
const BACKUP_TITLE = "Gym Progress Cloud Backup";
const CHUNK_SIZE = 1800;

exports.handler = async event => {
  try {
    const token = process.env.NOTION_TOKEN;
    const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
    const syncSecret = process.env.SYNC_SECRET || "";

    if (!token || !parentPageId) {
      return json(500, {
        error: "Missing NOTION_TOKEN or NOTION_PARENT_PAGE_ID in Netlify environment variables."
      });
    }

    if (syncSecret && event.headers["x-sync-secret"] !== syncSecret) {
      return json(401, { error: "Invalid sync secret." });
    }

    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const page = await createBackupPage(token, parentPageId, data);
      return json(200, { ok: true, pageId: page.id, url: page.url });
    }

    if (event.httpMethod === "GET") {
      const page = await latestBackupPage(token);
      if (!page) return json(404, { error: "No Notion backup found." });
      const data = await readBackupPage(token, page.id);
      return json(200, { ok: true, pageId: page.id, data });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message || "Notion sync failed." });
  }
};

async function createBackupPage(token, parentPageId, data) {
  const now = new Date().toISOString();
  const serialized = JSON.stringify(data, null, 2);
  const chunks = chunkText(serialized);
  const initial = [
    paragraph(`Synced at ${now}`),
    paragraph(`Workouts: ${(data.workouts || []).length}, entries: ${(data.entries || []).length}, check-ins: ${(data.checkins || []).length}`)
  ].concat(chunks.slice(0, 85).map(codeBlock));

  const page = await notion(token, "/pages", {
    method: "POST",
    body: {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ text: { content: `${BACKUP_TITLE} ${now.slice(0, 19)}` } }]
        }
      },
      children: initial
    }
  });

  for (let index = 85; index < chunks.length; index += 90) {
    await notion(token, `/blocks/${page.id}/children`, {
      method: "PATCH",
      body: { children: chunks.slice(index, index + 90).map(codeBlock) }
    });
  }

  return page;
}

async function latestBackupPage(token) {
  const result = await notion(token, "/search", {
    method: "POST",
    body: {
      query: BACKUP_TITLE,
      sort: { direction: "descending", timestamp: "last_edited_time" },
      filter: { value: "page", property: "object" },
      page_size: 10
    }
  });
  return (result.results || []).find(page => plainTitle(page).startsWith(BACKUP_TITLE));
}

async function readBackupPage(token, pageId) {
  const blocks = [];
  let cursor;
  do {
    const path = `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const result = await notion(token, path, { method: "GET" });
    blocks.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : "";
  } while (cursor);

  const jsonText = blocks
    .filter(block => block.type === "code")
    .map(block => (block.code.rich_text || []).map(text => text.plain_text || "").join(""))
    .join("");

  if (!jsonText) throw new Error("Backup page does not contain JSON data.");
  return JSON.parse(jsonText);
}

async function notion(token, path, options) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Notion API error ${response.status}`);
  return body;
}

function chunkText(text) {
  const chunks = [];
  for (let index = 0; index < text.length; index += CHUNK_SIZE) {
    chunks.push(text.slice(index, index + CHUNK_SIZE));
  }
  return chunks;
}

function paragraph(content) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content } }] }
  };
}

function codeBlock(content) {
  return {
    object: "block",
    type: "code",
    code: {
      language: "json",
      rich_text: [{ type: "text", text: { content } }]
    }
  };
}

function plainTitle(page) {
  const prop = page.properties?.title || page.properties?.Name || page.properties?.Title;
  return (prop?.title || []).map(item => item.plain_text || "").join("");
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
