export async function fetchRandomQuote(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/quotes/random`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote API request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}