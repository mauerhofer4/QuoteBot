import 'dotenv/config';
import express from 'express';
import { ActivityType, Client } from 'discord.js';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { checkQuoteWriterRole } from './utils.js';
import {
  fetchRandomQuote,
  fetchAllQuotes,
  fetchLatestQuotes,
  searchQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
} from './botApi.js';

const app = express();
const PORT = process.env.PORT || 3000;

const API_BASE_URL = (() => {
  const configuredUrl = process.env.API_BASE_URL || 'http://localhost:8000';

  try {
    const url = new URL(configuredUrl);
    if (url.hostname === 'api') {
      url.hostname = 'localhost';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:8000';
  }
})();

const client = new Client({ intents: [] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'QuoteBot',
        type: ActivityType.Playing,
      },
    ],
  });
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord', error);
});

function getOption(data, optionName) {
  return data?.options?.find((opt) => opt.name === optionName)?.value;
}

function unauthorizedRoleResponse() {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Du brauchst die Rolle "Zitateschreiber" für diesen Befehl.',
      flags: 64,
    },
  };
}

function createQuoteEmbed(quote, title) {
  const footerParts = [`ID: ${quote.id}`];
  if (quote.created_at) {
    footerParts.push(new Date(quote.created_at).toLocaleString('de-AT'));
  }

  return {
    title,
    color: 0x2f3136,
    description: quote.text,
    fields: [
      {
        name: 'Name',
        value: quote.name || 'Unbekannt',
        inline: true,
      },
      {
        name: 'Erfasst von',
        value: quote.author || 'Unbekannt',
        inline: true,
      },
      {
        name: 'Nickname',
        value: quote.nickname || '-',
        inline: true,
      },
      {
        name: 'Context',
        value: quote.context || '-',
        inline: false,
      },
    ],
    footer: {
      text: footerParts.join(' | '),
    },
  };
}

