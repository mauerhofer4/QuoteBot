export async function fetchRandomQuote(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/quotes/random`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchAllQuotes(apiBaseUrl, skip = 0, limit = 10) {
  const response = await fetch(`${apiBaseUrl}/quotes?skip=${skip}&limit=${limit}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchLatestQuotes(apiBaseUrl, limit = 5) {
  const response = await fetch(`${apiBaseUrl}/quotes/latest?limit=${limit}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function searchQuotes(apiBaseUrl, query, searchType = 'text') {
  const response = await fetch(`${apiBaseUrl}/quotes/search?query=${encodeURIComponent(query)}&search_type=${searchType}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getQuoteById(apiBaseUrl, quoteId) {
  const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function createQuote(apiBaseUrl, quoteData) {
  const response = await fetch(`${apiBaseUrl}/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...quoteData,
      quotetext: quoteData.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function updateQuote(apiBaseUrl, quoteId, quoteData) {
  const payload = {
    ...quoteData,
    quotetext: quoteData.text,
  };

  const methods = ['PUT', 'PATCH'];

  let lastError = null;

  for (const method of methods) {
    const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return response.status === 204 ? null : response.json();
    }

    const errorText = await response.text();
    lastError = new Error(`Quote API request failed (${response.status}): ${errorText}`);

    if (response.status !== 405) {
      throw lastError;
    }
  }

  throw lastError || new Error('Quote API update failed');
}

export async function deleteQuote(apiBaseUrl, quoteId) {
  const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.ok;
}