export async function createQuote(apiBaseUrl, payload) {
  const safePayload = {
    guild_id: String(payload.guild_id || payload.guildId || '0'),
    author: payload.author,
    context: payload.context,
    lines: payload.lines || [],
  };
  const response = await fetch(`${apiBaseUrl}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safePayload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getQuote(apiBaseUrl, quoteId) {
  const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function listGuildQuotes(apiBaseUrl, guildId, page = 1) {
  const response = await fetch(`${apiBaseUrl}/quotes/guild/${guildId}?page=${page}&per_page=5`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getLatestQuotes(apiBaseUrl, guildId) {
  const response = await fetch(`${apiBaseUrl}/quotes/guild/${guildId}?page=1&per_page=5`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteQuote(apiBaseUrl, quoteId) {
  const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) throw new Error(await response.text());
  return true;
}

export async function fetchGuildRandomQuote(apiBaseUrl, guildId) {
  const response = await fetch(`${apiBaseUrl}/quotes/guild/${guildId}/random`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function searchGuildQuotes(apiBaseUrl, guildId, query) {
  const response = await fetch(`${apiBaseUrl}/quotes/guild/${guildId}/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function editQuote(apiBaseUrl, quoteId, payload) {
  const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}