function createListEmbed(title, quotes) {
  return {
    title,
    color: 0x2f3136,
    description: quotes
      .map((quote) => {
        const person = quote.nickname ? `${quote.name} (${quote.nickname})` : quote.name || 'Unbekannt';
        return `**#${quote.id}** ${quote.text}\n- ${person}`;
      })
      .join('\n\n'),
  };
}

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data, member } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    if (name === 'quoterandom') {
      try {
        const quote = await fetchRandomQuote(API_BASE_URL);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [createQuoteEmbed(quote, 'Zufaelliges Zitat')],
          },
        });
      } catch (error) {
        console.error('quoterandom command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Quote API ist gerade nicht erreichbar.',
          },
        });
      }
    }

    if (name === 'quoteadd') {
      if (!checkQuoteWriterRole(member)) {
        return res.send(unauthorizedRoleResponse());
      }

      try {
        const text = getOption(data, 'text');
        const nameOption = getOption(data, 'name');
        const context = getOption(data, 'context');
        const nickname = getOption(data, 'nickname');

        const creatorName = member?.user?.global_name || member?.user?.username || 'Unknown';
        const creatorId = member?.user?.id || null;

        const quote = await createQuote(API_BASE_URL, {
          text,
          name: nameOption,
          author: creatorName,
          nickname: nickname || null,
          context: context || null,
          creator_id: creatorId,
        });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [createQuoteEmbed(quote, 'Zitat hinzugefuegt')],
          },
        });
      } catch (error) {
        console.error('quoteadd command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to add quote: ${error.message}`,
            flags: 64,
          },
        });
      }
    }

    if (name === 'quotelist') {
      try {
        const quotes = await fetchAllQuotes(API_BASE_URL, 0, 10);

        if (quotes.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Keine Quotes vorhanden.',
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [createListEmbed('Quote Liste', quotes)],
          },
        });
      } catch (error) {
        console.error('quotelist command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to load quotes: ${error.message}`,
          },
        });
      }
    }

    if (name === 'quotelatest') {
      try {
        const quotes = await fetchLatestQuotes(API_BASE_URL, 5);

        if (quotes.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Keine Quotes vorhanden.',
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [createListEmbed('Neueste Quotes', quotes)],
          },
        });
      } catch (error) {
        console.error('quotelatest command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to load latest quotes: ${error.message}`,
          },
        });
      }
    }

    if (name === 'quotesearch') {
      try {
        const query = getOption(data, 'query');
        const searchType = getOption(data, 'type') || 'text';

        const quotes = await searchQuotes(API_BASE_URL, query, searchType);

        if (quotes.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Keine Treffer fuer "${query}".`,
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [createListEmbed(`Suche: ${query} (${searchType})`, quotes.slice(0, 10))],
          },
        });
      } catch (error) {
        console.error('quotesearch command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to search quotes: ${error.message}`,
          },
        });
      }
    }

    if (name === 'quoteedit') {
      if (!checkQuoteWriterRole(member)) {
        return res.send(unauthorizedRoleResponse());
      }

      const quoteId = getOption(data, 'id');

      try {
        const quote = await getQuoteById(API_BASE_URL, quoteId);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: {
            custom_id: `edit_quote_${quoteId}`,
            title: `Quote #${quoteId} bearbeiten`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'quote_text',
                    label: 'Zitat Text',
                    style: 2,
                    value: quote.text || '',
                    required: true,
                    max_length: 4000,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'quote_name',
                    label: 'Name (wer es gesagt hat)',
                    style: 1,
                    value: quote.name || '',
                    required: true,
                    max_length: 120,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'quote_nickname',
                    label: 'Nickname (optional)',
                    style: 1,
                    value: quote.nickname || '',
                    required: false,
                    max_length: 120,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'quote_context',
                    label: 'Context (optional)',
                    style: 2,
                    value: quote.context || '',
                    required: false,
                    max_length: 1000,
                  },
                ],
              },
            ],
          },
        });
      } catch (error) {
        console.error('quoteedit command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Quote #${quoteId} wurde nicht gefunden.`,
            flags: 64,
          },
        });
      }
    }

    if (name === 'quotedelete') {
      if (!checkQuoteWriterRole(member)) {
        return res.send(unauthorizedRoleResponse());
      }

      const quoteId = getOption(data, 'id');

      try {
        await deleteQuote(API_BASE_URL, quoteId);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Quote #${quoteId} wurde geloescht.`,
          },
        });
      } catch (error) {
        console.error('quotedelete command failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to delete quote: ${error.message}`,
            flags: 64,
          },
        });
      }
    }

    return res.status(400).json({ error: `unknown command: ${name}` });
  }

  if (type === InteractionType.MODAL_SUBMIT) {
    const { custom_id } = data;

    if (custom_id.startsWith('edit_quote_')) {
      try {
        const quoteId = Number.parseInt(custom_id.split('_')[2], 10);
        const textValue = data.components.find((row) => row.components[0].custom_id === 'quote_text')?.components?.[0]?.value;
        const nameValue = data.components.find((row) => row.components[0].custom_id === 'quote_name')?.components?.[0]?.value;
        const nicknameValue = data.components.find((row) => row.components[0].custom_id === 'quote_nickname')?.components?.[0]?.value;
        const contextValue = data.components.find((row) => row.components[0].custom_id === 'quote_context')?.components?.[0]?.value;

        await updateQuote(API_BASE_URL, quoteId, {
          text: textValue,
          name: nameValue,
          nickname: nicknameValue || null,
          context: contextValue || null,
        });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Quote #${quoteId} wurde aktualisiert.`,
            flags: 64,
          },
        });
      } catch (error) {
        console.error('edit quote modal failed', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Failed to update quote: ${error.message}`,
            flags: 64,
          },
        });
      }
    }

    return res.status(400).json({ error: `unknown modal: ${custom_id}` });
  }

  return res.status(400).json({ error: `unknown interaction type: ${type}` });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
